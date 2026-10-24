import mongoose from "mongoose";

export const NOTIFICATION_AUDIENCES = [
  "bogs",
  "bogs_presidents",
  "all_members",
  "warning",
  "chapter_referral",
  "chapter_join",
];
export const NOTIFICATION_PRIORITIES = ["normal", "high", "urgent"];

const recipientSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, default: "" },
    readAt: { type: Date, default: null },
    /** Soft-delete for this recipient only — does not remove the notification for others. */
    dismissedAt: { type: Date, default: null },
    emailedAt: { type: Date, default: null },
    emailError: { type: String, default: null },
  },
  { _id: false },
);

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    priority: {
      type: String,
      enum: NOTIFICATION_PRIORITIES,
      default: "normal",
    },
    audience: {
      type: String,
      enum: NOTIFICATION_AUDIENCES,
      required: true,
    },
    /** Set for single-member warning letters (chapter context). */
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, default: null },
    recipients: { type: [recipientSchema], default: [] },
  },
  { timestamps: true },
);

notificationSchema.index({ "recipients.user": 1, createdAt: -1 });
notificationSchema.index({ createdBy: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
