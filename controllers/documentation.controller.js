import DocumentationFile, { DOC_TYPES } from "../models/DocumentationFile.js";
import { uploadToCloudinary } from "../middleware/upload.js";
import { uploadDocumentationToDrive, googleDriveConfigured } from "../utils/googleDrive.js";
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

const DOC_BOG = new Set(["ceo", "bog_documentation"]);
const DOC_MODULE = "documentation";

/** Regular case files managed on the Pending / Running / Complete board */
export const CASE_DOC_TYPES = ["health", "marriage", "fee", "ration"];
export const CASE_STATUSES = ["pending", "running", "complete"];

function chapterIdOf(user) {
  if (!user?.chapter) return null;
  return user.chapter._id || user.chapter;
}

function applyChapterScope(filter, user) {
  if (DOC_BOG.has(user?.systemRole)) return filter;
  const cid = chapterIdOf(user);
  if (cid) filter.chapter = cid;
  return filter;
}

function canAccessDocs(user) {
  if (DOC_BOG.has(user?.systemRole) || isBogUser(user) || isChapterLeadership(user)) return true;
  return belongsToTeamModule(user, DOC_MODULE);
}

/** Drive upload: BOG / CEO, chapter president, VPs, or Documentation cabinet head only. */
function canUploadDocsToDrive(user) {
  if (!user) return false;
  if (DOC_BOG.has(user.systemRole) || isBogUser(user)) return true;
  if (isChapterLeadership(user)) return true;
  return isCabinetForModule(user, DOC_MODULE);
}

function populateDocQuery(q) {
  return q
    .populate("chapter", "name city")
    .populate("createdBy", "name email chapterRole")
    .populate("updatedBy", "name email")
    .populate("reviewedBy", "name email")
    .populate("cabinetMember", "name email chapterRole");
}

function sameChapter(user, docChapter) {
  if (DOC_BOG.has(user?.systemRole) || isBogUser(user)) return true;
  const cid = chapterIdOf(user);
  if (!cid) return false;
  return String(docChapter?._id || docChapter || "") === String(cid);
}

