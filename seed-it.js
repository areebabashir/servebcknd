/**
 * Seed the org IT Manager account (CEO dashboard only).
 * Manages board + all chapter accounts from one place.
 *
 * Run: npm run seed:it
 */
import "dotenv/config";
import { connectDB } from "./config/db.js";
import User from "./models/User.js";

const ORG_IT = {
  name: "IT Manager",
  email: "it@servehumanity.org",
  password: "Password123!",
  systemRole: "bog_it",
  chapterRole: "member",
  chapter: null,
  isActive: true,
  membershipStatus: "approved",
};

async function seedIt() {
  await connectDB();

  let user = await User.findOne({ email: ORG_IT.email });
  if (user) {
    user.name = ORG_IT.name;
    user.systemRole = ORG_IT.systemRole;
    user.chapterRole = ORG_IT.chapterRole;
    user.chapter = null;
    user.isActive = true;
    user.membershipStatus = "approved";
    user.password = ORG_IT.password;
    await user.save();
    console.log(`Updated org IT Manager: ${user.email}`);
  } else {
    user = await User.create(ORG_IT);
    console.log(`Created org IT Manager: ${user.email}`);
  }

  // Demote any leftover chapter IT seats — IT is CEO-dashboard only now
  const demoted = await User.updateMany(
    { chapterRole: "it_head" },
    { $set: { chapterRole: "member" } },
  );
  if (demoted.modifiedCount) {
    console.log(`Demoted ${demoted.modifiedCount} chapter it_head seat(s) → member`);
  }

  console.log("\nLogin (CEO dashboard IT Management):");
  console.log("  email: it@servehumanity.org");
  console.log("  password: Password123!");
  process.exit(0);
}

seedIt().catch((err) => {
  console.error(err);
  process.exit(1);
});
