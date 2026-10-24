import User, { CEO_DASHBOARD_ROLES, FULL_ACCESS_ROLES, isFullAccessRole } from "../models/User.js";
import Chapter from "../models/Chapter.js";
import ChapterTeamDonation from "../models/ChapterTeamDonation.js";
import {
  isOwnCollectionRole,
  isCabinetRole,
  isTeamDirectorRole,
  isValidTeamLeadRole,
  isVicePresidentRole,
  CABINET_ROLES,
  CABINET_ASSIGNABLE_ROLES,
} from "../lib/teamHeads.js";

const USER_LEADERSHIP = new Set(FULL_ACCESS_ROLES);

const TEAM_LABEL = {
  operations_head: "Operations",
  verification_head: "Verification",
  media_head: "Media & Graphics",
  finance_head: "Finance",
  documentation_head: "Documentation",
};

/** Roles leadership can create from Board page (one active seat each) */
const BOARD_CREATABLE_ROLES = [
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

/** @deprecated */
export const DIRECTOR_ASSIGNABLE_ROLES = CABINET_ASSIGNABLE_ROLES;
/** @deprecated */
export const PRESIDENT_ASSIGNABLE_ROLES = CABINET_ASSIGNABLE_ROLES;

function chapterIdOf(user) {
  if (!user?.chapter) return null;
  return user.chapter._id || user.chapter;
}

function isChapterPresident(user) {
  return user?.systemRole === "president" || user?.chapterRole === "president";
}

function canAssignRoles(user) {
  return isChapterPresident(user) || isVicePresidentRole(user?.chapterRole);
}

function isCabinetUser(user) {
  return isCabinetRole(user?.chapterRole);
}

function isLeadershipApprover(user) {
  return isChapterPresident(user) || isVicePresidentRole(user?.chapterRole);
}

function isCabinetApproverFor(user, applicant) {
  return (
    isCabinetRole(user?.chapterRole) &&
    user.chapterRole === applicant.requestedCabinetRole
  );
}

function canReviewJoinRequest(reviewer, applicant) {
  if (!reviewer || !applicant) return false;
  const cid = chapterIdOf(reviewer);
  if (!cid || String(applicant.chapter) !== String(cid)) return false;
  return isLeadershipApprover(reviewer) || isCabinetApproverFor(reviewer, applicant);
}

function joinApprovalState(u) {
  return {
    leadershipApproved: Boolean(u.leadershipApprovedBy),
    cabinetApproved: Boolean(u.cabinetApprovedBy),
    leadershipApprovedBy: u.leadershipApprovedBy || null,
    cabinetApprovedBy: u.cabinetApprovedBy || null,
    leadershipApprovedAt: u.leadershipApprovedAt || null,
    cabinetApprovedAt: u.cabinetApprovedAt || null,
  };
}

function refId(ref) {
  if (!ref) return null;
  return ref._id || ref;
}

/** Member belongs to this cabinet, or requested this team's seat (general member). */
function canCabinetManageMember(cabinetUser, target) {
  if (!cabinetUser || !target) return false;
  if (target.chapterRole !== "member" && target.chapterRole !== "assistant_director") {
    return false;
  }
  if (target.membershipStatus === "pending" || target.membershipStatus === "rejected") {
    return false;
  }
  if (String(refId(target.cabinetMember)) === String(cabinetUser._id)) return true;
  // Team-related general members (even if linked to another/old cabinet seat)
  return target.requestedCabinetRole === cabinetUser.chapterRole;
}

async function claimOrphanedMembersForCabinet(chapterId, cabinetRole, cabinetUserId) {
  if (!chapterId || !cabinetRole || !cabinetUserId || !isCabinetRole(cabinetRole)) return;
  await User.updateMany(
    {
      chapter: chapterId,
      chapterRole: { $in: ["member", "assistant_director"] },
      requestedCabinetRole: cabinetRole,
      membershipStatus: { $nin: ["pending", "rejected"] },
      $or: [{ cabinetMember: null }, { cabinetMember: { $exists: false } }],
    },
    { $set: { cabinetMember: cabinetUserId } },
  );
}

/** CEO dashboard board: full-access leaders + BOG accounts */
export async function getBoardMembers(req, res, next) {
  try {
    const users = await User.find({
      systemRole: { $in: CEO_DASHBOARD_ROLES },
    })
      .select("-password")
      .sort({ systemRole: 1, name: 1 });

    const order = Object.fromEntries(CEO_DASHBOARD_ROLES.map((r, i) => [r, i]));
    users.sort((a, b) => (order[a.systemRole] ?? 99) - (order[b.systemRole] ?? 99));

    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

/**
 * Chapter president / VP creates VP or cabinet member login.
 * POST /users/chapter-directors
 */
export async function createChapterDirector(req, res, next) {
  try {
    if (!canAssignRoles(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only the president or vice president can create cabinet accounts.",
      });
    }

    const chapterId = chapterIdOf(req.user);
    if (!chapterId) {
      return res.status(400).json({
        success: false,
        message: "Your account is not linked to a chapter.",
      });
    }

    const { name, email, password, phone, chapterRole } = req.body || {};

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }
    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }
    if (!CABINET_ASSIGNABLE_ROLES.includes(chapterRole)) {
      return res.status(400).json({
        success: false,
        message: "Pick a valid role (Vice President or a cabinet seat).",
      });
    }

    const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    const seatTaken = await User.findOne({
      chapter: chapterId,
      chapterRole,
      isActive: true,
    });
    if (seatTaken) {
      return res.status(409).json({
        success: false,
        message: `An active ${chapterRole.replace(/_/g, " ")} already exists (${seatTaken.email}). Deactivate or change that role first.`,
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: String(email).toLowerCase().trim(),
      password,
      phone: phone?.trim() || "",
      systemRole: "member",
      chapterRole,
      chapter: chapterId,
      cabinetMember: null,
      teamDirector: null,
      isActive: true,
      membershipStatus: "approved",
    });

    await Chapter.findByIdAndUpdate(chapterId, { $inc: { memberCount: 1 } });

    // Link approved members who requested this cabinet seat but had no head yet
    if (isCabinetRole(chapterRole)) {
      await claimOrphanedMembersForCabinet(chapterId, chapterRole, user._id);
    }

    const safe = await User.findById(user._id)
      .select("-password")
      .populate("chapter", "name city");
    res.status(201).json({ success: true, data: safe });
  } catch (err) {
    next(err);
  }
}

/**
 * Cabinet member creates a team director under their cabinet.
 * POST /users/team-directors
 */
export async function createTeamDirector(req, res, next) {
  try {
    if (!isCabinetUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only cabinet members can create directors for their team.",
      });
    }

    const chapterId = chapterIdOf(req.user);
    if (!chapterId) {
      return res.status(400).json({
        success: false,
        message: "Your account is not linked to a chapter.",
      });
    }

    const { name, email, password, phone } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }
    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    const user = await User.create({
      name: name.trim(),
      email: String(email).toLowerCase().trim(),
      password,
      phone: phone?.trim() || "",
      systemRole: "member",
      chapterRole: "director",
      chapter: chapterId,
      cabinetMember: req.user._id,
      teamDirector: null,
      isActive: true,
      membershipStatus: "approved",
    });

    await Chapter.findByIdAndUpdate(chapterId, { $inc: { memberCount: 1 } });

    const safe = await User.findById(user._id)
      .select("-password")
      .populate("chapter", "name city")
      .populate("cabinetMember", "name email chapterRole");
    res.status(201).json({ success: true, data: safe });
  } catch (err) {
    next(err);
  }
}

