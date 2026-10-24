import jwt from "jsonwebtoken";
import crypto from "crypto";
import User, { JOINABLE_CABINET_ROLES } from "../models/User.js";
import Chapter from "../models/Chapter.js";
import Notification from "../models/Notification.js";
import { sendEmail } from "../utils/email.js";
import { buildPasswordResetEmail, buildNotificationEmailTemplate } from "../utils/emailTemplates.js";

const TEAM_LABEL = {
  operations_head: "Operations",
  verification_head: "Verification",
  media_head: "Media & Graphics",
  finance_head: "Finance",
  documentation_head: "Documentation",
};

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
}

async function loadAuthUser(userId) {
  return User.findById(userId)
    .select("-password")
    .populate("chapter", "name city")
    .populate("cabinetMember", "name email chapterRole")
    .populate("teamDirector", "name email chapterRole");
}

async function sendToken(user, statusCode, res) {
  const token = signToken(user._id);
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  const populated = await loadAuthUser(user._id);
  res.status(statusCode).json({ success: true, token, user: populated });
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateResetCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function findJoinApprovers(chapterId, requestedCabinetRole) {
  const leadershipRoles = ["president", "vice_president", "vice_president_male"];
  const cabinetRoles = requestedCabinetRole ? [requestedCabinetRole] : [];

  const byId = new Map();
  const active = {
    chapter: chapterId,
    isActive: { $ne: false },
    membershipStatus: { $nin: ["pending", "rejected"] },
  };

  const matches = await User.find({
    ...active,
    $or: [
      { chapterRole: { $in: [...leadershipRoles, ...cabinetRoles] } },
      { systemRole: "president" },
    ],
  })
    .select("name email chapterRole systemRole")
    .lean();

  for (const u of matches) byId.set(String(u._id), u);
  return [...byId.values()];
}

export async function register(req, res, next) {
  try {
    const { name, email, password, chapter, team, requestedCabinetRole } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }
    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }
    if (!chapter) {
      return res.status(400).json({
        success: false,
        message: "Please select a chapter.",
      });
    }

    const cabinetRole = String(requestedCabinetRole || team || "").trim();
    if (!JOINABLE_CABINET_ROLES.includes(cabinetRole)) {
      return res.status(400).json({
        success: false,
        message:
          "Please select a team (Verification, Operations, Documentation, Finance, or Media).",
      });
    }

    const chapterDoc = await Chapter.findById(chapter);
    if (!chapterDoc) {
      return res.status(400).json({ success: false, message: "Selected chapter was not found." });
    }
    if (chapterDoc.status && chapterDoc.status !== "active") {
      return res.status(400).json({ success: false, message: "Selected chapter is not active." });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    const user = await User.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password,
      systemRole: "member",
      chapterRole: "member",
      chapter: chapterDoc._id,
      cabinetMember: null,
      teamDirector: null,
      membershipStatus: "pending",
      requestedCabinetRole: cabinetRole,
      isActive: true,
    });

    const teamLabel = TEAM_LABEL[cabinetRole] || cabinetRole;
    const approvers = await findJoinApprovers(chapterDoc._id, cabinetRole);

    const notifTitle = `New member join request — ${chapterDoc.name}`;
    const notifBody = [
      `${user.name} (${user.email}) requested to join the ${teamLabel} team.`,
      `Chapter: ${chapterDoc.name}${chapterDoc.city ? ` (${chapterDoc.city})` : ""}.`,
      `This request goes to the president, both vice presidents, and the ${teamLabel} cabinet head.`,
      `Any one of them can approve. Until then, they cannot log in.`,
      `Open Team & Roles to approve or reject.`,
    ].join("\n");

    if (approvers.length > 0) {
      const notification = await Notification.create({
        title: notifTitle,
        body: notifBody,
        audience: "chapter_join",
        priority: "high",
        chapter: chapterDoc._id,
        createdBy: user._id,
        recipients: approvers.map((u) => ({
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
        const approver = approvers[i];
        if (!approver?.email?.trim()) {
          recipient.emailError = "No email on file";
          continue;
        }
        try {
          const mail = buildNotificationEmailTemplate({
            title: notifTitle,
            body: notifBody,
            priority: "high",
            recipientName: approver.name,
          });
          const result = await sendEmail({
            to: approver.email,
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
    }

    res.status(201).json({
      success: true,
      pendingApproval: true,
      message:
        "Registration submitted. Wait for the president, a vice president, or that team's cabinet head to approve before you can log in.",
      data: {
        email: user.email,
        chapter: { _id: chapterDoc._id, name: chapterDoc.name, city: chapterDoc.city },
        team: teamLabel,
        requestedCabinetRole: cabinetRole,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password are required." });

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ success: false, message: "Invalid credentials." });

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "This account has been deactivated. Contact your organization admin.",
      });
    }

    if (user.membershipStatus === "pending") {
      return res.status(403).json({
        success: false,
        message:
          "Your join request is still pending. The president, a vice president, or your team's cabinet head must approve it before you can log in.",
      });
    }

    if (user.membershipStatus === "rejected") {
      return res.status(403).json({
        success: false,
        message: "Your join request was rejected. Contact your chapter leadership for help.",
      });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    await sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
}

export function logout(_req, res) {
  res.cookie("token", "", { httpOnly: true, expires: new Date(0) });
  res.json({ success: true, message: "Logged out." });
}

export async function me(req, res) {
  res.json({ success: true, user: req.user });
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.matchPassword(currentPassword)))
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();
    await sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
}

/** POST /auth/forgot-password — { email } */
export async function forgotPassword(req, res, next) {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const generic = {
      success: true,
      message: "If an account exists for that email, a reset code has been sent.",
    };

    const user = await User.findOne({ email }).select(
      "+passwordResetToken +passwordResetExpires name email isActive",
    );

    if (!user || user.isActive === false) {
      return res.json(generic);
    }

    const code = generateResetCode();
    const expiresMinutes = 30;
    user.passwordResetToken = hashResetToken(code);
    user.passwordResetExpires = new Date(Date.now() + expiresMinutes * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const mail = buildPasswordResetEmail({
      name: user.name,
      code,
      expiresMinutes,
    });

    try {
      const result = await sendEmail({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: mail.attachments,
      });
      if (!result) {
        console.warn("Password reset email skipped — SMTP not configured.");
      }
    } catch (err) {
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      await user.save({ validateBeforeSave: false });
      console.error("Password reset email failed:", err?.message || err);
      return res.status(500).json({
        success: false,
        message: "Could not send reset email. Please try again later.",
      });
    }

    res.json(generic);
  } catch (err) {
    next(err);
  }
}

/** POST /auth/reset-password — { email, code, password } */
export async function resetPassword(req, res, next) {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    const code = String(req.body?.code || req.body?.token || "").replace(/\s+/g, "");
    const { password } = req.body || {};

    if (!email || !code || !password) {
      return res.status(400).json({
        success: false,
        message: "Email, reset code, and new password are required.",
      });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: "Reset code must be 6 digits.",
      });
    }
    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const hashed = hashResetToken(code);
    const user = await User.findOne({
      email,
      passwordResetToken: hashed,
      passwordResetExpires: { $gt: new Date() },
    }).select("+password +passwordResetToken +passwordResetExpires");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Reset code is invalid or has expired. Please request a new one.",
      });
    }

    user.password = password;
    user.passwordChangedAt = new Date();
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({
      success: true,
      message: "Password updated. You can sign in with your new password.",
    });
  } catch (err) {
    next(err);
  }
}
