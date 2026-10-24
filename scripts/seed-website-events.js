/**
 * One-off: ensure sample published website events exist.
 * Run: node scripts/seed-website-events.js
 */
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const samples = [
  {
    title: "Community Relief Day",
    date: new Date("2026-08-20"),
    location: "Karachi",
    capacity: "500 volunteers",
    description: "Field day for food and hygiene kit packing.",
    published: true,
    sortOrder: 0,
  },
  {
    title: "Back-to-School Supplies",
    date: new Date("2026-08-25"),
    location: "Islamabad",
    capacity: "1,800 kits",
    description: "School kits for verified families.",
    published: true,
    sortOrder: 1,
  },
  {
    title: "Ramadan Iftar Drive",
    date: new Date("2026-09-12"),
    location: "Karachi",
    capacity: "3,000 meals",
    description: "Community iftar meals across partner masjids.",
    published: true,
    sortOrder: 2,
  },
  {
    title: "Free Medical Camp",
    date: new Date("2026-10-05"),
    location: "Lahore",
    capacity: "600 patients",
    description: "Checkups and medicines with volunteer doctors.",
    published: true,
    sortOrder: 3,
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection("websiteevents");

  // Fix placeholder / past-dated test rows so they can appear as upcoming.
  await col.updateMany(
    { date: { $lt: new Date("2000-01-01") } },
    {
      $set: {
        title: "Community Relief Day",
        date: new Date("2026-08-20"),
        location: "Karachi",
        capacity: "500 volunteers",
        description: "Field day for food and hygiene kit packing.",
        published: true,
      },
    },
  );

  const existing = await col.find({}, { projection: { title: 1 } }).toArray();
  const titles = new Set(existing.map((d) => d.title));
  const now = new Date();
  for (const s of samples) {
    if (titles.has(s.title)) continue;
    await col.insertOne({ ...s, createdAt: now, updatedAt: now });
  }

  const all = await col
    .find({ published: true })
    .project({ title: 1, date: 1, published: 1 })
    .sort({ date: 1 })
    .toArray();
  console.log("Published website events:", all.length);
  console.log(all);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
