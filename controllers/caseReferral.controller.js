import CaseReferral, {
  CASE_TYPE_OPTIONS,
  OCCUPATION_OPTIONS,
  RELATIONSHIP_OPTIONS,
} from "../models/CaseReferral.js";
import Chapter from "../models/Chapter.js";
import User from "../models/User.js";
import DocumentationFile from "../models/DocumentationFile.js";
import Notification from "../models/Notification.js";
import { sendEmail } from "../utils/email.js";
import { buildNotificationEmailTemplate, escapeHtml } from "../utils/emailTemplates.js";

const CASE_TYPE_TO_DOC = {
  Health: "health",
  Marriage: "marriage",
  Fee: "fee",
  Ration: "ration",
  Emergency: "health",
  Other: "reference",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapDocType(caseType) {
  return CASE_TYPE_TO_DOC[caseType] || "reference";
}

function canManageCaseReferrals(user) {
  const role = user?.chapterRole || user?.systemRole;
  if (["ceo", "founder", "cto", "coo", "bog_documentation"].includes(user?.systemRole)) {
    return true;
  }
  if (user?.systemRole === "president") return true;
  return ["president", "vice_president", "documentation_head", "verification_head"].includes(role);
}

function chapterIdOf(user) {
  if (!user?.chapter) return null;
  return user.chapter._id || user.chapter;
}

async function chapterLeadershipRecipients(chapterId) {
  const users = await User.find({
    chapter: chapterId,
    isActive: { $ne: false },
    $or: [
      { systemRole: "president" },
      { chapterRole: "president" },
      { chapterRole: "vice_president" },
      { chapterRole: "documentation_head" },
    ],
  })
    .select("_id name email chapterRole systemRole")
    .lean();

  const seen = new Set();
  return users.filter((u) => {
    const id = String(u._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildCaseVerifiedEmail({ verifierName, familyName, caseType, chapterName }) {
  const subject = `Your case request was verified — ${chapterName}`;
  const safeName = escapeHtml(verifierName);
  const safeFamily = escapeHtml(familyName);
  const safeType = escapeHtml(caseType);
  const safeChapter = escapeHtml(chapterName);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#234a8f">Case verified</h2>
      <p>Dear ${safeName},</p>
      <p>Your support request for <strong>${safeFamily}</strong> (${safeType}) submitted to
      <strong>${safeChapter}</strong> has been <strong>verified</strong> by the chapter team.</p>
      <p>They may contact you for next steps. Thank you for referring this family to Serve Humanity.</p>
      <p style="color:#6b7280;font-size:13px">— Serve Humanity</p>
    </div>
  `;
  const text = `Dear ${verifierName},\n\nYour support request for ${familyName} (${caseType}) submitted to ${chapterName} has been verified.\n\n— Serve Humanity`;
  return { subject, html, text };
}

/**
 * Public case / assistance registration.
 * POST /case-referrals
 */
export async function submitCaseReferral(req, res, next) {
  try {
    const {
      chapterId,
      verifierName,
      verifierCity,
      verifierPhone,
      verifierEmail,
      currentlyDoing,
      relationship,
      familyName,
      familyCity,
      familyPhone,
      caseType,
      helpNeeded,
      helpNeededWithinDays,
    } = req.body || {};

    if (!chapterId) {
      return res.status(400).json({ success: false, message: "Please select a chapter." });
    }
    if (!verifierName?.trim() || !verifierCity?.trim() || !verifierPhone?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Reference / verifier name, city, and phone are required.",
      });
    }
    const email = String(verifierEmail || "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required so we can update you when the case is verified.",
      });
    }
    if (!OCCUPATION_OPTIONS.includes(currentlyDoing)) {
      return res.status(400).json({ success: false, message: "Invalid occupation selection." });
    }
    if (!RELATIONSHIP_OPTIONS.includes(relationship)) {
      return res.status(400).json({ success: false, message: "Invalid relationship selection." });
    }
    if (!familyName?.trim() || !familyCity?.trim() || !familyPhone?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Deserving family name, city, and contact number are required.",
      });
    }
    if (!CASE_TYPE_OPTIONS.includes(caseType)) {
      return res.status(400).json({ success: false, message: "Invalid case type." });
    }
    if (!helpNeeded?.trim()) {
      return res.status(400).json({ success: false, message: "Type of help needed is required." });
    }
    const days = Number(helpNeededWithinDays);
    if (!Number.isFinite(days) || days < 1) {
      return res.status(400).json({
        success: false,
        message: "Help needed within (days) must be at least 1.",
      });
    }

    const chapter = await Chapter.findById(chapterId).select("name city status").lean();
    if (!chapter || chapter.status === "inactive") {
      return res.status(404).json({ success: false, message: "Chapter not found or inactive." });
    }

    const recipients = await chapterLeadershipRecipients(chapter._id);
    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "This chapter has no president, vice president, or documentation cabinet assigned yet. Please try another chapter or contact us.",
      });
    }

    const docOwner =
      recipients.find((u) => u.chapterRole === "documentation_head") ||
      recipients.find((u) => u.systemRole === "president" || u.chapterRole === "president") ||
      recipients.find((u) => u.chapterRole === "vice_president") ||
      recipients[0];

    const docCabinet =
      recipients.find((u) => u.chapterRole === "documentation_head") || null;

    const docType = mapDocType(caseType);
    const isCaseBoard = ["health", "marriage", "fee", "ration"].includes(docType);

    const fields = {
      source: "public_registration",
      caseTypeLabel: caseType,
      beneficiaryName: familyName.trim(),
      familyCity: familyCity.trim(),
      familyPhone: familyPhone.trim(),
      helpNeeded: helpNeeded.trim(),
      helpNeededWithinDays: days,
      ref1Name: verifierName.trim(),
      ref1Contact: verifierPhone.trim(),
      ref1Email: email,
      verifierCity: verifierCity.trim(),
      currentlyDoing,
      relationship,
    };

    const documentationFile = await DocumentationFile.create({
      type: docType,
      title: `${familyName.trim()} — ${caseType}`,
      caseNumber: "",
      chapter: chapter._id,
      fields,
      notes: [
        `Public registration via website.`,
        `Verifier: ${verifierName.trim()} (${currentlyDoing}, ${relationship}) — ${verifierCity.trim()} / ${verifierPhone.trim()} / ${email}.`,
        `Family: ${familyName.trim()} — ${familyCity.trim()} / ${familyPhone.trim()}.`,
        `Help: ${helpNeeded.trim()} within ${days} day(s).`,
      ].join("\n"),
      status: "submitted",
      approvalStatus: "pending",
      teamModule: "documentation",
      cabinetMember: docCabinet?._id || null,
      teamDirector: null,
      caseStatus: isCaseBoard ? "pending" : undefined,
      createdBy: docOwner._id,
      updatedBy: docOwner._id,
    });

    const referral = await CaseReferral.create({
      chapter: chapter._id,
      verifierName: verifierName.trim(),
      verifierCity: verifierCity.trim(),
      verifierPhone: verifierPhone.trim(),
      verifierEmail: email,
      currentlyDoing,
      relationship,
      familyName: familyName.trim(),
      familyCity: familyCity.trim(),
      familyPhone: familyPhone.trim(),
      caseType,
      helpNeeded: helpNeeded.trim(),
      helpNeededWithinDays: days,
      documentationFile: documentationFile._id,
      notifiedUserIds: recipients.map((u) => u._id),
    });

    const notifTitle = `New case registration — ${chapter.name}`;
    const notifBody = [
      `${verifierName.trim()} referred ${familyName.trim()} (${caseType}).`,
      `Help needed: ${helpNeeded.trim()}`,
      `Within: ${days} day(s)`,
      `Family contact: ${familyPhone.trim()} · ${familyCity.trim()}`,
      `Verifier: ${verifierPhone.trim()} · ${email} · ${verifierCity.trim()}`,
      `Open Case registrations to review and verify.`,
    ].join("\n");

    const notification = await Notification.create({
      title: notifTitle,
      body: notifBody,
      audience: "chapter_referral",
      priority: days <= 3 ? "urgent" : days <= 7 ? "high" : "normal",
      chapter: chapter._id,
      createdBy: docOwner._id,
      recipients: recipients.map((u) => ({
        user: u._id,
        email: u.email || "",
        readAt: null,
        dismissedAt: null,
        emailedAt: null,
        emailError: null,
      })),
    });

    for (let i = 0; i < notification.recipients.length; i++) {
      const recipient = notification.recipients[i];
      const user = recipients[i];
      if (!user?.email?.trim()) {
        recipient.emailError = "No email on file";
        continue;
      }
      try {
        const mail = buildNotificationEmailTemplate({
          title: notifTitle,
          body: notifBody,
          priority: notification.priority,
          recipientName: user.name,
        });
        const result = await sendEmail({
          to: user.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        if (result) {
          recipient.emailedAt = new Date();
          recipient.emailError = null;
        } else {
          recipient.emailError = "SMTP not configured";
        }
      } catch (err) {
        recipient.emailError = err?.message || "Failed to send email";
      }
    }
    await notification.save();

    res.status(201).json({
      success: true,
      message:
        "Registration submitted. The chapter president, vice president, and documentation team have been notified.",
      data: {
        id: referral._id,
        chapter: { _id: chapter._id, name: chapter.name, city: chapter.city },
        caseType,
        documentationFileId: documentationFile._id,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Chapter leadership + documentation / verification cabinet: list referrals.
 * GET /case-referrals
 */
export async function listCaseReferrals(req, res, next) {
  try {
    if (!canManageCaseReferrals(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const isBog = ["ceo", "founder", "cto", "coo", "bog_documentation"].includes(
      req.user.systemRole,
    );

    const filter = {};
    if (!isBog) {
      const cid = chapterIdOf(req.user);
      if (!cid) {
        return res.status(400).json({ success: false, message: "No chapter linked to your account." });
      }
      filter.chapter = cid;
    } else if (req.query.chapter) {
      filter.chapter = req.query.chapter;
    }

    if (req.query.status) filter.status = req.query.status;

    const rows = await CaseReferral.find(filter)
      .populate("chapter", "name city")
      .populate("documentationFile", "type title caseStatus approvalStatus")
      .populate("verifiedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark case verified and email the registrant (verifierEmail).
 * PATCH /case-referrals/:id/verify
 */
export async function verifyCaseReferral(req, res, next) {
  try {
    if (!canManageCaseReferrals(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const referral = await CaseReferral.findById(req.params.id).populate("chapter", "name city");
    if (!referral) {
      return res.status(404).json({ success: false, message: "Case registration not found." });
    }

    const isBog = ["ceo", "founder", "cto", "coo", "bog_documentation"].includes(
      req.user.systemRole,
    );
    if (!isBog) {
      const cid = chapterIdOf(req.user);
      if (!cid || String(referral.chapter._id || referral.chapter) !== String(cid)) {
        return res.status(403).json({ success: false, message: "This case is not in your chapter." });
      }
    }

    if (referral.status === "verified") {
      return res.status(400).json({
        success: false,
        message: "This case is already verified.",
      });
    }

    if (!referral.verifierEmail?.trim()) {
      return res.status(400).json({
        success: false,
        message: "This registration has no email on file, so verification mail cannot be sent.",
      });
    }

    const chapterName =
      (referral.chapter && typeof referral.chapter === "object" && referral.chapter.name) ||
      "your chapter";

    const mail = buildCaseVerifiedEmail({
      verifierName: referral.verifierName,
      familyName: referral.familyName,
      caseType: referral.caseType,
      chapterName,
    });

    let emailError = null;
    try {
      const result = await sendEmail({
        to: referral.verifierEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      if (!result) {
        emailError = "SMTP not configured (check SMTP settings). Case was still marked verified.";
      }
    } catch (err) {
      emailError = err?.message || "Failed to send email";
    }

    referral.status = "verified";
    referral.verifiedBy = req.user._id;
    referral.verifiedAt = new Date();
    if (!emailError) referral.verificationEmailSentAt = new Date();
    await referral.save();

    if (referral.documentationFile) {
      await DocumentationFile.findByIdAndUpdate(referral.documentationFile, {
        $set: {
          approvalStatus: "approved",
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
          reviewNote: "Verified from Case registrations",
        },
      }).catch(() => {});
    }

    const populated = await CaseReferral.findById(referral._id)
      .populate("chapter", "name city")
      .populate("verifiedBy", "name email")
      .populate("documentationFile", "type title caseStatus approvalStatus")
      .lean();

    res.json({
      success: true,
      message: emailError
        ? `Case verified, but email could not be sent: ${emailError}`
        : `Case verified. Confirmation email sent to ${referral.verifierEmail}.`,
      data: populated,
      meta: { emailSent: !emailError, emailError },
    });
  } catch (err) {
    next(err);
  }
}

export async function getCaseReferralOptions(_req, res) {
  res.json({
    success: true,
    data: {
      occupations: OCCUPATION_OPTIONS,
      relationships: RELATIONSHIP_OPTIONS,
      caseTypes: CASE_TYPE_OPTIONS,
    },
  });
}
