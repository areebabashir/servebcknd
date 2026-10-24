import ChapterTeamDonation from "../models/ChapterTeamDonation.js";
import Chapter from "../models/Chapter.js";
import User, { CEO_DASHBOARD_ROLES, isFullAccessRole } from "../models/User.js";
import mongoose from "mongoose";
import { uploadToCloudinary } from "../middleware/upload.js";
import { isOwnCollectionRole, isCabinetRole, isTeamDirectorRole, isValidTeamLeadRole, TEAM_HEAD_ROLES } from "../lib/teamHeads.js";
import { sendEmail } from "../utils/email.js";

function isCeoBoardDonor(user) {
  return Boolean(user?.systemRole && CEO_DASHBOARD_ROLES.includes(user.systemRole));
}

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const TZ = "Asia/Karachi";

function karachiYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function monthBounds(year, month) {
  const pad = (n) => String(n).padStart(2, "0");
  const start = new Date(`${year}-${pad(month)}-01T00:00:00+05:00`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = new Date(`${nextYear}-${pad(nextMonth)}-01T00:00:00+05:00`);
  return { start, end };
}

function chapterIdOf(user) {
  if (!user?.chapter) return null;
  return user.chapter._id || user.chapter;
}

function isPresident(user) {
  return user?.systemRole === "president" || user?.chapterRole === "president";
}

function isFinanceDirector(user) {
  return user?.chapterRole === "finance_head";
}

/** President / VP / cabinet — personal donations only, no director team. */
function hasOwnCollection(user) {
  return isPresident(user) || isOwnCollectionRole(user?.chapterRole) || isCabinetRole(user?.chapterRole);
}

/** Donations are verified by Finance Director */
function canVerify(user) {
  return isFinanceDirector(user);
}

function canViewAll(user) {
  return (
    isPresident(user) ||
    isFinanceDirector(user) ||
    user?.chapterRole === "vice_president" ||
    user?.chapterRole === "vice_president_male"
  );
}

function canViewDirectorTotals(user) {
  return canViewAll(user) || isCabinetRole(user?.chapterRole);
}

async function assertValidTeamLead(headId, chapterId) {
  const head = await User.findById(headId).select("chapter chapterRole name");
  if (!head || String(head.chapter) !== String(chapterId) || !isValidTeamLeadRole(head.chapterRole)) {
    return null;
  }
  return head;
}

/**
 * Resolve calendar month period from query.
 * Default = current month. Use month=all (or scope=all) for all-time.
 */
function resolvePeriod(query = {}) {
  if (query.month === "all" || query.scope === "all") return null;

  const nowParts = karachiYmd();
  const year = Number(query.year) || nowParts.year;
  const month = Number(query.month) || nowParts.month;

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const { start, end } = monthBounds(nowParts.year, nowParts.month);
    return {
      year: nowParts.year,
      month: nowParts.month,
      label: `${MONTH_NAMES[nowParts.month]} ${nowParts.year}`,
      start,
      end,
    };
  }

  const { start, end } = monthBounds(year, month);
  return {
    year,
    month,
    label: `${MONTH_NAMES[month]} ${year}`,
    start,
    end,
  };
}

function applyPeriodFilter(filter, period) {
  if (!period) return filter;
  filter.createdAt = { $gte: period.start, $lt: period.end };
  return filter;
}

function sumByStatus(rows) {
  const pendingTotal = rows
    .filter((d) => d.status === "pending")
    .reduce((s, d) => s + (d.amount || 0), 0);
  const verifiedTotal = rows
    .filter((d) => d.status === "verified")
    .reduce((s, d) => s + (d.amount || 0), 0);
  return {
    pendingTotal,
    verifiedTotal,
    grandTotal: pendingTotal + verifiedTotal,
  };
}

async function monthHistory(matchFilter) {
  const rows = await ChapterTeamDonation.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: {
          year: { $year: { date: "$createdAt", timezone: TZ } },
          month: { $month: { date: "$createdAt", timezone: TZ } },
        },
        pending: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] },
        },
        verified: {
          $sum: { $cond: [{ $eq: ["$status", "verified"] }, "$amount", 0] },
        },
        rejected: {
          $sum: { $cond: [{ $eq: ["$status", "rejected"] }, "$amount", 0] },
        },
        total: {
          $sum: {
            $cond: [{ $in: ["$status", ["pending", "verified"]] }, "$amount", 0],
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } },
  ]);

  return rows.map((r) => ({
    year: r._id.year,
    month: r._id.month,
    label: `${MONTH_NAMES[r._id.month] || r._id.month} ${r._id.year}`,
    pending: r.pending || 0,
    verified: r.verified || 0,
    rejected: r.rejected || 0,
    total: r.total || 0,
    count: r.count || 0,
  }));
}