/**
 * Cabinet member creates a general member under their cabinet.
 * POST /users/team-members
 */
export async function createTeamMember(req, res, next) {
  try {
    if (!isCabinetUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only cabinet members can create general members for their team.",
      });
    }

    const chapterId = chapterIdOf(req.user);
    if (!chapterId) {
      return res.status(400).json({
        success: false,
        message: "Your account is not linked to a chapter.",
      });
    }

    const { name, email, password, phone, teamDirector } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }
    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    let directorId = null;
    if (teamDirector && teamDirector !== "none") {
      const director = await User.findById(teamDirector);
      if (
        !director ||
        director.chapterRole !== "director" ||
        String(refId(director.cabinetMember)) !== String(req.user._id) ||
        String(director.chapter) !== String(chapterId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Pick a director from your own cabinet team.",
        });
      }
      directorId = director._id;
    }

    const user = await User.create({
      name: name.trim(),
      email: String(email).toLowerCase().trim(),
      password,
      phone: phone?.trim() || "",
      systemRole: "member",
      chapterRole: "member",
      chapter: chapterId,
      cabinetMember: req.user._id,
      teamDirector: directorId,
      requestedCabinetRole: req.user.chapterRole,
      isActive: true,
      membershipStatus: "approved",
    });

    await Chapter.findByIdAndUpdate(chapterId, { $inc: { memberCount: 1 } });

    const safe = await User.findById(user._id)
      .select("-password")
      .populate("chapter", "name city")
      .populate("cabinetMember", "name email chapterRole")
      .populate("teamDirector", "name email chapterRole");
    res.status(201).json({ success: true, data: safe });
  } catch (err) {
    next(err);
  }
}

