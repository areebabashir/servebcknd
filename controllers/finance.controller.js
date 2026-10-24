import FinanceFile, { FINANCE_TYPES } from "../models/FinanceFile.js";
import { uploadToCloudinary } from "../middleware/upload.js";
import { uploadFinanceToDrive, googleDriveConfigured } from "../utils/googleDrive.js";
import {
  applySubmissionListScope,
  belongsToTeamModule,
  canEditSubmission,
  canReadSubmission,
  canReviewSubmission,
  isCabinetForModule,
  isBogUser,
  isChapterLeadership,
  resolveSubmissionOwnership,
} from "../lib/submissionScope.js";

const FINANCE_HEADS = new Set(["ceo", "bog_finance"]);
const FINANCE_MODULE = "finance";

function isFinanceHead(user) {
  return FINANCE_HEADS.has(user.systemRole) || user.chapterRole === "finance_head";
}

function canAccessFinance(user) {
  if (isBogUser(user) || isChapterLeadership(user)) return true;
  return belongsToTeamModule(user, FINANCE_MODULE);
}

/** Chapter-scoped users only see their chapter; BOG/CEO see all. */
function applyChapterScope(filter, user) {
  if (FINANCE_HEADS.has(user.systemRole) || isBogUser(user)) return filter;
  const cid = user.chapter?._id || user.chapter;
  if (cid) filter.chapter = cid;
  return filter;
}

function populateFinanceQuery(q) {
  return q
    .populate("chapter", "name city")
    .populate("createdBy", "name email chapterRole")
    .populate("updatedBy", "name email")
    .populate("reviewedBy", "name email")
    .populate("cabinetMember", "name email chapterRole");
}

