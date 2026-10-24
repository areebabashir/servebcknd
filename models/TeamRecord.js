import mongoose from "mongoose";

/**
 * Team Verification / Operation / Media Excel-style records.
 * kind: "verification" | "operation" | "media"
 */
export const TEAM_RECORD_KINDS = ["verification", "operation", "media"];

const teamRecordSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: TEAM_RECORD_KINDS,
      required: true,
      index: true,
    },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
      index: true,
    },
    /** Auto serial for verification / media sheets */
    srNo: { type: Number, default: null },

    // Verification fields
    caseDate: { type: String, default: "" },
    caseType: { type: String, default: "" },
    referenceName: { type: String, default: "" },
    referenceContact: { type: String, default: "" },
    caseStatus: {
      type: String,
      enum: ["", "verified", "unverified"],
      default: "",
    },
    /** Run / Not Run case status */
    runStatus: {
      type: String,
      enum: ["", "Run", "Not Run"],
      default: "Not Run",
    },
    paymentStatus: { type: String, default: "" },
    verifiedByMember: { type: String, default: "" },

    // Operation fields
    caseNumber: { type: String, default: "" },
    familyGuardianName: { type: String, default: "" },
    city: { type: String, default: "" },
    rashanStatus: {
      type: String,
      enum: ["", "Delivered", "Not Delivered"],
      default: "",
    },

    // Media & Graphics case fields (Date · Ref No · Description)
    refNo: { type: String, default: "" },
    description: { type: String, default: "" },

    notes: { type: String, default: "" },
    approvalStatus: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    teamModule: {
      type: String,
      enum: ["finance", "operations", "verification", "documentation", "media", ""],
      default: "",
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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

teamRecordSchema.index({ kind: 1, chapter: 1, createdAt: -1 });
teamRecordSchema.index({ kind: 1, chapter: 1, srNo: 1 });

const TeamRecord = mongoose.model("TeamRecord", teamRecordSchema);
export default TeamRecord;
