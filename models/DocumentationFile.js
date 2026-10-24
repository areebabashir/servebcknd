import mongoose from "mongoose";

/**
 * Unified documentation store for all Team Documentation file types.
 * Type-specific fields live in `fields` (Mixed); uploads in `attachments`.
 *
 * Attachment keys by type (examples):
 * health: casePoster, cnicOrBform, rentAgreement, utilityBills, housePics,
 *         incomeProof, medicalReports, paymentScreenshot, paymentUsagePics
 * marriage: + deathCertificate, girlFatherCnic
 * fee: + studentCard, feeChallan, paidFeeChallan
 * ration: + cnicFrontBack, deathCertificate, rashanDeliveredPics
 * monthly_report: casePaymentScreenshots, rationScreenshots, drivePaymentScreenshots
 * ration_file: paymentScreenshot
 * drive: poster, expenseScreenshots, drivePhotos
 * stat / reference: optional supporting files
 */
export const DOC_TYPES = [
  "health",
  "marriage",
  "fee",
  "ration",
  "monthly_report",
  "ration_file",
  "drive",
  "stat",
  "reference",
];

const attachmentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, default: "" },
    url: { type: String, default: "" },
    publicId: { type: String, default: "" },
    note: { type: String, default: "" },
    driveFileId: { type: String, default: "" },
    driveWebViewLink: { type: String, default: "" },
    drivePath: { type: String, default: "" },
  },
  { _id: true }
);

const documentationFileSchema = new mongoose.Schema(
  {
    type: { type: String, enum: DOC_TYPES, required: true, index: true },
    title: { type: String, default: "" },
    caseNumber: { type: String, default: "", index: true },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
      index: true,
    },
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },
    attachments: [attachmentSchema],
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "submitted", "reviewed", "archived"],
      default: "draft",
    },
    approvalStatus: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    teamModule: {
      type: String,
      enum: ["finance", "operations", "verification", "documentation", "media", ""],
      default: "documentation",
      index: true,
    },
    cabinetMember: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    teamDirector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" },
    /** Case board lifecycle for health / marriage / fee / ration */
    caseStatus: {
      type: String,
      enum: ["pending", "running", "complete"],
      default: "pending",
      index: true,
    },
    /** Filled-form PDF synced to Google Drive (avoid duplicates) */
    pdfDriveFileId: { type: String, default: "" },
    pdfDriveWebViewLink: { type: String, default: "" },
    pdfDrivePath: { type: String, default: "" },
    pdfDriveUploadedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

documentationFileSchema.index({ type: 1, chapter: 1, createdAt: -1 });

const DocumentationFile = mongoose.model("DocumentationFile", documentationFileSchema);
export default DocumentationFile;