function periodMeta(period) {
  if (!period) return { scope: "all", label: "All time" };
  return {
    scope: "month",
    year: period.year,
    month: period.month,
    label: period.label,
  };
}

/** Member submits amount + optional screenshot */
export async function createChapterDonation(req, res, next) {
  try {
    const cid = chapterIdOf(req.user);
    if (!cid) {
      return res.status(400).json({
        success: false,
        message: "Your account is not assigned to a chapter.",
      });
    }

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid donation amount greater than 0.",
      });
    }

    let screenshotUrl = "";
    let screenshotPublicId = "";
    if (req.file) {
      const result = await uploadToCloudinary(req.file, "serve-humanity/chapter-donations");
      screenshotUrl = result.secure_url;
      screenshotPublicId = result.public_id || "";
    }

    // President / VP / cabinet donate to their own collection.
    // Directors donate into their own team. Members must be assigned to a director.
    let teamDirectorId = null;
    if (isTeamDirectorRole(req.user.chapterRole)) {
      teamDirectorId = req.user._id;
    } else if (!hasOwnCollection(req.user)) {
      let teamDirector = req.user.teamDirector || null;
      if (teamDirector && typeof teamDirector === "object") {
        teamDirector = teamDirector._id || teamDirector;
      }
      if (req.body.teamDirector) teamDirector = req.body.teamDirector;

      if (!teamDirector) {
        return res.status(400).json({
          success: false,
          message: "You are not assigned to a director yet. Ask your cabinet member to assign you.",
        });
      }

      const head = await assertValidTeamLead(teamDirector, cid);
      if (!head) {
        return res.status(400).json({
          success: false,
          message: "Selected director team is invalid for your chapter.",
        });
      }
      teamDirectorId = head._id;
    }

    const doc = await ChapterTeamDonation.create({
      chapter: cid,
      donor: req.user._id,
      teamDirector: teamDirectorId,
      source: "chapter",
      amount,
      screenshotUrl,
      screenshotPublicId,
      note: req.body.note || "",
      status: "pending",
    });

    const populated = await ChapterTeamDonation.findById(doc._id)
      .populate("donor", "name email")
      .populate("teamDirector", "name email chapterRole")
      .populate("chapter", "name city");

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

/**
 * BOG / CEO / Founder / CTO / COO: donate to a chapter by selecting it.
 * Goes to that chapter's Finance Director for verify; then counts in chapter funds.
 */
