import TeamRecord, { TEAM_RECORD_KINDS } from "../models/TeamRecord.js";
import {
  applySubmissionListScope,
  belongsToTeamModule,
  canEditSubmission,
  canReadSubmission,
  canReviewSubmission,
  isBogUser,
  isCabinetForModule,
  isChapterLeadership,
  resolveSubmissionOwnership,
} from "../lib/submissionScope.js";

const BOG_EDITORS = new Set([
  "ceo",
  "bog_verification",
  "bog_operations",
  "bog_media",
]);

const KIND_MODULE = {
  verification: "verification",
  operation: "operations",
  media: "media",
};

function chapterIdOf(user) {
  if (!user?.chapter) return null;
  return user.chapter._id || user.chapter;
}

function isBogEditor(user) {
  return BOG_EDITORS.has(user?.systemRole) || isBogUser(user);
}

function moduleForKind(kind) {
  return KIND_MODULE[kind] || null;
}

function canAccessKind(user, kind) {
  const mod = moduleForKind(kind);
  if (!mod) return false;
  if (isBogEditor(user) || isChapterLeadership(user)) return true;
  return belongsToTeamModule(user, mod);
}

function canWriteKind(user, kind) {
  return canAccessKind(user, kind);
}

function applyChapterScope(filter, user) {
  if (isBogEditor(user)) return filter;
  const cid = chapterIdOf(user);
  if (cid) filter.chapter = cid;
  return filter;
}

function sameChapter(user, docChapter) {
  if (isBogEditor(user)) return true;
  const cid = chapterIdOf(user);
  if (!cid) return false;
  return String(docChapter?._id || docChapter || "") === String(cid);
}

function populateTeamQuery(q) {
  return q
    .populate("chapter", "name city")
    .populate("createdBy", "name email chapterRole")
    .populate("updatedBy", "name email")
    .populate("reviewedBy", "name email")
    .populate("cabinetMember", "name email chapterRole");
}

async function nextSrNo(kind, chapterId) {
  const filter = { kind };
  if (chapterId) filter.chapter = chapterId;
  else filter.$or = [{ chapter: null }, { chapter: { $exists: false } }];

  const last = await TeamRecord.findOne(filter).sort({ srNo: -1 }).select("srNo").lean();
  return (last?.srNo || 0) + 1;
}

