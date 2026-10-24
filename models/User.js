import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * Org / system roles:
 * - CEO dashboard: ceo, founder, cto, coo + bog_*
 * - Full access (everything): ceo, founder, cto, coo
 * - Chapter dashboard: president | member
 * - Public site: public
 *
 * Chapter operational roles live in chapterRole (president, finance_head, etc.)
 */
export const SYSTEM_ROLES = [
  "ceo",
  "founder",
  "cto",
  "coo",
  "bog_verification",
  "bog_operations",
  "bog_media",
  "bog_finance",
  "bog_documentation",
  "bog_it",
  "president",
  "member",
  "public",
];

export const CHAPTER_ROLES = [
  "president",
  "vice_president",
  "vice_president_male",
  "finance_head",
  "operations_head",
  "verification_head",
  "documentation_head",
  "hr_head",
  "media_head",
  "it_head",
  "fundraising_head",
  "event_head",
  "director",
  "assistant_director",
  "member",
];

/** Roles with complete CEO-dashboard access (all modules + admin actions) */
export const FULL_ACCESS_ROLES = ["ceo", "founder", "cto", "coo"];

export const CEO_DASHBOARD_ROLES = [
  "ceo",
  "founder",
  "cto",
  "coo",
  "bog_verification",
  "bog_operations",
  "bog_media",
  "bog_finance",
  "bog_documentation",
  "bog_it",
];

export function isFullAccessRole(role) {
  return FULL_ACCESS_ROLES.includes(role);
}

export const MEMBERSHIP_STATUSES = ["pending", "approved", "rejected"];

/** Cabinet teams a public registrant can request to join */
export const JOINABLE_CABINET_ROLES = [
  "operations_head",
  "verification_head",
  "media_head",
  "finance_head",
  "documentation_head",
];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    systemRole: {
      type: String,
      enum: SYSTEM_ROLES,
      default: "public",
    },
    chapterRole: {
      type: String,
      enum: CHAPTER_ROLES,
      default: "member",
    },
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", default: null },
    /** Cabinet member this user reports to (assigned by President / VP) */
    cabinetMember: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** Director this member belongs to (team collection rollup; assigned by cabinet) */
    teamDirector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /**
     * Public self-registration: pending until president / VPs / team cabinet head approve.
     * Leadership-created accounts are approved by default.
     */
    membershipStatus: {
      type: String,
      enum: MEMBERSHIP_STATUSES,
      default: "approved",
      index: true,
    },
    /** Cabinet seat the registrant asked to join (e.g. documentation_head) */
    requestedCabinetRole: {
      type: String,
      default: null,
    },
    /** President or VP who signed off on the join request */
    leadershipApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    leadershipApprovedAt: { type: Date, default: null },
    /** Cabinet head of the requested team who signed off */
    cabinetApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cabinetApprovedAt: { type: Date, default: null },
    membershipApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    membershipApprovedAt: { type: Date, default: null },
    avatar: { type: String, default: "" },
    phone: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    passwordResetToken: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.matchPassword = function (plainText) {
  return bcrypt.compare(plainText, this.password);
};

/** Returns 6-digit code for email; stores hashed code + expiry (caller must save). */
userSchema.methods.createPasswordResetToken = function () {
  const code = String(crypto.randomInt(100000, 1000000));
  this.passwordResetToken = crypto.createHash("sha256").update(code).digest("hex");
  this.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
  return code;
};

const User = mongoose.model("User", userSchema);
export default User;