export async function listDocs(req, res, next) {
  try {
    if (!canAccessDocs(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { type, chapter, status, approvalStatus, caseStatus, casesOnly, page = 1, limit = 30, q } = req.query;
    const filter = applyChapterScope({}, req.user);
    applySubmissionListScope(filter, req.user, DOC_MODULE);
    if (type) {
      filter.type = type;
    } else if (casesOnly === "1" || casesOnly === "true" || caseStatus) {
      filter.type = { $in: CASE_DOC_TYPES };
    }
    if (chapter && DOC_BOG.has(req.user.systemRole)) filter.chapter = chapter;
    if (caseStatus && CASE_STATUSES.includes(String(caseStatus))) {
      if (caseStatus === "pending") {
        filter.$and = [
          ...(filter.$and || []),
          { $or: [{ caseStatus: "pending" }, { caseStatus: { $exists: false } }, { caseStatus: null }] },
        ];
      } else {
        filter.caseStatus = caseStatus;
      }
    }
    if (status) filter.status = status;
    if (approvalStatus) filter.approvalStatus = approvalStatus;
    if (q) {
      filter.$or = [
        { caseNumber: new RegExp(q, "i") },
        { title: new RegExp(q, "i") },
        { notes: new RegExp(q, "i") },
        { "fields.beneficiaryName": new RegExp(q, "i") },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      populateDocQuery(
        DocumentationFile.find(filter).skip(skip).limit(Number(limit)).sort({ updatedAt: -1 }),
      ),
      DocumentationFile.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page: Number(page),
      canReview: isCabinetForModule(req.user, DOC_MODULE),
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDoc(req, res, next) {
  try {
    if (!canAccessDocs(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const doc = await populateDocQuery(DocumentationFile.findById(req.params.id));
    if (!doc) return res.status(404).json({ success: false, message: "Document not found." });
    if (!sameChapter(req.user, doc.chapter)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!canReadSubmission(req.user, doc, DOC_MODULE)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function createDoc(req, res, next) {
  try {
    if (!canAccessDocs(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { type, title, caseNumber, chapter, fields, attachments, notes, status, caseStatus } = req.body;
    if (!type || !DOC_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: "Valid document type is required." });
    }

    let chapterId = chapter || null;
    if (!DOC_BOG.has(req.user.systemRole)) {
      chapterId = chapterIdOf(req.user);
      if (!chapterId) {
        return res.status(400).json({
          success: false,
          message: "Your account is not assigned to a chapter.",
        });
      }
    }

    const isCaseType = CASE_DOC_TYPES.includes(type);
    const resolvedCaseStatus =
      caseStatus && CASE_STATUSES.includes(caseStatus)
        ? caseStatus
        : isCaseType
          ? "pending"
          : undefined;

    const ownership = await resolveSubmissionOwnership(req.user);
    const cabinetCreates = isCabinetForModule(req.user, DOC_MODULE);

    const doc = await DocumentationFile.create({
      type,
      title: title || "",
      caseNumber: caseNumber || "",
      chapter: chapterId,
      fields: fields || {},
      attachments: attachments || [],
      notes: notes || "",
      status: status || "draft",
      approvalStatus: cabinetCreates ? req.body.approvalStatus || "approved" : "pending",
      teamModule: DOC_MODULE,
      cabinetMember: ownership.cabinetMember,
      teamDirector: ownership.teamDirector,
      ...(resolvedCaseStatus ? { caseStatus: resolvedCaseStatus } : {}),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const populated = await populateDocQuery(DocumentationFile.findById(doc._id));

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function updateDoc(req, res, next) {
  try {
    if (!canAccessDocs(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const existing = await DocumentationFile.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Document not found." });
    if (!sameChapter(req.user, existing.chapter)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!canEditSubmission(req.user, existing, DOC_MODULE)) {
      return res.status(403).json({
        success: false,
        message: "You cannot edit this record (not yours or already approved).",
      });
    }

    const allowed = ["title", "caseNumber", "chapter", "fields", "attachments", "notes", "status", "caseStatus"];
    const updates = { updatedBy: req.user._id };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.caseStatus && !CASE_STATUSES.includes(updates.caseStatus)) {
      return res.status(400).json({
        success: false,
        message: "caseStatus must be pending, running, or complete.",
      });
    }
    if (!DOC_BOG.has(req.user.systemRole) && !isBogUser(req.user)) {
      updates.chapter = chapterIdOf(req.user);
    }
    if (!isCabinetForModule(req.user, DOC_MODULE) && !isBogUser(req.user)) {
      updates.approvalStatus = "pending";
    }

    const doc = await populateDocQuery(
      DocumentationFile.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      }),
    );

    if (!doc) return res.status(404).json({ success: false, message: "Document not found." });
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function deleteDoc(req, res, next) {
  try {
    if (!canAccessDocs(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const existing = await DocumentationFile.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Document not found." });
    if (!sameChapter(req.user, existing.chapter)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!canEditSubmission(req.user, existing, DOC_MODULE)) {
      return res.status(403).json({ success: false, message: "You cannot delete this record." });
    }
    await DocumentationFile.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Document deleted." });
  } catch (err) {
    next(err);
  }
}

export async function reviewDoc(req, res, next) {
  try {
    if (!canAccessDocs(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const existing = await DocumentationFile.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Document not found." });

    if (!canReviewSubmission(req.user, existing, DOC_MODULE)) {
      return res.status(403).json({
        success: false,
        message: "Only your cabinet member can approve pending documentation.",
      });
    }

    const approvalStatus = req.body.approvalStatus === "rejected" ? "rejected" : "approved";
    const doc = await populateDocQuery(
      DocumentationFile.findByIdAndUpdate(
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

/** Upload a single attachment file for documentation (Cloudinary + optional Google Drive) */
export async function uploadDocAttachment(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    const {
      docType = "",
      chapterName = "",
      caseNumber = "",
      beneficiaryName = "",
      attachmentKey = "",
    } = req.body || {};

    const result = await uploadToCloudinary(req.file, "serve-humanity/documentation");

    // Only president / VPs / Documentation cabinet head / BOG sync attachments to Drive
    let drive = null;
    if (canUploadDocsToDrive(req.user)) {
      drive = await uploadDocumentationToDrive({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        docType,
        chapterName,
        caseNumber,
        beneficiaryName,
        attachmentKey,
      });
    }

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
        driveEnabled: googleDriveConfigured() && canUploadDocsToDrive(req.user),
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Upload a filled-form PDF to Google Drive (no duplicates per document) */
export async function uploadDocPdf(req, res, next) {
  try {
    if (!canUploadDocsToDrive(req.user)) {
      return res.status(403).json({
        success: false,
        message:
          "Only the president, vice presidents, or Documentation cabinet head can upload documents to Google Drive.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No PDF uploaded." });
    }

    const {
      docType = "",
      chapterName = "",
      caseNumber = "",
      beneficiaryName = "",
      docId = "",
    } = req.body || {};

    // Skip duplicate if this document already has a Drive PDF
    if (docId) {
      const existing = await DocumentationFile.findById(docId).select(
        "pdfDriveFileId pdfDriveWebViewLink pdfDrivePath pdfDriveUploadedAt approvalStatus",
      );
      if (
        existing &&
        !isCabinetForModule(req.user, DOC_MODULE) &&
        !isChapterLeadership(req.user) &&
        !isBogUser(req.user) &&
        existing.approvalStatus !== "approved"
      ) {
        return res.status(403).json({
          success: false,
          message: "Cabinet must approve this document before PDF can be synced to Drive.",
        });
      }
      if (existing?.pdfDriveFileId) {
        return res.status(200).json({
          success: true,
          data: {
            alreadyUploaded: true,
            driveFileId: existing.pdfDriveFileId,
            driveWebViewLink: existing.pdfDriveWebViewLink || "",
            drivePath: existing.pdfDrivePath || "",
            driveSynced: true,
            driveEnabled: googleDriveConfigured(),
          },
        });
      }
    }

    const drive = await uploadDocumentationToDrive({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype || "application/pdf",
      originalName: req.file.originalname || "form.pdf",
      docType,
      chapterName,
      caseNumber,
      beneficiaryName,
      attachmentKey: "Form PDF",
    });

    if (!drive?.driveFileId) {
      return res.status(502).json({
        success: false,
        message: "Google Drive upload failed. Check backend Drive settings.",
      });
    }

    if (docId) {
      await DocumentationFile.findByIdAndUpdate(docId, {
        pdfDriveFileId: drive.driveFileId,
        pdfDriveWebViewLink: drive.driveWebViewLink || "",
        pdfDrivePath: drive.drivePath || "",
        pdfDriveUploadedAt: new Date(),
        updatedBy: req.user._id,
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        alreadyUploaded: false,
        name: req.file.originalname,
        driveFileId: drive.driveFileId,
        driveWebViewLink: drive.driveWebViewLink || "",
        drivePath: drive.drivePath || "",
        driveSynced: true,
        driveEnabled: googleDriveConfigured(),
      },
    });
  } catch (err) {
    console.error("[PDF] uploadDocPdf error:", err);
    next(err);
  }
}

export async function getDocStats(req, res, next) {
  try {
    const byType = await DocumentationFile.aggregate([
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