export async function createBogDonation(req, res, next) {
  try {
    if (!isCeoBoardDonor(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only CEO / Board / BOG accounts can use this donation form.",
      });
    }

    const chapterId = req.body.chapterId || req.body.chapter;
    if (!chapterId || !mongoose.Types.ObjectId.isValid(chapterId)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid chapter.",
      });
    }

    const chapter = await Chapter.findById(chapterId).select("name city status donationAccounts");
    if (!chapter || chapter.status === "inactive") {
      return res.status(404).json({
        success: false,
        message: "Chapter not found or inactive.",
      });
    }

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid donation amount greater than 0.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Upload a payment screenshot.",
      });
    }

    const result = await uploadToCloudinary(req.file, "serve-humanity/bog-donations");
    const screenshotUrl = result.secure_url;
    const screenshotPublicId = result.public_id || "";

    const doc = await ChapterTeamDonation.create({
      chapter: chapter._id,
      donor: req.user._id,
      teamDirector: null,
      source: "bog",
      amount,
      screenshotUrl,
      screenshotPublicId,
      note: req.body.note || "",
      status: "pending",
    });

    // Notify chapter finance team (and president as backup).
    const financeUsers = await User.find({
      chapter: chapter._id,
      isActive: { $ne: false },
      $or: [
        { chapterRole: "finance_head" },
        { chapterRole: "president" },
        { systemRole: "president" },
      ],
    })
      .select("name email chapterRole")
      .lean();

    const donorName = req.user.name || "A board member";
    const amtLabel = `PKR ${amount.toLocaleString()}`;
    await Promise.all(
      financeUsers
        .filter((u) => u.email?.trim())
        .map(async (u) => {
          try {
            await sendEmail({
              to: u.email,
              subject: `BOG donation pending — ${chapter.name}`,
              text: `${donorName} submitted a ${amtLabel} donation for ${chapter.name} (${chapter.city || ""}). Please verify it in Chapter → Director donations.`,
              html: `<p><strong>${donorName}</strong> submitted a <strong>${amtLabel}</strong> donation for <strong>${chapter.name}</strong>${chapter.city ? ` (${chapter.city})` : ""}.</p><p>Please open the chapter dashboard → <strong>Director donations</strong> to accept or reject this request.</p>`,
            });
          } catch {
            /* non-blocking */
          }
        }),
    );

    const populated = await ChapterTeamDonation.findById(doc._id)
      .populate("donor", "name email systemRole")
      .populate("chapter", "name city");

    res.status(201).json({
      success: true,
      message: "Donation submitted. The chapter finance team will verify it.",
      data: populated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List BOG donations for the CEO dashboard.
 * - mine=1 (default for personal totals): current user's donations, all-time
 * - scope=all: every BOG donation (all CEO-dashboard roles can view)
 */
export async function listBogDonations(req, res, next) {
  try {
    if (!isCeoBoardDonor(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only CEO / Board / BOG accounts can view these donations.",
      });
    }

    const scopeAll = req.query.scope === "all" || req.query.mine === "0";
    const baseFilter = { source: "bog" };
    if (!scopeAll) {
      baseFilter.donor = req.user._id;
    }
    if (req.query.chapter) baseFilter.chapter = req.query.chapter;
    if (req.query.status) baseFilter.status = req.query.status;

    const period = resolvePeriod({ ...req.query, month: req.query.month || "all" });
    const listFilter = applyPeriodFilter({ ...baseFilter }, period);

    const [data, mineAgg, orgAgg] = await Promise.all([
      ChapterTeamDonation.find(listFilter)
        .populate("donor", "name email systemRole")
        .populate("chapter", "name city")
        .populate("verifiedBy", "name email")
        .sort({ createdAt: -1 })
        .lean(),
      ChapterTeamDonation.aggregate([
        { $match: { source: "bog", donor: req.user._id } },
        {
          $group: {
            _id: "$status",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      ChapterTeamDonation.aggregate([
        { $match: { source: "bog" } },
        {
          $group: {
            _id: "$status",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const pick = (rows, status) => {
      const hit = rows.find((r) => r._id === status);
      return { total: hit?.total || 0, count: hit?.count || 0 };
    };

    const minePending = pick(mineAgg, "pending");
    const mineVerified = pick(mineAgg, "verified");
    const orgPending = pick(orgAgg, "pending");
    const orgVerified = pick(orgAgg, "verified");

    res.json({
      success: true,
      total: data.length,
      ...sumByStatus(data),
      period: periodMeta(period),
      mine: {
        pendingTotal: minePending.total,
        pendingCount: minePending.count,
        verifiedTotal: mineVerified.total,
        verifiedCount: mineVerified.count,
        lifetimeTotal: mineVerified.total,
      },
      org: {
        pendingTotal: orgPending.total,
        pendingCount: orgPending.count,
        verifiedTotal: orgVerified.total,
        verifiedCount: orgVerified.count,
        lifetimeTotal: orgVerified.total,
      },
      canViewAll: true,
      isFullAccess: isFullAccessRole(req.user.systemRole),
      data,
    });
  } catch (err) {
    next(err);
  }
}

/** List donations — scoped by role; totals default to current month */
export async function listChapterDonations(req, res, next) {
  try {
    const cid = chapterIdOf(req.user);
    if (!cid && req.user.systemRole !== "ceo") {
      return res.status(400).json({
        success: false,
        message: "Your account is not assigned to a chapter.",
      });
    }

    const period = resolvePeriod(req.query);
    const baseFilter = {};
    if (cid) baseFilter.chapter = cid;
    if (req.query.chapter && req.user.systemRole === "ceo") {
      baseFilter.chapter = req.query.chapter;
    }

    const { status, mine, directorId } = req.query;
    if (status) baseFilter.status = status;

    if (mine === "1") {
      baseFilter.donor = req.user._id;
    } else if (canViewAll(req.user)) {
      if (directorId) baseFilter.teamDirector = directorId;
    } else if (isCabinetRole(req.user.chapterRole)) {
      // Cabinet head: donations from their directors' teams (not teamDirector = self)
      const directors = await User.find({
        chapter: cid,
        chapterRole: "director",
        cabinetMember: req.user._id,
        isActive: { $ne: false },
      }).select("_id");
      baseFilter.teamDirector = { $in: directors.map((d) => d._id) };
    } else if (isTeamDirectorRole(req.user.chapterRole)) {
      baseFilter.teamDirector = req.user._id;
    } else {
      baseFilter.donor = req.user._id;
    }

    const listFilter = applyPeriodFilter({ ...baseFilter }, period);
    const historyMatch = { ...baseFilter };
    // history should ignore status filter so month archive is complete
    delete historyMatch.status;

    const [data, byMonth] = await Promise.all([
      ChapterTeamDonation.find(listFilter)
        .populate("donor", "name email chapterRole systemRole")
        .populate("teamDirector", "name email chapterRole")
        .populate("verifiedBy", "name email")
        .sort({ createdAt: -1 })
        .lean(),
      monthHistory(historyMatch),
    ]);

    const totals = sumByStatus(data);

    res.json({
      success: true,
      total: data.length,
      ...totals,
      period: periodMeta(period),
      byMonth,
      data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Director: members assigned to them + their donations.
 * Cabinet head: all members in their cabinet + donations under their directors.
 */
export async function myTeamCollection(req, res, next) {
  try {
    const cid = chapterIdOf(req.user);
    if (!cid) {
      return res.status(400).json({
        success: false,
        message: "Your account is not assigned to a chapter.",
      });
    }

    const asCabinet = isCabinetRole(req.user.chapterRole);
    const asDirector = isTeamDirectorRole(req.user.chapterRole);
    if (!asCabinet && !asDirector) {
      return res.status(403).json({
        success: false,
        message: "Only directors and cabinet heads have a team collection.",
      });
    }

    const period = resolvePeriod(req.query);
    let baseFilter;
    let memberQuery;

    if (asCabinet) {
      const directors = await User.find({
        chapter: cid,
        chapterRole: "director",
        cabinetMember: req.user._id,
        isActive: { $ne: false },
      })
        .select("_id name email phone chapterRole")
        .sort({ name: 1 })
        .lean();

      const directorIds = directors.map((d) => d._id);
      baseFilter = { chapter: cid, teamDirector: { $in: directorIds } };
      memberQuery = {
        chapter: cid,
        chapterRole: { $in: ["member", "assistant_director"] },
        isActive: { $ne: false },
        membershipStatus: { $nin: ["pending", "rejected"] },
        $or: [
          { cabinetMember: req.user._id },
          { requestedCabinetRole: req.user.chapterRole },
        ],
      };

      const listFilter = applyPeriodFilter({ ...baseFilter }, period);
      const [data, byMonth, members] = await Promise.all([
        ChapterTeamDonation.find(listFilter)
          .populate("donor", "name email")
          .populate("teamDirector", "name email")
          .populate("verifiedBy", "name email")
          .sort({ createdAt: -1 })
          .lean(),
        monthHistory(baseFilter),
        User.find(memberQuery)
          .select("name email phone chapterRole avatar lastLogin teamDirector")
          .populate("teamDirector", "name email")
          .sort({ name: 1 })
          .lean(),
      ]);

      const totals = sumByStatus(data);
      return res.json({
        success: true,
        scope: "cabinet",
        ...totals,
        period: periodMeta(period),
        byMonth,
        directors,
        members,
        data,
      });
    }

    baseFilter = { chapter: cid, teamDirector: req.user._id };
    const listFilter = applyPeriodFilter({ ...baseFilter }, period);

    const [data, byMonth, members] = await Promise.all([
      ChapterTeamDonation.find(listFilter)
        .populate("donor", "name email")
        .populate("verifiedBy", "name email")
        .sort({ createdAt: -1 })
        .lean(),
      monthHistory(baseFilter),
      User.find({
        chapter: cid,
        teamDirector: req.user._id,
        chapterRole: { $in: ["member", "assistant_director"] },
        isActive: { $ne: false },
      })
        .select("name email phone chapterRole avatar lastLogin")
        .sort({ name: 1 })
        .lean(),
    ]);

    const totals = sumByStatus(data);

    res.json({
      success: true,
      scope: "director",
      ...totals,
      period: periodMeta(period),
      byMonth,
      members,
      data,
    });
  } catch (err) {
    next(err);
  }
}

/** President / finance / cabinet: totals grouped by director (current month by default) */
export async function directorTeamTotals(req, res, next) {
  try {
    if (!canViewDirectorTotals(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    const cid = chapterIdOf(req.user);
    if (!cid) {
      return res.status(400).json({
        success: false,
        message: "Your account is not assigned to a chapter.",
      });
    }

    const isCabinetView = isCabinetRole(req.user.chapterRole);
    const period = resolvePeriod(req.query);
    const chapterOid = new mongoose.Types.ObjectId(String(cid));
    const match = { chapter: chapterOid };

    let directorQuery = {
      chapter: cid,
      chapterRole: { $in: ["director", ...TEAM_HEAD_ROLES] },
      isActive: true,
    };
    if (isCabinetView) {
      directorQuery = {
        chapter: cid,
        chapterRole: "director",
        cabinetMember: req.user._id,
        isActive: true,
      };
    }

    const directors = await User.find(directorQuery)
      .select("name email chapterRole phone")
      .sort({ name: 1 })
      .lean();

    const directorIds = directors.map((d) => d._id);
    if (isCabinetView && directorIds.length > 0) {
      match.teamDirector = { $in: directorIds };
    } else if (isCabinetView) {
      match.teamDirector = { $in: [] };
    }

    if (period) {
      match.createdAt = { $gte: period.start, $lt: period.end };
    }

    const [rows, byMonth, allMembers, unassignedMembers, cabinetMembers, bogRows] = await Promise.all([
      ChapterTeamDonation.aggregate([
        { $match: { ...match, source: { $ne: "bog" } } },
        {
          $group: {
            _id: { teamDirector: "$teamDirector", status: "$status" },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      monthHistory(isCabinetView ? { chapter: chapterOid, teamDirector: { $in: directorIds } } : { chapter: chapterOid }),
      directorIds.length
        ? User.find({
            chapter: cid,
            teamDirector: { $in: directorIds },
            chapterRole: { $in: ["member", "assistant_director"] },
            isActive: { $ne: false },
          })
            .select("name email phone teamDirector")
            .sort({ name: 1 })
            .lean()
        : Promise.resolve([]),
      isCabinetView
        ? User.find({
            chapter: cid,
            cabinetMember: req.user._id,
            chapterRole: { $in: ["member", "assistant_director"] },
            $or: [{ teamDirector: null }, { teamDirector: { $exists: false } }],
            isActive: { $ne: false },
          })
            .select("name email phone")
            .sort({ name: 1 })
            .lean()
        : Promise.resolve([]),
      // Every general member related to this cabinet team
      isCabinetView
        ? User.find({
            chapter: cid,
            chapterRole: { $in: ["member", "assistant_director"] },
            isActive: { $ne: false },
            membershipStatus: { $nin: ["pending", "rejected"] },
            $or: [
              { cabinetMember: req.user._id },
              { requestedCabinetRole: req.user.chapterRole },
            ],
          })
            .select("name email phone teamDirector")
            .populate("teamDirector", "name")
            .sort({ name: 1 })
            .lean()
        : Promise.resolve([]),
      ChapterTeamDonation.aggregate([
        { $match: { ...match, source: "bog" } },
        {
          $group: {
            _id: "$status",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const membersByDirector = new Map();
    for (const m of allMembers) {
      const key = String(m.teamDirector);
      if (!membersByDirector.has(key)) membersByDirector.set(key, []);
      membersByDirector.get(key).push({
        _id: m._id,
        name: m.name,
        email: m.email,
        phone: m.phone,
      });
    }

    const byDirector = directors.map((d) => {
      const pending = rows.find(
        (r) => String(r._id.teamDirector) === String(d._id) && r._id.status === "pending",
      );
      const verified = rows.find(
        (r) => String(r._id.teamDirector) === String(d._id) && r._id.status === "verified",
      );
      return {
        director: d,
        members: membersByDirector.get(String(d._id)) || [],
        pendingTotal: pending?.total || 0,
        verifiedTotal: verified?.total || 0,
        pendingCount: pending?.count || 0,
        verifiedCount: verified?.count || 0,
        grandTotal: (pending?.total || 0) + (verified?.total || 0),
      };
    });

    const unassignedPending = rows.find(
      (r) => r._id.teamDirector == null && r._id.status === "pending",
    );
    const unassignedVerified = rows.find(
      (r) => r._id.teamDirector == null && r._id.status === "verified",
    );

    const bogPending = bogRows.find((r) => r._id === "pending");
    const bogVerified = bogRows.find((r) => r._id === "verified");

    const chapterPending =
      rows.filter((r) => r._id.status === "pending").reduce((s, r) => s + r.total, 0) +
      (bogPending?.total || 0);
    const chapterVerified =
      rows.filter((r) => r._id.status === "verified").reduce((s, r) => s + r.total, 0) +
      (bogVerified?.total || 0);

    res.json({
      success: true,
      scope: isCabinetView ? "cabinet" : "chapter",
      period: periodMeta(period),
      byMonth,
      bog: {
        pendingTotal: bogPending?.total || 0,
        verifiedTotal: bogVerified?.total || 0,
        pendingCount: bogPending?.count || 0,
        verifiedCount: bogVerified?.count || 0,
        grandTotal: (bogPending?.total || 0) + (bogVerified?.total || 0),
      },
      chapterPendingTotal: chapterPending,
      chapterVerifiedTotal: chapterVerified,
      chapterGrandTotal: chapterPending + chapterVerified,
      directors: byDirector,
      cabinetMembers: isCabinetView
        ? cabinetMembers.map((m) => ({
            _id: m._id,
            name: m.name,
            email: m.email,
            phone: m.phone,
            teamDirector: m.teamDirector
              ? { _id: m.teamDirector._id || m.teamDirector, name: m.teamDirector.name || null }
              : null,
          }))
        : [],
      unassignedMembers: isCabinetView ? unassignedMembers : [],
      unassigned: isCabinetView
        ? {
            pendingTotal: 0,
            verifiedTotal: 0,
            pendingCount: 0,
            verifiedCount: 0,
            grandTotal: 0,
          }
        : {
            pendingTotal: unassignedPending?.total || 0,
            verifiedTotal: unassignedVerified?.total || 0,
            pendingCount: unassignedPending?.count || 0,
            verifiedCount: unassignedVerified?.count || 0,
            grandTotal: (unassignedPending?.total || 0) + (unassignedVerified?.total || 0),
          },
      canVerify: isFinanceDirector(req.user),
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyChapterDonation(req, res, next) {
  try {
    if (!canVerify(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only the Finance Director can verify donations.",
      });
    }
    const cid = chapterIdOf(req.user);
    const doc = await ChapterTeamDonation.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Donation not found." });
    if (cid && String(doc.chapter) !== String(cid)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const prevStatus = doc.status;
    const status = req.body.status === "rejected" ? "rejected" : "verified";
    doc.status = status;
    doc.verifiedBy = req.user._id;
    doc.verifiedAt = new Date();
    await doc.save();

    // Keep Chapter.fundsRaised in sync with verified team donations.
    if (prevStatus !== "verified" && status === "verified") {
      await Chapter.findByIdAndUpdate(doc.chapter, {
        $inc: { fundsRaised: doc.amount || 0 },
        $set: { lastActivity: new Date() },
      });
    } else if (prevStatus === "verified" && status === "rejected") {
      await Chapter.findByIdAndUpdate(doc.chapter, {
        $inc: { fundsRaised: -(doc.amount || 0) },
      });
    }

    const populated = await ChapterTeamDonation.findById(doc._id)
      .populate("donor", "name email")
      .populate("teamDirector", "name email chapterRole")
      .populate("verifiedBy", "name email");

    res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function deleteChapterDonation(req, res, next) {
  try {
    const doc = await ChapterTeamDonation.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Donation not found." });

    const isOwner = String(doc.donor) === String(req.user._id);
    if (!isOwner && !canVerify(req.user) && !isPresident(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (isOwner && doc.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending donations can be deleted by the donor.",
      });
    }

    await ChapterTeamDonation.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Donation removed." });
  } catch (err) {
    next(err);
  }
}
