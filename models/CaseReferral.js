import mongoose from "mongoose";

export const OCCUPATION_OPTIONS = [
  "Student",
  "Employee",
  "Business Owner",
  "Self-Employed",
  "Unemployed",
  "Other",
];

export const RELATIONSHIP_OPTIONS = [
  "Relative",
  "Friend",
  "Neighbor",
  "Colleague",
  "Community Member",
  "Other",
];

export const CASE_TYPE_OPTIONS = [
  "Health",
  "Marriage",
  "Fee",
  "Ration",
  "Emergency",
  "Other",
];

export const CASE_REFERRAL_STATUSES = [
  "submitted",
  "under_review",
  "verified",
  "accepted",
  "closed",
  "rejected",
];

const caseReferralSchema = new mongoose.Schema(
  {
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      required: true,
      index: true,
    },
    /** Reference / verifier (person who submitted the form) */
    verifierName: { type: String, required: true, trim: true },
    verifierCity: { type: String, required: true, trim: true },
    verifierPhone: { type: String, required: true, trim: true },
    verifierEmail: { type: String, required: true, trim: true, lowercase: true },
    currentlyDoing: {
      type: String,
      enum: OCCUPATION_OPTIONS,
      required: true,
    },
    relationship: {
      type: String,
      enum: RELATIONSHIP_OPTIONS,
      required: true,
    },
    /** Deserving family / case */
    familyName: { type: String, required: true, trim: true },
    familyCity: { type: String, required: true, trim: true },
    familyPhone: { type: String, required: true, trim: true },
    caseType: {
      type: String,
      enum: CASE_TYPE_OPTIONS,
      required: true,
    },
    helpNeeded: { type: String, required: true, trim: true },
    helpNeededWithinDays: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: CASE_REFERRAL_STATUSES,
      default: "submitted",
      index: true,
    },
    documentationFile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DocumentationFile",
      default: null,
    },
    notifiedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
    verificationEmailSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

caseReferralSchema.index({ chapter: 1, createdAt: -1 });

const CaseReferral = mongoose.model("CaseReferral", caseReferralSchema);
export default CaseReferral;
