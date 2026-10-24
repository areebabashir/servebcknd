import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    date: { type: Date, required: true },
    venue: { type: String, default: "" },
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["Pending", "Approved", "Rejected", "Completed"], default: "Pending" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    expectedAttendees: { type: Number, default: 0 },
    actualAttendees: { type: Number, default: 0 },
    budget: { type: Number, default: 0 },
    tags: [String],
    media: [{ url: String, publicId: String, type: String }],
  },
  { timestamps: true }
);

const Event = mongoose.model("Event", eventSchema);
export default Event;
