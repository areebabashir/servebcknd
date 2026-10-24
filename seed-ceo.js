/**
 * Seed only the main CEO account (safe for a fresh/empty database).
 * Does not delete other data.
 *
 * Run: npm run seed:ceo
 */
import "dotenv/config";
import { connectDB } from "./config/db.js";
import User from "./models/User.js";

const CEO = {
  name: "Dr. Ahsan Khan",
  email: "ceo@servehumanity.org",
  password: "Password123!",
  systemRole: "ceo",
  chapterRole: "member",
  isActive: true,
};

async function seedCeo() {
  await connectDB();

  let user = await User.findOne({ email: CEO.email });
  if (user) {
    user.name = CEO.name;
    user.systemRole = CEO.systemRole;
    user.chapterRole = CEO.chapterRole;
    user.isActive = true;
    user.password = CEO.password; // hashed by User pre-save hook
    await user.save();
    console.log(`Updated CEO: ${user.email}`);
  } else {
    user = await User.create(CEO);
    console.log(`Created CEO: ${user.email}`);
  }

  console.log("Login → email: ceo@servehumanity.org  password: Password123!");
  process.exit(0);
}

seedCeo().catch((err) => {
  console.error(err);
  process.exit(1);
});
