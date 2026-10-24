import "dotenv/config";
import mongoose from "mongoose";
import SiteContent from "../models/SiteContent.js";
import { DEFAULT_WEBSITE_CONTENT } from "../data/websiteDefaults.js";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error("No MONGODB_URI");
  process.exit(1);
}

await mongoose.connect(uri);
const hero = DEFAULT_WEBSITE_CONTENT.volunteer?.hero;
const doc = await SiteContent.findOneAndUpdate(
  { page: "volunteer" },
  { $set: { "sections.hero": hero, published: true } },
  { new: true, upsert: true },
);
console.log("Updated volunteer hero:", JSON.stringify(doc?.sections?.hero, null, 2));
await mongoose.disconnect();
