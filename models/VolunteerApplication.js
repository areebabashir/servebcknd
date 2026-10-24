import mongoose from "mongoose";

const volunteerApplicationSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true },
    city: { type: String, required: true, trim: true },
    program: { type: String, required: true },
    motivation: { type: String, default: "" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    chapterAssigned: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", default: null },
  },
  { timestamps: true }
);

const VolunteerApplication = mongoose.model("VolunteerApplication", volunteerApplicationSchema);
export default VolunteerApplication;