/** Leadership creates Founder / CTO / COO / BOG login */
export async function createBogAccount(req, res, next) {
  try {
    const { name, email, password, systemRole, phone } = req.body || {};

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }
    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }
    if (!BOARD_CREATABLE_ROLES.includes(systemRole)) {
      return res.status(400).json({
        success: false,
        message: "Pick a valid board role (Founder, CTO, COO, or a BOG seat).",
      });
    }

    const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    const seatTaken = await User.findOne({ systemRole, isActive: true });
    if (seatTaken) {
      return res.status(409).json({
        success: false,
        message: `An active ${systemRole.replace(/_/g, " ")} account already exists (${seatTaken.email}). Deactivate or delete it first.`,
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: String(email).toLowerCase().trim(),
      password,
      systemRole,
      chapterRole: "member",
      chapter: null,
      phone: phone?.trim() || "",
      isActive: true,
    });

    const safe = await User.findById(user._id).select("-password");
    res.status(201).json({ success: true, data: safe });
  } catch (err) {
    next(err);
  }
}

export async function getAllUsers(req, res, next) {
  try {
    const { role, chapter, page = 1, limit = 50, chapterRole } = req.query;
    const filter = {};
    if (role) filter.systemRole = role;
    if (chapterRole) filter.chapterRole = chapterRole;

    if (USER_LEADERSHIP.has(req.user.systemRole)) {
      if (chapter) filter.chapter = chapter;
    } else {
      const cid = chapterIdOf(req.user);
      if (cid) filter.chapter = cid;
      else filter.chapter = null;
      if (isCabinetUser(req.user) && !canAssignRoles(req.user)) {
        // Attach unlinked members who requested this team
        await claimOrphanedMembersForCabinet(cid, req.user.chapterRole, req.user._id);
        // Self + directors/members already under this cabinet + all general members
        // who requested this team's seat (so cabinet can assign a director)
        filter.$or = [
          { cabinetMember: req.user._id },
          { _id: req.user._id },
          {
            chapterRole: { $in: ["member", "assistant_director"] },
            requestedCabinetRole: req.user.chapterRole,
            membershipStatus: { $nin: ["pending", "rejected"] },
          },
        ];
      }
    }

    // Pending join requests are managed separately
    filter.membershipStatus = { $ne: "pending" };

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .skip(skip)
        .limit(Number(limit))
        .populate("chapter", "name city")
        .populate("cabinetMember", "name email chapterRole")
        .populate("teamDirector", "name email chapterRole")
        .sort({ createdAt: -1 }),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, total, page: Number(page), data: users });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /users/join-requests
 * President, both VPs, and the matching cabinet head see pending join requests.
 */