export async function listTeamRecords(req, res, next) {
  try {
    const { kind, chapter, approvalStatus } = req.query;
    if (kind && !TEAM_RECORD_KINDS.includes(kind)) {
      return res.status(400).json({ success: false, message: "Invalid kind." });
    }
    if (kind && !canAccessKind(req.user, kind)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const filter = applyChapterScope({}, req.user);
    if (kind) {
      filter.kind = kind;
      applySubmissionListScope(filter, req.user, moduleForKind(kind));
    } else if (!isBogEditor(req.user) && !isChapterLeadership(req.user)) {
      const mod = moduleForKind(
        req.user.chapterRole === "verification_head"
          ? "verification"
          : req.user.chapterRole === "operations_head"
            ? "operation"
            : req.user.chapterRole === "media_head"
              ? "media"
              : null,
      ) || null;
      if (mod) {
        filter.kind =
          mod === "operations" ? "operation" : mod === "verification" ? "verification" : "media";
        applySubmissionListScope(filter, req.user, mod);
      } else {
        filter.createdBy = req.user._id;
      }
    }
    if (chapter && isBogEditor(req.user)) filter.chapter = chapter;
    if (approvalStatus) filter.approvalStatus = approvalStatus;

    const sort =
      filter.kind === "verification" || filter.kind === "media"
        ? { srNo: 1, createdAt: 1 }
        : { createdAt: -1 };

    const data = await populateTeamQuery(TeamRecord.find(filter).sort(sort)).lean();

    res.json({
      success: true,
      total: data.length,
      canReview: kind ? isCabinetForModule(req.user, moduleForKind(kind)) : false,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function createTeamRecord(req, res, next) {
  try {
    const { kind } = req.body;
    if (!TEAM_RECORD_KINDS.includes(kind)) {
      return res.status(400).json({ success: false, message: "Invalid kind." });
    }
    if (!canWriteKind(req.user, kind)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const teamModule = moduleForKind(kind);
    const ownership = await resolveSubmissionOwnership(req.user);
    const cabinetCreates = isCabinetForModule(req.user, teamModule);

    let chapterId = null;
    if (isBogEditor(req.user)) {
      chapterId = req.body.chapter || null;
    } else {
      chapterId = chapterIdOf(req.user);
      if (!chapterId) {
        return res.status(400).json({
          success: false,
          message: "Your account is not assigned to a chapter.",
        });
      }
    }

    const payload = {
      kind,
      chapter: chapterId,
      notes: req.body.notes || "",
      approvalStatus: cabinetCreates ? req.body.approvalStatus || "approved" : "pending",
      teamModule,
      cabinetMember: ownership.cabinetMember,
      teamDirector: ownership.teamDirector,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    };

    if (kind === "verification") {
      payload.srNo = await nextSrNo("verification", chapterId);
      payload.caseDate = req.body.caseDate || "";
      payload.caseType = req.body.caseType || "";
      payload.referenceName = req.body.referenceName || "";
      payload.referenceContact = req.body.referenceContact || "";
      payload.caseStatus = req.body.caseStatus || "unverified";
      payload.runStatus = req.body.runStatus || "Not Run";
      payload.paymentStatus = req.body.paymentStatus || "";
      payload.verifiedByMember = req.body.verifiedByMember || "";
    } else if (kind === "media") {
      payload.srNo = await nextSrNo("media", chapterId);
      payload.caseDate = req.body.caseDate || req.body.date || "";
      payload.refNo = req.body.refNo || "";
      payload.description = req.body.description || "";
    } else {
      payload.caseNumber = req.body.caseNumber || "";
      payload.familyGuardianName = req.body.familyGuardianName || "";
      payload.city = req.body.city || "";
      payload.rashanStatus = req.body.rashanStatus || "Not Delivered";
    }

    const doc = await TeamRecord.create(payload);
    const populated = await populateTeamQuery(TeamRecord.findById(doc._id));

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function updateTeamRecord(req, res, next) {
  try {
    const doc = await TeamRecord.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Record not found." });

    const mod = moduleForKind(doc.kind);
    if (!canWriteKind(req.user, doc.kind) || !sameChapter(req.user, doc.chapter)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!canEditSubmission(req.user, doc, mod)) {
      return res.status(403).json({
        success: false,
        message: "You cannot edit this record (not yours or already approved).",
      });
    }

    if (doc.kind === "verification") {
      const fields = [
        "caseDate",
        "caseType",
        "referenceName",
        "referenceContact",
        "caseStatus",
        "runStatus",
        "paymentStatus",
        "verifiedByMember",
        "notes",
      ];
      for (const f of fields) {
        if (req.body[f] !== undefined) doc[f] = req.body[f];
      }
    } else if (doc.kind === "media") {
      if (req.body.caseDate !== undefined) doc.caseDate = req.body.caseDate;
      if (req.body.date !== undefined) doc.caseDate = req.body.date;
      if (req.body.refNo !== undefined) doc.refNo = req.body.refNo;
      if (req.body.description !== undefined) doc.description = req.body.description;
      if (req.body.notes !== undefined) doc.notes = req.body.notes;
    } else {
      const fields = ["caseNumber", "familyGuardianName", "city", "rashanStatus", "notes"];
      for (const f of fields) {
        if (req.body[f] !== undefined) doc[f] = req.body[f];
      }
    }

    if (!isCabinetForModule(req.user, mod) && !isBogUser(req.user)) {
      doc.approvalStatus = "pending";
    }

    doc.updatedBy = req.user._id;
    await doc.save();

    const populated = await populateTeamQuery(TeamRecord.findById(doc._id));

    res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function deleteTeamRecord(req, res, next) {
  try {
    const doc = await TeamRecord.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Record not found." });

    const mod = moduleForKind(doc.kind);
    if (!canWriteKind(req.user, doc.kind) || !sameChapter(req.user, doc.chapter)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!canEditSubmission(req.user, doc, mod)) {
      return res.status(403).json({ success: false, message: "You cannot delete this record." });
    }

    await TeamRecord.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Record deleted." });
  } catch (err) {
    next(err);
  }
}

export async function reviewTeamRecord(req, res, next) {
  try {
    const doc = await TeamRecord.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Record not found." });

    const mod = moduleForKind(doc.kind);
    if (!canReviewSubmission(req.user, doc, mod)) {
      return res.status(403).json({
        success: false,
        message: "Only your cabinet member can approve pending submissions.",
      });
    }

    const approvalStatus = req.body.approvalStatus === "rejected" ? "rejected" : "approved";
    const updated = await populateTeamQuery(
      TeamRecord.findByIdAndUpdate(
        req.params.id,
        {
          approvalStatus,
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
          reviewNote: req.body.reviewNote || "",
          updatedBy: req.user._id,
        },
        { new: true, runValidators: true },
      ),
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}
