import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    mediaId: { type: String, unique: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["Graphic", "Video", "Press", "Photo", "Document"], default: "Graphic" },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    thumbnail: { type: String, default: "" },
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["Pending", "Approved", "Rejected", "Revision"], default: "Pending" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    tags: [String],
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

mediaSchema.pre("save", async function () {
  if (!this.isNew || this.mediaId) return;
  const count = await mongoose.model("Media").countDocuments();
  this.mediaId = `M-${500 + count + 1}`;
});

const Media = mongoose.model("Media", mediaSchema);
export default Media;
