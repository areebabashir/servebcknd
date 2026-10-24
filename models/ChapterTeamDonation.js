import mongoose from "mongoose";

/**
 * Individual chapter member donations (amount + optional screenshot).
 * Counts toward a director's team collection until verified by
 * the finance director. President / VP donations have no teamDirector
 * (own collection only). BOG/CEO-board donations use source "bog".
 */
const chapterTeamDonationSchema = new mongoose.Schema(
  {
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      required: true,
      index: true,
    },
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Director whose team this donation counts toward */
    teamDirector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    /** chapter = chapter team member; bog = CEO/Board/BOG donation into a chapter */
    source: {
      type: String,
      enum: ["chapter", "bog"],
      default: "chapter",
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    screenshotUrl: { type: String, default: "" },
    screenshotPublicId: { type: String, default: "" },
    note: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
      index: true,
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

chapterTeamDonationSchema.index({ chapter: 1, teamDirector: 1, status: 1 });
chapterTeamDonationSchema.index({ donor: 1, createdAt: -1 });
chapterTeamDonationSchema.index({ source: 1, status: 1, createdAt: -1 });

const ChapterTeamDonation = mongoose.model("ChapterTeamDonation", chapterTeamDonationSchema);
export default ChapterTeamDonation;
