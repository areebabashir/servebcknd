import mongoose from "mongoose";

/**
 * CMS content for the public website.
 * One document per page; sections holds keyed blocks (hero, stats, cards, etc.).
 */
export const WEBSITE_PAGES = [
  "home",
  "about",
  "mission",
  "leadership",
  "chapters",
  "programs",
  "events",
  "gallery",
  "faq",
  "contact",
  "donate",
  "volunteer",
  "footer",
];

const siteContentSchema = new mongoose.Schema(
  {
    page: {
      type: String,
      enum: WEBSITE_PAGES,
      required: true,
      unique: true,
      index: true,
    },
    /** Section payloads keyed by section name */
    sections: { type: mongoose.Schema.Types.Mixed, default: {} },
    published: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

const SiteContent = mongoose.model("SiteContent", siteContentSchema);
export default SiteContent;
