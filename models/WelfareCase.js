import mongoose from "mongoose";

const noteSchema = new mongoose.Schema(
  {
    author: { type: String, required: true },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

const welfareCaseSchema = new mongoose.Schema(
  {
    caseId: { type: String, unique: true }, // e.g. C-1042
    applicant: { type: String, required: true, trim: true },
    applicantPhone: { type: String, default: "" },
    applicantCNIC: { type: String, default: "" },
    category: {
      type: String,
      enum: ["Medical", "Food", "Education", "Emergency", "Housing", "Livelihood"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    urgency: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    status: {
      type: String,
      enum: ["submitted", "under_review", "sent_to_ceo", "approved", "disbursed", "closed", "rejected"],
      default: "submitted",
    },
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    disbursedAt: { type: Date, default: null },
    documents: [{ url: String, publicId: String, name: String }],
    notes: [noteSchema],
  },
  { timestamps: true }
);

// Auto-generate caseId before first save
welfareCaseSchema.pre("save", async function () {
  if (!this.isNew || this.caseId) return;
  const count = await mongoose.model("WelfareCase").countDocuments();
  this.caseId = `C-${1000 + count + 1}`;
});

const WelfareCase = mongoose.model("WelfareCase", welfareCaseSchema);
export default WelfareCase;
