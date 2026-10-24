import mongoose from "mongoose";
import Chapter from "../models/Chapter.js";
import User, { CEO_DASHBOARD_ROLES } from "../models/User.js";
import Member from "../models/Member.js";
import Donation from "../models/Donation.js";
import ChapterTeamDonation from "../models/ChapterTeamDonation.js";
import WelfareCase from "../models/WelfareCase.js";
import DocumentationFile from "../models/DocumentationFile.js";
import { TEAM_HEAD_ROLES } from "../lib/teamHeads.js";
import { uploadToCloudinary } from "../middleware/upload.js";

const PRESIDENT_FIELDS = "name email phone avatar systemRole chapterRole lastLogin isActive";
const CASE_DOC_TYPES = ["health", "marriage", "fee", "ration"];

async function fundsRaisedByChapterIds() {
  const [teamFundsByChapter, publicFundsByChapter] = await Promise.all([
    ChapterTeamDonation.aggregate([
      { $match: { status: { $in: ["verified", "pending"] } } },
      { $group: { _id: "$chapter", total: { $sum: "$amount" } } },
    ]),
    Donation.aggregate([
      {
        $match: {
          status: { $in: ["confirmed", "pending"] },
          chapter: { $ne: null },
        },
      },
      { $group: { _id: "$chapter", total: { $sum: "$amount" } } },
    ]),
  ]);
  const map = new Map();
  for (const r of teamFundsByChapter || []) {
    map.set(String(r._id), (map.get(String(r._id)) || 0) + (r.total || 0));
  }
  for (const r of publicFundsByChapter || []) {
    map.set(String(r._id), (map.get(String(r._id)) || 0) + (r.total || 0));
  }
  return map;
}

