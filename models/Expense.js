import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    expenseId: { type: String, unique: true },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: {
      type: String,
      enum: ["Welfare", "Relief", "Operations", "Events", "Media", "IT", "Salaries", "Other"],
      default: "Operations",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "sent_to_ceo", "rejected"],
      default: "pending",
    },
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    relatedCase: { type: mongoose.Schema.Types.ObjectId, ref: "WelfareCase", default: null },
    documents: [{ url: String, publicId: String, name: String }],
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

expenseSchema.pre("save", async function () {
  if (!this.isNew || this.expenseId) return;
  const count = await mongoose.model("Expense").countDocuments();
  this.expenseId = `E-${80 + count + 1}`;
});

const Expense = mongoose.model("Expense", expenseSchema);
export default Expense;
