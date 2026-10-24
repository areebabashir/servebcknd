import mongoose from "mongoose";

/**
 * Public website reviews — submitted by visitors, shown after CEO approval.
 */
const reviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    role: { type: String, default: "", trim: true, maxlength: 120 },
    email: { type: String, default: "", lowercase: true, trim: true },
    text: { type: String, required: true, trim: true, maxlength: 800 },
    stars: { type: Number, min: 1, max: 5, default: 5 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

reviewSchema.index({ status: 1, createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);
export default Review;
