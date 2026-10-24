import mongoose from "mongoose";

/**
 * Media & Graphics case files (monthly ledger).
 * Each document = one month; cases live in fields.cases.
 * Case row shape: { date, refNo, description }
 */
const mediaCaseFileSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    month: { type: String, default: "", index: true },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
      index: true,
    },
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "submitted", "reviewed", "archived"],
      default: "draft",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

mediaCaseFileSchema.index({ chapter: 1, month: 1, createdAt: -1 });

const MediaCaseFile = mongoose.model("MediaCaseFile", mediaCaseFileSchema);
export default MediaCaseFile;
