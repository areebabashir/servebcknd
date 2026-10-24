import mongoose from "mongoose";

const donationAccountSchema = new mongoose.Schema(
  {
    bankName: { type: String, default: "", trim: true },
    accountTitle: { type: String, default: "", trim: true },
    accountNumber: { type: String, default: "", trim: true },
    iban: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const chapterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    /** Public chapter card / map photo (Cloudinary). */
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    president: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    established: { type: Date, default: null },
    monthlyBudget: { type: Number, default: 800000 },
    budgetThreshold: { type: Number, default: 100000 },
    monthlySpent: { type: Number, default: 0 },
    memberCount: { type: Number, default: 0 },
    casesClosed: { type: Number, default: 0 },
    fundsRaised: { type: Number, default: 0 },
    totalEvents: { type: Number, default: 0 },
    lastActivity: { type: Date, default: null },
    /**
     * Public bank accounts for website donate page (1–3).
     * Set by chapter president from chapter settings.
     */
    donationAccounts: {
      type: [donationAccountSchema],
      default: [],
      validate: {
        validator(v) {
          return !v || v.length <= 3;
        },
        message: "A chapter can have at most 3 donation accounts.",
      },
    },
  },
  { timestamps: true }
);

const Chapter = mongoose.model("Chapter", chapterSchema);
export default Chapter;
