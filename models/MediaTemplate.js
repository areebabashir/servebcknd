import mongoose from "mongoose";

/**
 * Brand / campaign poster templates managed from CEO Media & Graphics.
 */
const mediaTemplateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["Poster", "Social", "Certificate", "Banner", "Other"],
      default: "Poster",
    },
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    thumbnail: { type: String, default: "" },
    description: { type: String, default: "" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

const MediaTemplate = mongoose.model("MediaTemplate", mediaTemplateSchema);
export default MediaTemplate;