async function liveFundsForChapter(chapterId) {
  const oid =
    chapterId instanceof mongoose.Types.ObjectId
      ? chapterId
      : new mongoose.Types.ObjectId(String(chapterId));
  const [teamRows, publicRows] = await Promise.all([
    ChapterTeamDonation.aggregate([
      {
        $match: {
          chapter: oid,
          status: { $in: ["verified", "pending"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Donation.aggregate([
      {
        $match: {
          chapter: oid,
          status: { $in: ["confirmed", "pending"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);
  return (teamRows[0]?.total || 0) + (publicRows[0]?.total || 0);
}

function resolveFundsRaised(chapterId, stored, liveMap) {
  const live = liveMap.get(String(chapterId)) || 0;
  return live > 0 ? live : stored ?? 0;
}

/** Count active chapter logins (president + members) — used on public website */
async function userMemberCountsByChapterIds(chapterIds) {
  if (!chapterIds?.length) return new Map();
  const oids = chapterIds.map((id) =>
    id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)),
  );
  const rows = await User.aggregate([
    {
      $match: {
        chapter: { $in: oids },
        isActive: { $ne: false },
        systemRole: { $in: ["member", "president"] },
      },
    },
    { $group: { _id: "$chapter", count: { $sum: 1 } } },
  ]);
  const map = new Map();
  for (const r of rows) map.set(String(r._id), r.count || 0);
  return map;
}

/** Live case totals per chapter (documentation cases + welfare cases) */
async function caseCountsByChapterIds(chapterIds) {
  if (!chapterIds?.length) return new Map();
  const oids = chapterIds.map((id) =>
    id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)),
  );
  const [docRows, welfareRows] = await Promise.all([
    DocumentationFile.aggregate([
      {
        $match: {
          chapter: { $in: oids },
          type: { $in: CASE_DOC_TYPES },
        },
      },
      { $group: { _id: "$chapter", count: { $sum: 1 } } },
    ]),
    WelfareCase.aggregate([
      { $match: { chapter: { $in: oids } } },
      { $group: { _id: "$chapter", count: { $sum: 1 } } },
    ]),
  ]);
  const map = new Map();
  for (const r of docRows || []) {
    map.set(String(r._id), (map.get(String(r._id)) || 0) + (r.count || 0));
  }
  for (const r of welfareRows || []) {
    map.set(String(r._id), (map.get(String(r._id)) || 0) + (r.count || 0));
  }
  return map;
}

export async function getAllChapters(req, res, next) {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const chapters = await Chapter.find(filter)
      .populate("president", PRESIDENT_FIELDS)
      .sort({ name: 1 })
      .lean();
    const [liveMap, memberMap, caseMap] = await Promise.all([
      fundsRaisedByChapterIds(),
      userMemberCountsByChapterIds(chapters.map((c) => c._id)),
      caseCountsByChapterIds(chapters.map((c) => c._id)),
    ]);
    const data = chapters.map((c) => ({
      ...c,
      memberCount: memberMap.get(String(c._id)) ?? c.memberCount ?? 0,
      casesClosed: caseMap.get(String(c._id)) ?? c.casesClosed ?? 0,
      fundsRaised: resolveFundsRaised(c._id, c.fundsRaised, liveMap),
    }));
    res.json({ success: true, total: data.length, data });
  } catch (err) {
    next(err);
  }
}

/** Public website listing — active chapters only, display fields. */
export async function getPublicChapters(req, res, next) {
  try {
    const chapters = await Chapter.find({ status: "active" })
      .populate("president", "name")
      .sort({ city: 1, name: 1 })
      .lean();

    const [liveMap, memberMap, caseMap] = await Promise.all([
      fundsRaisedByChapterIds(),
      userMemberCountsByChapterIds(chapters.map((c) => c._id)),
      caseCountsByChapterIds(chapters.map((c) => c._id)),
    ]);

    const data = chapters.map((c) => ({
      id: String(c._id),
      name: c.name,
      city: c.city,
      imageUrl: c.imageUrl || "",
      president: c.president?.name || "TBD",
      members: memberMap.get(String(c._id)) ?? c.memberCount ?? 0,
      projects: caseMap.get(String(c._id)) ?? c.casesClosed ?? 0,
      events: c.totalEvents ?? 0,
      fundsRaised: resolveFundsRaised(c._id, c.fundsRaised, liveMap),
      donationAccounts: (c.donationAccounts || [])
        .filter((a) => a && String(a.accountNumber || "").trim())
        .map((a) => ({
          bankName: a.bankName || "",
          accountTitle: a.accountTitle || "",
          accountNumber: a.accountNumber || "",
          iban: a.iban || "",
          note: a.note || "",
        })),
    }));

    res.json({ success: true, total: data.length, data });
  } catch (err) {
    next(err);
  }
}

export async function getChapter(req, res, next) {
  try {
    const chapter = await Chapter.findById(req.params.id).populate("president", PRESIDENT_FIELDS);
    if (!chapter) return res.status(404).json({ success: false, message: "Chapter not found." });
    const live = await liveFundsForChapter(chapter._id);
    const data = chapter.toObject();
    data.fundsRaised = live > 0 ? live : chapter.fundsRaised ?? 0;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** Public: heads/directors available to join when registering for a chapter */
export async function getChapterHeads(req, res, next) {
  try {
    const chapter = await Chapter.findById(req.params.id).select("_id name status");
    if (!chapter) return res.status(404).json({ success: false, message: "Chapter not found." });

    const heads = await User.find({
      chapter: chapter._id,
      chapterRole: { $in: TEAM_HEAD_ROLES },
      isActive: true,
    })
      .select("name chapterRole")
      .sort({ chapterRole: 1, name: 1 })
      .lean();

    res.json({ success: true, data: heads });
  } catch (err) {
    next(err);
  }
}

export async function createChapter(req, res, next) {
  try {
    const {
      name,
      city,
      monthlyBudget,
      budgetThreshold,
      established,
      status,
      president,
      presidentName,
      presidentEmail,
      presidentPassword,
    } = req.body;

    if (!name?.trim() || !city?.trim()) {
      return res.status(400).json({ success: false, message: "Name and city are required." });
    }

    let presidentId = president || null;

    if (presidentEmail) {
      const email = String(presidentEmail).toLowerCase().trim();
      let user = await User.findOne({ email });

      if (user) {
        if (CEO_DASHBOARD_ROLES.includes(user.systemRole)) {
          return res.status(400).json({
            success: false,
            message: "That email belongs to a CEO/Board account and cannot be a chapter president.",
          });
        }
        presidentId = user._id;
      } else {
        if (!presidentName?.trim()) {
          return res.status(400).json({
            success: false,
            message: "President name is required when creating a new president account.",
          });
        }
        user = await User.create({
          name: String(presidentName).trim(),
          email,
          password: presidentPassword || "ChangeMe123!",
          systemRole: "president",
          chapterRole: "president",
        });
        presidentId = user._id;
      }
    }

    const chapter = await Chapter.create({
      name: String(name).trim(),
      city: String(city).trim(),
      president: presidentId,
      status: status === "inactive" ? "inactive" : "active",
      established: established ? new Date(established) : new Date(),
      monthlyBudget: Number(monthlyBudget) > 0 ? Number(monthlyBudget) : 800000,
      budgetThreshold: Number(budgetThreshold) > 0 ? Number(budgetThreshold) : 100000,
      imageUrl: "",
      imagePublicId: "",
    });

    if (req.file) {
      try {
        const uploaded = await uploadToCloudinary(req.file, "serve-humanity/chapters");
        chapter.imageUrl = uploaded.secure_url || "";
        chapter.imagePublicId = uploaded.public_id || "";
        await chapter.save();
      } catch (uploadErr) {
        console.warn("Chapter image upload failed:", uploadErr?.message || uploadErr);
      }
    }

    if (presidentId) {
      await User.findByIdAndUpdate(presidentId, {
        chapter: chapter._id,
        systemRole: "president",
        chapterRole: "president",
        teamDirector: null,
      });
    }

    const populated = await Chapter.findById(chapter._id).populate("president", PRESIDENT_FIELDS);
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function mapMonthRows(rows) {
  return rows.map((r) => ({
    year: r._id.year,
    month: r._id.month,
    label: `${MONTH_NAMES[r._id.month] || r._id.month} ${r._id.year}`,
    total: r.total || 0,
    verified: r.verified || 0,
    pending: r.pending || 0,
    count: r.count || 0,
  }));
}

/** CEO/Board: full chapter profile — team, members, month-wise donations, president contact */
export async function getChapterDetails(req, res, next) {
  try {
    const chapter = await Chapter.findById(req.params.id).populate("president", PRESIDENT_FIELDS);
    if (!chapter) return res.status(404).json({ success: false, message: "Chapter not found." });

    const chapterOid = new mongoose.Types.ObjectId(String(chapter._id));

    const monthGroup = {
      _id: {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
      },
      total: { $sum: "$amount" },
      count: { $sum: 1 },
    };

    const caseBaseFilter = {
      chapter: chapterOid,
      type: { $in: CASE_DOC_TYPES },
    };

    const [
      team,
      teamDonationMonths,
      publicDonationMonths,
      teamStatusTotals,
      activeCases,
      casesClosed,
      cases,
      recentTeamDonations,
    ] = await Promise.all([
      User.find({ chapter: chapterOid })
        .select(
          "name email phone chapterRole systemRole teamDirector cabinetMember lastLogin avatar isActive membershipStatus requestedCabinetRole createdAt",
        )
        .populate("teamDirector", "name email chapterRole")
        .populate("cabinetMember", "name email chapterRole")
        .sort({ chapterRole: 1, name: 1 })
        .lean(),
      ChapterTeamDonation.aggregate([
        { $match: { chapter: chapterOid } },
        {
          $group: {
            ...monthGroup,
            verified: {
              $sum: { $cond: [{ $eq: ["$status", "verified"] }, "$amount", 0] },
            },
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] },
            },
          },
        },
        { $sort: { "_id.year": -1, "_id.month": -1 } },
      ]),
      Donation.aggregate([
        { $match: { chapter: chapterOid } },
        { $group: monthGroup },
        { $sort: { "_id.year": -1, "_id.month": -1 } },
      ]),
      ChapterTeamDonation.aggregate([
        { $match: { chapter: chapterOid } },
        { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      // Documentation case board (health / marriage / fee / ration) — not legacy WelfareCase
      DocumentationFile.countDocuments({
        ...caseBaseFilter,
        $or: [
          { caseStatus: "pending" },
          { caseStatus: "running" },
          { caseStatus: { $exists: false } },
          { caseStatus: null },
        ],
      }),
      DocumentationFile.countDocuments({
        ...caseBaseFilter,
        caseStatus: "complete",
      }),
      DocumentationFile.find(caseBaseFilter)
        .select(
          "type title caseNumber caseStatus approvalStatus status fields createdAt updatedAt createdBy",
        )
        .populate("createdBy", "name email chapterRole")
        .sort({ updatedAt: -1 })
        .lean(),
      ChapterTeamDonation.find({ chapter: chapterOid })
        .populate("donor", "name email chapterRole")
        .populate("teamDirector", "name email chapterRole")
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
    ]);

    const donationTotals = { pending: 0, verified: 0, rejected: 0, count: 0 };
    for (const row of teamStatusTotals) {
      const key = row._id || "pending";
      if (key in donationTotals) donationTotals[key] = row.total || 0;
      donationTotals.count += row.count || 0;
    }

    const publicRaisedRows = await Donation.aggregate([
      {
        $match: {
          chapter: chapterOid,
          status: { $in: ["confirmed", "pending"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const liveFundsRaised =
      (donationTotals.pending || 0) +
      (donationTotals.verified || 0) +
      (publicRaisedRows[0]?.total || 0);
    const chapterPayload = chapter.toObject ? chapter.toObject() : chapter;
    chapterPayload.fundsRaised =
      liveFundsRaised > 0 ? liveFundsRaised : chapter.fundsRaised ?? 0;
    // Live counts from login accounts + documentation case board
    chapterPayload.memberCount = team.length;
    chapterPayload.casesClosed = casesClosed;

    res.json({
      success: true,
      data: {
        chapter: chapterPayload,
        president: chapter.president || null,
        team,
        members: team, // all login accounts (general members included) — Members tab removed on UI
        cases,
        activeCases,
        casesClosed,
        donationTotals: {
          ...donationTotals,
          grandTotal: (donationTotals.pending || 0) + (donationTotals.verified || 0),
        },
        teamDonationsByMonth: mapMonthRows(teamDonationMonths),
        publicDonationsByMonth: mapMonthRows(publicDonationMonths),
        recentTeamDonations,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** CEO: assign a chapter user as president; optionally deactivate the previous president */
export async function assignChapterPresident(req, res, next) {
  try {
    const { presidentId, deactivatePrevious = true, deactivateOnly = false } = req.body;
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) return res.status(404).json({ success: false, message: "Chapter not found." });

    const previousPresidentId = chapter.president ? String(chapter.president) : null;

    // Deactivate current president without assigning a replacement
    if (deactivateOnly) {
      if (!previousPresidentId) {
        return res.status(400).json({ success: false, message: "This chapter has no president to deactivate." });
      }

      await User.findByIdAndUpdate(previousPresidentId, {
        isActive: false,
        systemRole: "member",
        chapterRole: "member",
        teamDirector: null,
      });

      chapter.president = null;
      chapter.lastActivity = new Date();
      await chapter.save();

      const populated = await Chapter.findById(chapter._id).populate("president", PRESIDENT_FIELDS);
      return res.json({
        success: true,
        message: "President deactivated.",
        data: populated,
      });
    }

    if (!presidentId) {
      return res.status(400).json({
        success: false,
        message: "Select a chapter user to make president.",
      });
    }

    const nextPresident = await User.findById(presidentId);
    if (!nextPresident) {
      return res.status(404).json({ success: false, message: "Selected user was not found." });
    }
    if (String(nextPresident.chapter) !== String(chapter._id)) {
      return res.status(400).json({
        success: false,
        message: "Selected user must already belong to this chapter.",
      });
    }
    if (CEO_DASHBOARD_ROLES.includes(nextPresident.systemRole)) {
      return res.status(400).json({
        success: false,
        message: "CEO/Board accounts cannot be chapter presidents.",
      });
    }

    // Demote any existing presidents in this chapter (except the new one)
    const demoteFilter = {
      chapter: chapter._id,
      _id: { $ne: nextPresident._id },
      $or: [{ systemRole: "president" }, { chapterRole: "president" }],
    };
    const demoteUpdate = {
      systemRole: "member",
      chapterRole: "member",
      teamDirector: null,
    };
    if (deactivatePrevious) {
      demoteUpdate.isActive = false;
    }
    await User.updateMany(demoteFilter, { $set: demoteUpdate });

    // Also demote previous chapter.president pointer if they weren't caught above
    if (previousPresidentId && previousPresidentId !== String(nextPresident._id)) {
      await User.findByIdAndUpdate(previousPresidentId, {
        systemRole: "member",
        chapterRole: "member",
        teamDirector: null,
        ...(deactivatePrevious ? { isActive: false } : {}),
      });
    }

    nextPresident.systemRole = "president";
    nextPresident.chapterRole = "president";
    nextPresident.teamDirector = null;
    nextPresident.isActive = true;
    nextPresident.chapter = chapter._id;
    await nextPresident.save();

    chapter.president = nextPresident._id;
    chapter.lastActivity = new Date();
    await chapter.save();

    // Keep member roster in sync when emails match
    await Member.updateMany(
      { chapter: chapter._id, role: "president" },
      { $set: { role: "member" } },
    );
    await Member.findOneAndUpdate(
      { chapter: chapter._id, email: nextPresident.email },
      { $set: { role: "president", status: "active", name: nextPresident.name } },
      { upsert: false },
    );

    const populated = await Chapter.findById(chapter._id).populate("president", PRESIDENT_FIELDS);
    res.json({
      success: true,
      message: "President updated.",
      data: populated,
    });
  } catch (err) {
    next(err);
  }
}

function normalizeDonationAccounts(raw) {
  if (!Array.isArray(raw)) return null;
  const cleaned = raw
    .slice(0, 3)
    .map((a) => ({
      bankName: String(a?.bankName || "").trim(),
      accountTitle: String(a?.accountTitle || "").trim(),
      accountNumber: String(a?.accountNumber || "").trim(),
      iban: String(a?.iban || "").trim(),
      note: String(a?.note || "").trim(),
    }))
    .filter((a) => a.accountNumber || a.bankName || a.accountTitle || a.iban);
  return cleaned;
}

function isChapterPresidentUser(user, chapterId) {
  if (!user) return false;
  const isPres =
    user.systemRole === "president" || user.chapterRole === "president";
  if (!isPres) return false;
  const cid = user.chapter?._id || user.chapter;
  return cid && String(cid) === String(chapterId);
}

export async function updateChapter(req, res, next) {
  try {
    const allowed = [
      "name",
      "city",
      "status",
      "established",
      "monthlyBudget",
      "budgetThreshold",
      "monthlySpent",
      "memberCount",
      "casesClosed",
      "fundsRaised",
      "totalEvents",
      "lastActivity",
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }

    const chapter = await Chapter.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!chapter) return res.status(404).json({ success: false, message: "Chapter not found." });

    // Real-time push
    req.app.get("io")?.to(`chapter:${chapter._id}`).emit("chapter:updated", chapter);

    res.json({ success: true, data: chapter });
  } catch (err) {
    next(err);
  }
}

/**
 * Chapter president sets 1–3 bank accounts shown on the public donate page.
 * PATCH /chapters/:id/donation-accounts
 */
export async function updateChapterDonationAccounts(req, res, next) {
  try {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) return res.status(404).json({ success: false, message: "Chapter not found." });

    if (!isChapterPresidentUser(req.user, chapter._id)) {
      return res.status(403).json({
        success: false,
        message: "Only the president of this chapter can set donation accounts.",
      });
    }

    const accounts = normalizeDonationAccounts(req.body?.donationAccounts);
    if (accounts === null) {
      return res.status(400).json({
        success: false,
        message: "donationAccounts must be an array (up to 3 accounts).",
      });
    }
    if (accounts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Add at least one account with an account number.",
      });
    }
    for (const a of accounts) {
      if (!a.accountNumber) {
        return res.status(400).json({
          success: false,
          message: "Each account needs an account number.",
        });
      }
    }

    chapter.donationAccounts = accounts;
    chapter.lastActivity = new Date();
    await chapter.save();

    req.app.get("io")?.to(`chapter:${chapter._id}`).emit("chapter:updated", chapter);

    res.json({
      success: true,
      data: {
        _id: chapter._id,
        donationAccounts: chapter.donationAccounts,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** PATCH /chapters/:id/image — upload or replace chapter photo */
export async function updateChapterImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Image file is required." });
    }
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) return res.status(404).json({ success: false, message: "Chapter not found." });

    const uploaded = await uploadToCloudinary(req.file, "serve-humanity/chapters");
    chapter.imageUrl = uploaded.secure_url || "";
    chapter.imagePublicId = uploaded.public_id || "";
    await chapter.save();

    const populated = await Chapter.findById(chapter._id).populate("president", PRESIDENT_FIELDS);
    res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function deleteChapter(req, res, next) {
  try {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) {
      return res.status(404).json({ success: false, message: "Chapter not found." });
    }

    const chapterId = chapter._id;

    // Unlink users from this chapter (keep accounts; clear chapter assignment)
    await User.updateMany(
      { chapter: chapterId },
      { $set: { chapter: null, chapterRole: "member" } },
    );

    // Clear president role if they were chapter president
    if (chapter.president) {
      await User.updateOne(
        { _id: chapter.president, systemRole: "president" },
        { $set: { systemRole: "member" } },
      );
    }

    await Chapter.findByIdAndDelete(chapterId);

    res.json({ success: true, message: "Chapter deleted." });
  } catch (err) {
    next(err);
  }
}

export async function getChapterStats(req, res, next) {
  try {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) return res.status(404).json({ success: false, message: "Chapter not found." });

    const [memberCount, activeCases, totalDonations] = await Promise.all([
      User.countDocuments({
        chapter: chapter._id,
        isActive: { $ne: false },
        systemRole: { $in: ["member", "president"] },
      }),
      DocumentationFile.countDocuments({
        chapter: chapter._id,
        type: { $in: CASE_DOC_TYPES },
        $or: [
          { caseStatus: "pending" },
          { caseStatus: "running" },
          { caseStatus: { $exists: false } },
          { caseStatus: null },
        ],
      }),
      Donation.aggregate([
        { $match: { chapter: chapter._id } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    // Keep denormalized field in sync for dashboards that still read it
    if (chapter.memberCount !== memberCount) {
      chapter.memberCount = memberCount;
      await chapter.save();
    }

    res.json({
      success: true,
      data: {
        memberCount,
        activeCases,
        totalDonations: totalDonations[0]?.total ?? 0,
        monthlyBudget: chapter.monthlyBudget,
        monthlySpent: chapter.monthlySpent,
        budgetThreshold: chapter.budgetThreshold,
      },
    });
  } catch (err) {
    next(err);
  }
}
