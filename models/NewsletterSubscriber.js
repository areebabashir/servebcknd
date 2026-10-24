import mongoose from "mongoose";

const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      maxlength: 160,
    },
    source: { type: String, default: "footer", trim: true, maxlength: 40 },
    isActive: { type: Boolean, default: true, index: true },
    unsubscribedAt: { type: Date, default: null },
    /** Last time a donation reminder email was sent to this subscriber. */
    lastDonationReminderAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

const NewsletterSubscriber = mongoose.model(
  "NewsletterSubscriber",
  newsletterSubscriberSchema,
);
export default NewsletterSubscriber;