export async function listFinance(req, res, next) {
  try {
    if (!canAccessFinance(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { type, chapter, status, approvalStatus, month, page = 1, limit = 50, q } = req.query;
    const filter = applyChapterScope({}, req.user);
    applySubmissionListScope(filter, req.user, FINANCE_MODULE);
    if (type) filter.type = type;
    if (chapter && (FINANCE_HEADS.has(req.user.systemRole) || isBogUser(req.user))) {
      filter.chapter = chapter;
    }
    if (status) filter.status = status;
    if (approvalStatus) filter.approvalStatus = approvalStatus;
    if (month) filter.month = new RegExp(month, "i");
    if (q) {
      filter.$or = [
        { title: new RegExp(q, "i") },
        { month: new RegExp(q, "i") },
        { notes: new RegExp(q, "i") },
        { "fields.caseTitle": new RegExp(q, "i") },
        { "fields.beneficiaryName": new RegExp(q, "i") },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      populateFinanceQuery(
        FinanceFile.find(filter).skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
      ),
      FinanceFile.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page: Number(page),
      canReview: isCabinetForModule(req.user, FINANCE_MODULE),
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getFinance(req, res, next) {
  try {
    if (!canAccessFinance(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const doc = await populateFinanceQuery(FinanceFile.findById(req.params.id));
    if (!doc) return res.status(404).json({ success: false, message: "Finance file not found." });

    if (
      !FINANCE_HEADS.has(req.user.systemRole) &&
      !isBogUser(req.user) &&
      req.user.chapter &&
      String(doc.chapter?._id || doc.chapter) !== String(req.user.chapter?._id || req.user.chapter)
    ) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (!canReadSubmission(req.user, doc, FINANCE_MODULE)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function createFinance(req, res, next) {
  try {
    if (!canAccessFinance(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { type, title, month, chapter, fields, attachments, notes, status } = req.body;
    if (!type || !FINANCE_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: "Valid finance type is required." });
    }

    let chapterId = chapter || null;
    if (!FINANCE_HEADS.has(req.user.systemRole) && !isBogUser(req.user) && req.user.chapter) {
      chapterId = req.user.chapter?._id || req.user.chapter;
    }

    const ownership = await resolveSubmissionOwnership(req.user);
    if (!ownership.teamModule || ownership.teamModule !== FINANCE_MODULE) {
      if (!isBogUser(req.user) && !isChapterLeadership(req.user)) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to the finance team.",
        });
      }
    }

    const cabinetCreates = isCabinetForModule(req.user, FINANCE_MODULE);
    const doc = await FinanceFile.create({
      type,
      title: title || "",
      month: month || "",
      chapter: chapterId,
      fields: fields || {},
      attachments: attachments || [],
      notes: notes || "",
      status: status || "draft",
      approvalStatus: cabinetCreates ? req.body.approvalStatus || "approved" : "pending",
      teamModule: FINANCE_MODULE,
      cabinetMember: ownership.cabinetMember,
      teamDirector: ownership.teamDirector,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const populated = await populateFinanceQuery(FinanceFile.findById(doc._id));

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function updateFinance(req, res, next) {
  try {
    if (!canAccessFinance(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const existing = await FinanceFile.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Finance file not found." });
    }

    if (!canEditSubmission(req.user, existing, FINANCE_MODULE)) {
      return res.status(403).json({
        success: false,
        message: "You cannot edit this record (not yours or already approved).",
      });
    }

    if (
      !FINANCE_HEADS.has(req.user.systemRole) &&
      !isBogUser(req.user) &&
      req.user.chapter &&
      String(existing.chapter) !== String(req.user.chapter?._id || req.user.chapter)
    ) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const allowed = ["title", "month", "chapter", "fields", "attachments", "notes", "status"];
    const updates = { updatedBy: req.user._id };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (!isCabinetForModule(req.user, FINANCE_MODULE) && !isBogUser(req.user)) {
      updates.approvalStatus = "pending";
    } else if (req.body.approvalStatus !== undefined) {
      updates.approvalStatus = req.body.approvalStatus;
    }
    if (!FINANCE_HEADS.has(req.user.systemRole) && !isBogUser(req.user) && req.user.chapter) {
      updates.chapter = req.user.chapter?._id || req.user.chapter;
    }

    const doc = await populateFinanceQuery(
      FinanceFile.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      }),
    );

    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function deleteFinance(req, res, next) {
  try {
    if (!canAccessFinance(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const existing = await FinanceFile.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Finance file not found." });
    }

    if (!canEditSubmission(req.user, existing, FINANCE_MODULE)) {
      return res.status(403).json({
        success: false,
        message: "You cannot delete this record.",
      });
    }

    await FinanceFile.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Finance file deleted." });
  } catch (err) {
    next(err);
  }
}

/** Cabinet member approves or rejects a team submission */
export async function reviewFinance(req, res, next) {
  try {
    if (!canAccessFinance(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const existing = await FinanceFile.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Finance file not found." });
    }

    if (!canReviewSubmission(req.user, existing, FINANCE_MODULE)) {
      return res.status(403).json({
        success: false,
        message: "Only your cabinet member can approve pending finance submissions.",
      });
    }

    const approvalStatus = req.body.approvalStatus === "rejected" ? "rejected" : "approved";
    const doc = await populateFinanceQuery(
      FinanceFile.findByIdAndUpdate(
        req.params.id,
        {
          approvalStatus,
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
          reviewNote: req.body.reviewNote || "",
          status: approvalStatus === "approved" ? "reviewed" : existing.status,
          updatedBy: req.user._id,
        },
        { new: true, runValidators: true },
      ),
    );

    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function uploadFinanceAttachment(req, res, next) {
  try {
    if (!canAccessFinance(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    const {
      financeType = "monthly_donation",
      chapterName = "",
      month = "",
      teamName = "",
      attachmentKey = "",
    } = req.body || {};

    const result = await uploadToCloudinary(req.file, "serve-humanity/finance");

    const drive = await uploadFinanceToDrive({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      financeType,
      chapterName,
      month,
      teamName,
      attachmentKey,
    });

    res.status(201).json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        name: req.file.originalname,
        driveFileId: drive?.driveFileId || "",
        driveWebViewLink: drive?.driveWebViewLink || "",
        drivePath: drive?.drivePath || "",
        driveSynced: Boolean(drive?.driveFileId),
        driveEnabled: googleDriveConfigured(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Upload/update generated finance PDF or Excel on Google Drive.
 * kind: "pdf" | "excel". Re-uploads overwrite the same Drive file when financeId is set.
 */
export async function uploadFinanceExport(req, res, next) {
  try {
    if (!canAccessFinance(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const {
      kind = "pdf",
      financeType = "monthly_donation",
      chapterName = "",
      month = "",
      teamName = "",
      financeId = "",
    } = req.body || {};

    const isExcel = String(kind).toLowerCase() === "excel";
    const idField = isExcel ? "excelDriveFileId" : "pdfDriveFileId";
    const linkField = isExcel ? "excelDriveWebViewLink" : "pdfDriveWebViewLink";
    const pathField = isExcel ? "excelDrivePath" : "pdfDrivePath";
    const atField = isExcel ? "excelDriveUploadedAt" : "pdfDriveUploadedAt";
    const attachmentKey = isExcel ? "Excel Export" : "Form PDF";
    const defaultMime = isExcel
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/pdf";
    const defaultName = isExcel ? "monthly-cases.xlsx" : "monthly-donations.pdf";

    let existingDriveFileId = "";
    if (financeId) {
      const existing = await FinanceFile.findById(financeId).select(
        `${idField} ${linkField} ${pathField} ${atField} approvalStatus cabinetMember createdBy`,
      );
      if (
        existing &&
        !isCabinetForModule(req.user, FINANCE_MODULE) &&
        !isBogUser(req.user) &&
        existing.approvalStatus !== "approved"
      ) {
        return res.status(403).json({
          success: false,
          message: "Cabinet must approve this file before it can be exported to Drive.",
        });
      }
      existingDriveFileId = existing?.[idField] || "";
    }

    const drive = await uploadFinanceToDrive({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype || defaultMime,
      originalName: req.file.originalname || defaultName,
      financeType,
      chapterName,
      month,
      teamName,
      attachmentKey,
      existingDriveFileId,
    });

    if (!drive?.driveFileId) {
      return res.status(502).json({
        success: false,
        message: "Google Drive upload failed. Check backend Drive settings.",
      });
    }

    if (financeId) {
      await FinanceFile.findByIdAndUpdate(financeId, {
        [idField]: drive.driveFileId,
        [linkField]: drive.driveWebViewLink || "",
        [pathField]: drive.drivePath || "",
        [atField]: new Date(),
        updatedBy: req.user._id,
      });
    }

    return res.status(drive.updated ? 200 : 201).json({
      success: true,
      data: {
        kind: isExcel ? "excel" : "pdf",
        updated: Boolean(drive.updated),
        name: req.file.originalname,
        driveFileId: drive.driveFileId,
        driveWebViewLink: drive.driveWebViewLink || "",
        drivePath: drive.drivePath || "",
        driveSynced: true,
        driveEnabled: googleDriveConfigured(),
      },
    });
  } catch (err) {
    console.error("[Finance] uploadFinanceExport error:", err);
    next(err);
  }
}

export async function getFinanceStats(req, res, next) {
  try {
    if (!canAccessFinance(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const match = applyChapterScope({}, req.user);
    applySubmissionListScope(match, req.user, FINANCE_MODULE);
    const byType = await FinanceFile.aggregate([
      { $match: match },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    res.json({
      success: true,
      data: Object.fromEntries(byType.map((x) => [x._id, x.count])),
    });
  } catch (err) {
    next(err);
  }
}
