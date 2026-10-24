import mongoose from "mongoose";

const eventRegistrationSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WebsiteEvent",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true, maxlength: 40 },
    note: { type: String, default: "", trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ["new", "confirmed", "cancelled"],
      default: "new",
    },
  },
  { timestamps: true },
);

const EventRegistration = mongoose.model("EventRegistration", eventRegistrationSchema);
export default EventRegistration;
