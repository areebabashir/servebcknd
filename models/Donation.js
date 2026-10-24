import mongoose from "mongoose";

const donationSchema = new mongoose.Schema(
  {
    donationId: { type: String, unique: true },
    donor: { type: String, default: "Anonymous", trim: true },
    donorEmail: { type: String, default: "", lowercase: true },
    donorPhone: { type: String, default: "" },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["Cash", "Online", "Bank", "Cheque"], default: "Online" },
    campaign: { type: String, default: "General", trim: true },
    cause: {
      type: String,
      enum: ["General", "Food", "Education", "Healthcare", "Orphans", "Water", "Emergency"],
      default: "General",
    },
    frequency: { type: String, enum: ["once", "monthly"], default: "once" },
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", default: null },
    loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    transactionRef: { type: String, default: "" },
    status: { type: String, enum: ["pending", "confirmed", "refunded"], default: "confirmed" },
    receipt: { url: String, publicId: String },
  },
  { timestamps: true }
);

donationSchema.pre("save", async function () {
  if (!this.isNew || this.donationId) return;
  const count = await mongoose.model("Donation").countDocuments();
  this.donationId = `D-${200 + count + 1}`;
});

const Donation = mongoose.model("Donation", donationSchema);
export default Donation;