export async function listJoinRequests(req, res, next) {
  try {
    const chapterId = chapterIdOf(req.user);
    if (!chapterId) {
      return res.status(400).json({
        success: false,
        message: "Your account is not linked to a chapter.",
      });
    }

    const isLeader = isLeadershipApprover(req.user);
    const isCabinetHead = isCabinetRole(req.user.chapterRole);
    if (!isLeader && !isCabinetHead) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const filter = {
      chapter: chapterId,
      membershipStatus: "pending",
      systemRole: "member",
      chapterRole: "member",
    };
    if (!isLeader && isCabinetHead) {
      filter.requestedCabinetRole = req.user.chapterRole;
    }

    const data = await User.find(filter)
      .select("-password")
      .populate("leadershipApprovedBy", "name email chapterRole")
      .populate("cabinetApprovedBy", "name email chapterRole")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      total: data.length,
      data: data.map((u) => ({
        ...u,
        teamLabel: TEAM_LABEL[u.requestedCabinetRole] || u.requestedCabinetRole || "—",
        approvals: joinApprovalState(u),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /users/:id/join-approve
 * Any one of president / VPs / that team's cabinet head can approve — then they can log in.
 */
export async function approveJoinRequest(req, res, next) {
  try {
    const applicant = await User.findById(req.params.id);
    if (!applicant || applicant.membershipStatus !== "pending") {
      return res.status(404).json({ success: false, message: "Pending join request not found." });
    }
    if (!canReviewJoinRequest(req.user, applicant)) {
      return res.status(403).json({
        success: false,
        message: "Only the president, vice presidents, or that team's cabinet head can approve.",
      });
    }

    if (isLeadershipApprover(req.user)) {
      applicant.leadershipApprovedBy = req.user._id;
      applicant.leadershipApprovedAt = new Date();
    } else if (isCabinetApproverFor(req.user, applicant)) {
      applicant.cabinetApprovedBy = req.user._id;
      applicant.cabinetApprovedAt = new Date();
    }

    const chapterId = chapterIdOf(applicant);
    const cabinetHead = applicant.requestedCabinetRole
      ? await User.findOne({
          chapter: chapterId,
          chapterRole: applicant.requestedCabinetRole,
          isActive: { $ne: false },
          membershipStatus: { $nin: ["pending", "rejected"] },
        }).select("_id")
      : null;

    // Prefer approving cabinet head, then active seat for that team, then prior cabinet sign-off
    let cabinetMemberId = null;
    if (isCabinetApproverFor(req.user, applicant)) {
      cabinetMemberId = req.user._id;
    } else if (cabinetHead?._id) {
      cabinetMemberId = cabinetHead._id;
    } else if (applicant.cabinetApprovedBy) {
      cabinetMemberId = applicant.cabinetApprovedBy;
    }

    applicant.membershipStatus = "approved";
    applicant.membershipApprovedBy = req.user._id;
    applicant.membershipApprovedAt = new Date();
    applicant.cabinetMember = cabinetMemberId;
    applicant.teamDirector = null;
    await applicant.save();
    await Chapter.findByIdAndUpdate(chapterId, { $inc: { memberCount: 1 } });

    const safe = await User.findById(applicant._id)
      .select("-password")
      .populate("cabinetMember", "name email chapterRole")
      .populate("chapter", "name city");

    res.json({
      success: true,
      message: "Member approved. They can now log in.",
      data: safe,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /users/:id/join-reject
 */
export async function rejectJoinRequest(req, res, next) {
  try {
    const applicant = await User.findById(req.params.id);
    if (!applicant || applicant.membershipStatus !== "pending") {
      return res.status(404).json({ success: false, message: "Pending join request not found." });
    }
    if (!canReviewJoinRequest(req.user, applicant)) {
      return res.status(403).json({
        success: false,
        message: "Only the president, vice presidents, or that team's cabinet head can reject.",
      });
    }

    applicant.membershipStatus = "rejected";
    applicant.membershipApprovedBy = req.user._id;
    applicant.membershipApprovedAt = new Date();
    await applicant.save();

    res.json({
      success: true,
      message: "Join request rejected.",
      data: {
        _id: applicant._id,
        email: applicant.email,
        membershipStatus: applicant.membershipStatus,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id).populate("chapter", "name city");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

/**
 * CEO dashboard: all chapter login accounts, optional chapter + search filter,
 * with per-member team-donation totals.
 * GET /users/chapter-members?chapter=&q=
 */
export async function listChapterMembersForCeo(req, res, next) {
  try {
    const { chapter, q } = req.query;
    const filter = {
      chapter: { $ne: null },
      systemRole: { $nin: CEO_DASHBOARD_ROLES },
    };

    if (chapter && String(chapter) !== "all") {
      filter.chapter = chapter;
    }

    if (q?.trim()) {
      const needle = String(q).trim();
      const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }

    const users = await User.find(filter)
      .select("-password")
      .populate("chapter", "name city")
      .populate("teamDirector", "name email chapterRole")
      .populate("cabinetMember", "name email chapterRole")
      .sort({ name: 1 })
      .lean();

    const donorIds = users.map((u) => u._id);
    const totals =
      donorIds.length === 0
        ? []
        : await ChapterTeamDonation.aggregate([
            { $match: { donor: { $in: donorIds } } },
            {
              $group: {
                _id: "$donor",
                total: { $sum: "$amount" },
                verified: {
                  $sum: { $cond: [{ $eq: ["$status", "verified"] }, "$amount", 0] },
                },
                pending: {
                  $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] },
                },
                count: { $sum: 1 },
              },
            },
          ]);

    const byDonor = Object.fromEntries(totals.map((t) => [String(t._id), t]));

    const data = users.map((u) => {
      const t = byDonor[String(u._id)];
      return {
        ...u,
        donationTotals: {
          total: t?.total || 0,
          verified: t?.verified || 0,
          pending: t?.pending || 0,
          count: t?.count || 0,
        },
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * CEO dashboard: one chapter member profile + all their team donations.
 * GET /users/:id/chapter-detail
 */
export async function getChapterMemberDetailForCeo(req, res, next) {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("chapter", "name city")
      .populate("teamDirector", "name email chapterRole phone")
      .populate("cabinetMember", "name email chapterRole phone")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    if (!user.chapter) {
      return res.status(400).json({
        success: false,
        message: "This account is not linked to a chapter.",
      });
    }
    if (CEO_DASHBOARD_ROLES.includes(user.systemRole)) {
      return res.status(400).json({
        success: false,
        message: "CEO / Board accounts are not chapter members.",
      });
    }

    const donations = await ChapterTeamDonation.find({ donor: user._id })
      .populate("teamDirector", "name chapterRole")
      .populate("verifiedBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    const donationTotals = {
      pending: 0,
      verified: 0,
      rejected: 0,
      count: donations.length,
      grandTotal: 0,
    };
    for (const d of donations) {
      const key = d.status || "pending";
      if (key in donationTotals) donationTotals[key] += d.amount || 0;
      if (key === "pending" || key === "verified") {
        donationTotals.grandTotal += d.amount || 0;
      }
    }

    res.json({
      success: true,
      data: { user, donations, donationTotals },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const targetId = req.params.id;
    const isSelf = String(req.user._id) === String(targetId);
    const isLeader = isFullAccessRole(req.user.systemRole);
    const asAssigner = canAssignRoles(req.user);
    const asCabinet = isCabinetUser(req.user);

    if (!isSelf && !isLeader && !asAssigner && !asCabinet) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Anyone may update their own profile (name / email / phone) on any dashboard
    if (isSelf) {
      if (
        req.body.chapterRole !== undefined ||
        req.body.teamDirector !== undefined ||
        req.body.cabinetMember !== undefined ||
        req.body.systemRole !== undefined
      ) {
        return res.status(403).json({
          success: false,
          message: "You cannot change your own role or team assignment.",
        });
      }
      const profileUpdates = {};
      for (const key of ["name", "phone", "avatar", "email"]) {
        if (req.body[key] !== undefined) profileUpdates[key] = req.body[key];
      }
      if (profileUpdates.email !== undefined) {
        const nextEmail = String(profileUpdates.email).toLowerCase().trim();
        if (!nextEmail) {
          return res.status(400).json({ success: false, message: "Email is required." });
        }
        const taken = await User.findOne({ email: nextEmail, _id: { $ne: targetId } });
        if (taken) {
          return res.status(409).json({
            success: false,
            message: "That email is already in use.",
          });
        }
        profileUpdates.email = nextEmail;
      }
      const user = await User.findByIdAndUpdate(targetId, profileUpdates, {
        new: true,
        runValidators: true,
      })
        .populate("chapter", "name city")
        .populate("cabinetMember", "name email chapterRole")
        .populate("teamDirector", "name email chapterRole");
      if (!user) return res.status(404).json({ success: false, message: "User not found." });
      return res.json({ success: true, data: user });
    }

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    const cid = chapterIdOf(req.user);

    if (!isLeader && String(target.chapter) !== String(cid)) {
      return res.status(403).json({ success: false, message: "User is not in your chapter." });
    }

    const updates = {};
    const allowed = isLeader
      ? [
          "name",
          "email",
          "phone",
          "avatar",
          "chapterRole",
          "systemRole",
          "chapter",
          "teamDirector",
          "cabinetMember",
          "isActive",
        ]
      : asAssigner
        ? ["name", "email", "phone", "avatar", "chapterRole", "isActive"]
        : ["teamDirector"];

    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.email !== undefined) {
      const nextEmail = String(updates.email).toLowerCase().trim();
      if (!nextEmail) {
        return res.status(400).json({ success: false, message: "Email is required." });
      }
      const taken = await User.findOne({ email: nextEmail, _id: { $ne: targetId } });
      if (taken) {
        return res.status(409).json({
          success: false,
          message: "That email is already in use.",
        });
      }
      updates.email = nextEmail;
    }

    if (updates.teamDirector === "" || updates.teamDirector === "none") {
      updates.teamDirector = null;
    }
    if (updates.cabinetMember === "" || updates.cabinetMember === "none") {
      updates.cabinetMember = null;
    }

    // Cabinet: claim unassigned team members + assign them to a director
    if (!isLeader && asCabinet && !asAssigner) {
      if (updates.chapterRole !== undefined || updates.cabinetMember !== undefined) {
        return res.status(403).json({
          success: false,
          message: "Cabinet members can only assign members to their directors.",
        });
      }
      if (updates.teamDirector !== undefined) {
        if (!canCabinetManageMember(req.user, target)) {
          return res.status(403).json({
            success: false,
            message: "You can only assign members who belong to your cabinet.",
          });
        }
        // Claim / re-link team-related general members to this cabinet head
        if (String(refId(target.cabinetMember) || "") !== String(req.user._id)) {
          updates.cabinetMember = req.user._id;
        }
        if (updates.teamDirector) {
          const director = await User.findById(updates.teamDirector);
          if (
            !director ||
            director.chapterRole !== "director" ||
            String(refId(director.cabinetMember)) !== String(req.user._id) ||
            String(director.chapter) !== String(cid)
          ) {
            return res.status(400).json({
              success: false,
              message: "Pick a director from your own cabinet team.",
            });
          }
        }
      }
    }

    // President / VP: create/change VP & cabinet seats only — members join via cabinet verification
    if (!isLeader && asAssigner) {
      if (updates.teamDirector !== undefined || updates.cabinetMember !== undefined) {
        return res.status(403).json({
          success: false,
          message:
            "President and VPs do not assign members. Cabinet heads assign approved members to directors.",
        });
      }
      if (updates.chapterRole !== undefined) {
        if (
          updates.chapterRole !== "member" &&
          !CABINET_ASSIGNABLE_ROLES.includes(updates.chapterRole)
        ) {
          return res.status(400).json({
            success: false,
            message: "That role cannot be assigned.",
          });
        }
        if (target.systemRole === "president" || target.chapterRole === "president") {
          return res.status(403).json({
            success: false,
            message: "Cannot change the president account role from here.",
          });
        }
        if (isCabinetRole(updates.chapterRole) || isOwnCollectionRole(updates.chapterRole)) {
          updates.cabinetMember = null;
          updates.teamDirector = null;
        }
      }
    }

    if (isLeader && updates.systemRole !== undefined) {
      if (isFullAccessRole(target.systemRole) && updates.systemRole !== target.systemRole) {
        return res.status(400).json({
          success: false,
          message: "Cannot change a full-access leadership role from here.",
        });
      }
      if (isFullAccessRole(updates.systemRole) && !isFullAccessRole(target.systemRole)) {
        return res.status(400).json({
          success: false,
          message: "Cannot promote to a full-access seat from here — use Add board account.",
        });
      }
      if (BOARD_CREATABLE_ROLES.includes(updates.systemRole)) {
        const seatTaken = await User.findOne({
          systemRole: updates.systemRole,
          isActive: true,
          _id: { $ne: targetId },
        });
        if (seatTaken) {
          return res.status(409).json({
            success: false,
            message: `An active ${updates.systemRole.replace(/_/g, " ")} account already exists.`,
          });
        }
      }
    }

    if (req.body.password && isLeader) {
      if (String(req.body.password).length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters.",
        });
      }
      const pwTarget = await User.findById(targetId).select("+password");
      if (!pwTarget) return res.status(404).json({ success: false, message: "User not found." });
      Object.assign(pwTarget, updates);
      pwTarget.password = req.body.password;
      pwTarget.passwordChangedAt = new Date();
      await pwTarget.save();
      const safe = await User.findById(targetId)
        .populate("chapter", "name city")
        .populate("cabinetMember", "name email chapterRole")
        .populate("teamDirector", "name email chapterRole");
      return res.json({ success: true, data: safe });
    }

    const user = await User.findByIdAndUpdate(targetId, updates, {
      new: true,
      runValidators: true,
    })
      .populate("chapter", "name city")
      .populate("cabinetMember", "name email chapterRole")
      .populate("teamDirector", "name email chapterRole");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    // When someone becomes a cabinet head, attach approved orphans who requested that team
    if (updates.chapterRole && isCabinetRole(updates.chapterRole)) {
      const chapterForClaim = chapterIdOf(user) || cid;
      await claimOrphanedMembersForCabinet(chapterForClaim, updates.chapterRole, user._id);
    }

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    if (String(target._id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "Cannot delete your own account." });
    }

    const actorRole = req.user.systemRole;
    const targetRole = target.systemRole;
    const actorIsLeader = isFullAccessRole(actorRole);
    const actorIsPresident =
      actorRole === "president" || req.user.chapterRole === "president";

    if (!actorIsLeader && !actorIsPresident) {
      return res.status(403).json({
        success: false,
        message: "Only CEO / Founder / CTO / COO, or a chapter president, can delete accounts.",
      });
    }

    // President: only chapter members in their own chapter
    if (actorIsPresident && !actorIsLeader) {
      const actorChapter = chapterIdOf(req.user);
      const targetChapter = chapterIdOf(target);
      if (!actorChapter || !targetChapter || String(actorChapter) !== String(targetChapter)) {
        return res.status(403).json({
          success: false,
          message: "You can only delete members from your own chapter.",
        });
      }
      if (CEO_DASHBOARD_ROLES.includes(targetRole)) {
        return res.status(403).json({
          success: false,
          message: "Chapter presidents cannot delete CEO / Board accounts.",
        });
      }
      if (targetRole === "president" || target.chapterRole === "president") {
        return res.status(403).json({
          success: false,
          message: "You cannot delete the chapter president account.",
        });
      }
    }

    // Full-access leaders may delete chapter members and any BOG seat.
    // Only Founder may delete another full-access seat (CEO / CTO / COO / Founder).
    if (actorIsLeader && isFullAccessRole(targetRole) && actorRole !== "founder") {
      return res.status(403).json({
        success: false,
        message: "Cannot delete a full-access leadership account (CEO / Founder / CTO / COO).",
      });
    }

    const targetChapterId = chapterIdOf(target);

    // Unlink chapter.president if this user was the chapter president
    if (targetChapterId && (targetRole === "president" || target.chapterRole === "president")) {
      await Chapter.updateMany(
        { _id: targetChapterId, president: target._id },
        { $set: { president: null } },
      );
    }

    // Clear references from other users in the chapter
    if (targetChapterId) {
      await User.updateMany(
        { chapter: targetChapterId, teamDirector: target._id },
        { $set: { teamDirector: null } },
      );
      await User.updateMany(
        { chapter: targetChapterId, cabinetMember: target._id },
        { $set: { cabinetMember: null } },
      );
      await Chapter.findByIdAndUpdate(targetChapterId, { $inc: { memberCount: -1 } }).catch(
        () => {},
      );
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Account deleted." });
  } catch (err) {
    next(err);
  }
}
