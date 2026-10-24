import mongoose from "mongoose";

/**
 * Finance team files for BOG Finance Head / chapter Finance Head.
 *
 * Types:
 * - monthly_donation: hierarchical monthly team donation sheet
 * - case: single finance case row (month + beneficiary + refs + payment SS)
 */
export const FINANCE_TYPES = ["monthly_donation", "case"];

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

const financeFileSchema = new mongoose.Schema(
  {
    type: { type: String, enum: FINANCE_TYPES, required: true, index: true },
    title: { type: String, default: "" },
    month: { type: String, default: "", index: true },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
      index: true,
    },
    /** Type-specific payload (donation hierarchy or case fields) */
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },
    attachments: [attachmentSchema],
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "submitted", "reviewed", "archived"],
      default: "draft",
    },
    /** Cabinet approval — only approved records count as official / on Drive exports */
    approvalStatus: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    teamModule: {
      type: String,
      enum: ["finance", "operations", "verification", "documentation", "media", ""],
      default: "finance",
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
    /** Generated PDF on Google Drive (updated on re-export) */
    pdfDriveFileId: { type: String, default: "" },
    pdfDriveWebViewLink: { type: String, default: "" },
    pdfDrivePath: { type: String, default: "" },
    pdfDriveUploadedAt: { type: Date, default: null },
    /** Generated Excel on Google Drive (updated on re-export) */
    excelDriveFileId: { type: String, default: "" },
    excelDriveWebViewLink: { type: String, default: "" },
    excelDrivePath: { type: String, default: "" },
    excelDriveUploadedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

financeFileSchema.index({ type: 1, chapter: 1, month: 1, createdAt: -1 });

const FinanceFile = mongoose.model("FinanceFile", financeFileSchema);
export default FinanceFile;
