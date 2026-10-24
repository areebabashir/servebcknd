import mongoose from "mongoose";

export const IT_SUPPORT_SCOPES = ["board", "chapter"];
export const IT_SUPPORT_STATUSES = ["open", "closed"];

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const itSupportThreadSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    scope: {
      type: String,
      enum: IT_SUPPORT_SCOPES,
      required: true,
      index: true,
    },
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", default: null },
    /** The non-IT user this conversation belongs to */
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: IT_SUPPORT_STATUSES,
      default: "open",
      index: true,
    },
    messages: { type: [messageSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastSender: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    unreadForIt: { type: Boolean, default: true },
    unreadForRequester: { type: Boolean, default: false },
  },
  { timestamps: true },
);

itSupportThreadSchema.index({ scope: 1, lastMessageAt: -1 });
itSupportThreadSchema.index({ requester: 1, lastMessageAt: -1 });

const ItSupportThread = mongoose.model("ItSupportThread", itSupportThreadSchema);
export default ItSupportThread;
