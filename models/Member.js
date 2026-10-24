import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true },
    role: {
      type: String,
      enum: [
        "president", "vice_president", "finance_head", "operations_head",
        "verification_head", "documentation_head", "hr_head", "media_head",
        "it_head", "fundraising_head", "event_head",
        "director", "assistant_director", "member",
      ],
      default: "member",
    },
    status: { type: String, enum: ["active", "inactive", "pending"], default: "pending" },
    joinedAt: { type: Date, default: Date.now },
    attendance: { type: Number, default: 0, min: 0, max: 100 },
    volunteerHours: { type: Number, default: 0, min: 0 },
    avatarSeed: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

const Member = mongoose.model("Member", memberSchema);
export default Member;
