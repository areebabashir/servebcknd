import mongoose from "mongoose";
import Chapter from "../models/Chapter.js";
import Member from "../models/Member.js";
import User, { CEO_DASHBOARD_ROLES, FULL_ACCESS_ROLES } from "../models/User.js";
import VolunteerApplication from "../models/VolunteerApplication.js";
import Donation from "../models/Donation.js";
import ChapterTeamDonation from "../models/ChapterTeamDonation.js";
import Expense from "../models/Expense.js";
import WelfareCase from "../models/WelfareCase.js";
import DocumentationFile from "../models/DocumentationFile.js";
import Event from "../models/Event.js";
import WebsiteEvent from "../models/WebsiteEvent.js";
import ContactMessage from "../models/ContactMessage.js";
import Review from "../models/Review.js";
import NewsletterSubscriber from "../models/NewsletterSubscriber.js";
import Notification from "../models/Notification.js";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CASE_DOC_TYPES = ["health", "marriage", "fee", "ration"];

const BOG_ROLES = [
  "bog_verification",
  "bog_operations",
  "bog_media",
  "bog_finance",
  "bog_documentation",
];

const DIRECTOR_CHAPTER_ROLES = [
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
];

const PRESIDENT_CHAPTER_ROLES = ["president", "vice_president", "vice_president_male"];

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}

function monthsBack(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: MONTH_SHORT[d.getMonth()],
      key: `${d.getFullYear()}-${d.getMonth() + 1}`,
    });
  }
  return out;
}

async function sumAmount(Model, match) {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  return { total: rows[0]?.total || 0, count: rows[0]?.count || 0 };
}

async function monthlyTotals(Model, match, fromDate) {
  const rows = await Model.aggregate([
    { $match: { ...match, createdAt: { $gte: fromDate } } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        total: { $sum: "$amount" },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    map.set(`${r._id.year}-${r._id.month}`, r.total || 0);
  }
  return map;
}

async function dailyTotals(Model, match) {
  const rows = await Model.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        },
        total: { $sum: "$amount" },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    map.set(`${r._id.year}-${r._id.month}-${r._id.day}`, r.total || 0);
  }
  return map;
}

/** Chapter login accounts that joined (createdAt), excluding CEO/board & public. */
async function monthlyMemberJoins(chapterMatch, fromDate) {
  const match = {
    systemRole: { $nin: [...CEO_DASHBOARD_ROLES, "public"] },
    createdAt: { $gte: fromDate },
  };
  if (chapterMatch.chapter) match.chapter = chapterMatch.chapter;
  else match.chapter = { $ne: null };

  const rows = await User.aggregate([
    { $match: match },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        total: { $sum: 1 },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    map.set(`${r._id.year}-${r._id.month}`, r.total || 0);
  }
  return map;
}

async function dailyMemberJoins(chapterMatch, range) {
  const match = {
    systemRole: { $nin: [...CEO_DASHBOARD_ROLES, "public"] },
    ...range,
  };
  if (chapterMatch.chapter) match.chapter = chapterMatch.chapter;
  else match.chapter = { $ne: null };

  const rows = await User.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        },
        total: { $sum: 1 },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    map.set(`${r._id.year}-${r._id.month}-${r._id.day}`, r.total || 0);
  }
  return map;
}

function relativeTime(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * GET /dashboard/trend?chapter=&month=
 * chapter — chapter id or omit/all
 * month — YYYY-MM for daily series, or omit/all for last 12 months
 */
export async function getTrend(req, res, next) {
  try {
    const chapterRaw = String(req.query.chapter || "").trim();
    const monthRaw = String(req.query.month || "").trim();
    const chapterId =
      chapterRaw && chapterRaw !== "all" && mongoose.Types.ObjectId.isValid(chapterRaw)
        ? new mongoose.Types.ObjectId(chapterRaw)
        : null;

    const chapterMatch = chapterId ? { chapter: chapterId } : {};
    const donStatus = { status: { $in: ["confirmed", "pending"] } };
    const teamStatus = { status: { $in: ["verified", "pending"] } };

    const monthMatch = /^(\d{4})-(\d{1,2})$/.exec(monthRaw);
    if (monthMatch) {
      const year = Number(monthMatch[1]);
      const month = Number(monthMatch[2]);
      if (month < 1 || month > 12) {
        return res.status(400).json({ success: false, message: "Invalid month." });
      }
      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month, 1);
      const range = { createdAt: { $gte: from, $lt: to } };

      const [publicDays, teamDays, memberDays] = await Promise.all([
        dailyTotals(Donation, { ...donStatus, ...chapterMatch, ...range }),
        dailyTotals(ChapterTeamDonation, { ...teamStatus, ...chapterMatch, ...range }),
        dailyMemberJoins(chapterMatch, range),
      ]);

      const daysInMonth = new Date(year, month, 0).getDate();
      const points = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const key = `${year}-${month}-${day}`;
        points.push({
          month: String(day),
          label: `${MONTH_SHORT[month - 1]} ${day}`,
          donations: (publicDays.get(key) || 0) + (teamDays.get(key) || 0),
          membersJoined: memberDays.get(key) || 0,
        });
      }

      const donations = points.reduce((s, p) => s + p.donations, 0);
      const membersJoined = points.reduce((s, p) => s + p.membersJoined, 0);

      return res.json({
        success: true,
        data: {
          mode: "daily",
          month: `${year}-${String(month).padStart(2, "0")}`,
          chapter: chapterId ? String(chapterId) : "all",
          points,
          totals: { donations, membersJoined },
        },
      });
    }

    const trendMonths = monthsBack(12);
    const trendFrom = new Date(trendMonths[0].year, trendMonths[0].month - 1, 1);

    const [publicDonMonthMap, teamDonMonthMap, memberMonthMap] = await Promise.all([
      monthlyTotals(Donation, { ...donStatus, ...chapterMatch }, trendFrom),
      monthlyTotals(ChapterTeamDonation, { ...teamStatus, ...chapterMatch }, trendFrom),
      monthlyMemberJoins(chapterMatch, trendFrom),
    ]);

    const points = trendMonths.map((m) => {
      const donations =
        (publicDonMonthMap.get(m.key) || 0) + (teamDonMonthMap.get(m.key) || 0);
      const membersJoined = memberMonthMap.get(m.key) || 0;
      return {
        month: m.label,
        label: `${m.label} ${m.year}`,
        key: `${m.year}-${String(m.month).padStart(2, "0")}`,
        donations,
        membersJoined,
      };
    });

    const last = points[points.length - 1]?.donations || 0;
    const prev = points[points.length - 2]?.donations || 0;
    const momPct =
      prev > 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : last > 0 ? 100 : 0;

    res.json({
      success: true,
      data: {
        mode: "monthly",
        month: "all",
        chapter: chapterId ? String(chapterId) : "all",
        points,
        momPct,
        totals: {
          donations: points.reduce((s, p) => s + p.donations, 0),
          membersJoined: points.reduce((s, p) => s + p.membersJoined, 0),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/overview — org-wide CEO command center payload.
 */
export async function getOverview(req, res, next) {
  try {
    const now = new Date();
    const mtdStart = startOfMonth(now);
    const ytdStart = startOfYear(now);
    const trendMonths = monthsBack(12);
    const trendFrom = new Date(trendMonths[0].year, trendMonths[0].month - 1, 1);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalChapters,
      activeChapters,
      peopleCeo,
      peopleBog,
      peoplePresidents,
      peopleDirectors,
      peopleMembers,
      peopleVolunteers,
      peopleUsersTotal,
      publicDonationsMTD,
      publicDonationsYTD,
      teamDonationsMTD,
      teamDonationsYTD,
      publicDonMonthMap,
      teamDonMonthMap,
      memberMonthMap,
      activeCases,
      pendingCeoCases,
      stalePendingCases,
      expensesAwaitingCeo,
      upcomingChapterEvents,
      upcomingWebsiteEvents,
      unreadContact,
      pendingReviews,
      newsletterSubscribers,
      chapters,
      teamFundsByChapter,
      publicFundsByChapter,
      recentCases,
      recentTeamDonations,
      recentExpenses,
      recentWebsiteEvents,
      unreadNotifications,
      pendingDocCases,
      runningDocCases,
      completeDocCases,
    ] = await Promise.all([
      Chapter.countDocuments({}),
      Chapter.countDocuments({ status: "active" }),
      User.countDocuments({
        isActive: true,
        systemRole: { $in: FULL_ACCESS_ROLES },
      }),
      User.countDocuments({
        isActive: true,
        systemRole: { $in: BOG_ROLES },
      }),
      User.countDocuments({
        isActive: true,
        systemRole: { $nin: [...CEO_DASHBOARD_ROLES, "public"] },
        $or: [
          { systemRole: "president" },
          { chapterRole: { $in: PRESIDENT_CHAPTER_ROLES } },
        ],
      }),
      User.countDocuments({
        isActive: true,
        systemRole: { $nin: [...CEO_DASHBOARD_ROLES, "public", "president"] },
        chapterRole: { $in: DIRECTOR_CHAPTER_ROLES },
      }),
      User.countDocuments({
        isActive: true,
        systemRole: { $nin: [...CEO_DASHBOARD_ROLES, "public", "president"] },
        chapterRole: "member",
      }),
      VolunteerApplication.countDocuments({ status: "approved" }),
      User.countDocuments({
        isActive: true,
        systemRole: { $ne: "public" },
      }),
      sumAmount(Donation, {
        status: { $in: ["confirmed", "pending"] },
        createdAt: { $gte: mtdStart },
      }),
      sumAmount(Donation, {
        status: { $in: ["confirmed", "pending"] },
        createdAt: { $gte: ytdStart },
      }),
      sumAmount(ChapterTeamDonation, {
        status: { $in: ["verified", "pending"] },
        createdAt: { $gte: mtdStart },
      }),
      sumAmount(ChapterTeamDonation, {
        status: { $in: ["verified", "pending"] },
        createdAt: { $gte: ytdStart },
      }),
      monthlyTotals(
        Donation,
        { status: { $in: ["confirmed", "pending"] } },
        trendFrom,
      ),
      monthlyTotals(
        ChapterTeamDonation,
        { status: { $in: ["verified", "pending"] } },
        trendFrom,
      ),
      monthlyMemberJoins({}, trendFrom),
      WelfareCase.countDocuments({
        status: { $nin: ["closed", "rejected", "disbursed"] },
      }),
      WelfareCase.countDocuments({ status: "sent_to_ceo" }),
      WelfareCase.countDocuments({
        status: { $in: ["submitted", "under_review", "sent_to_ceo"] },
        updatedAt: { $lte: sevenDaysAgo },
      }),
      Expense.countDocuments({ status: "sent_to_ceo" }),
      Event.countDocuments({
        date: { $gte: todayStart },
        status: { $in: ["Pending", "Approved"] },
      }),
      WebsiteEvent.countDocuments({
        published: true,
        date: { $gte: todayStart },
      }),
      ContactMessage.countDocuments({ status: "new" }),
      Review.countDocuments({ status: "pending" }),
      NewsletterSubscriber.countDocuments({ isActive: true }),
      Chapter.find({})
        .populate("president", "name")
        .select(
          "name city status memberCount casesClosed fundsRaised totalEvents monthlyBudget monthlySpent lastActivity imageUrl",
        )
        .lean(),
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
      WelfareCase.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("chapter", "name city")
        .select("caseId applicant status createdAt chapter")
        .lean(),
      ChapterTeamDonation.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("chapter", "name city")
        .populate("donor", "name")
        .select("amount status createdAt chapter donor")
        .lean(),
      Expense.find({})
        .sort({ createdAt: -1 })
        .limit(4)
        .populate("chapter", "name city")
        .select("title amount status createdAt chapter")
        .lean(),
      WebsiteEvent.find({ published: true, date: { $gte: todayStart } })
        .sort({ date: 1 })
        .limit(3)
        .select("title date location")
        .lean(),
      Notification.countDocuments({
        recipients: {
          $elemMatch: {
            user: req.user._id,
            readAt: null,
            dismissedAt: null,
          },
        },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      }),
      DocumentationFile.countDocuments({
        type: { $in: CASE_DOC_TYPES },
        $or: [{ caseStatus: "pending" }, { caseStatus: { $exists: false } }],
      }),
      DocumentationFile.countDocuments({
        type: { $in: CASE_DOC_TYPES },
        caseStatus: "running",
      }),
      DocumentationFile.countDocuments({
        type: { $in: CASE_DOC_TYPES },
        caseStatus: "complete",
      }),
    ]);

    const donationsMTD = (publicDonationsMTD.total || 0) + (teamDonationsMTD.total || 0);
    const donationsYTD = (publicDonationsYTD.total || 0) + (teamDonationsYTD.total || 0);

    const totalPeople = (peopleUsersTotal || 0) + (peopleVolunteers || 0);
    const people = {
      ceo: peopleCeo || 0,
      bog: peopleBog || 0,
      presidents: peoplePresidents || 0,
      directors: peopleDirectors || 0,
      members: peopleMembers || 0,
      volunteers: peopleVolunteers || 0,
      activeAccounts: peopleUsersTotal || 0,
      total: totalPeople,
    };

    const teamFundsMap = new Map(
      (teamFundsByChapter || []).map((r) => [String(r._id), r.total || 0]),
    );
    const publicFundsMap = new Map(
      (publicFundsByChapter || []).map((r) => [String(r._id), r.total || 0]),
    );

    const userMemberRows = await User.aggregate([
      {
        $match: {
          chapter: { $ne: null },
          isActive: { $ne: false },
          systemRole: { $in: ["member", "president"] },
        },
      },
      { $group: { _id: "$chapter", count: { $sum: 1 } } },
    ]);
    const userMemberMap = new Map(
      (userMemberRows || []).map((r) => [String(r._id), r.count || 0]),
    );

    const trend = trendMonths.map((m) => {
      const donations =
        (publicDonMonthMap.get(m.key) || 0) + (teamDonMonthMap.get(m.key) || 0);
      const membersJoined = memberMonthMap.get(m.key) || 0;
      return { month: m.label, donations, membersJoined };
    });

    // MoM donation change (last complete-ish month vs previous)
    const last = trend[trend.length - 1]?.donations || 0;
    const prev = trend[trend.length - 2]?.donations || 0;
    const momPct =
      prev > 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : last > 0 ? 100 : 0;

    const alerts = [];
    if (stalePendingCases > 0) {
      alerts.push({
        id: "stale-cases",
        severity: "danger",
        title: `${stalePendingCases} case${stalePendingCases === 1 ? "" : "s"} pending > 7 days`,
        chapter: "Multi-chapter",
        href: "/verification",
      });
    }
    if (pendingCeoCases > 0) {
      alerts.push({
        id: "ceo-cases",
        severity: "danger",
        title: `${pendingCeoCases} case${pendingCeoCases === 1 ? "" : "s"} awaiting CEO decision`,
        chapter: "Verification",
        href: "/verification",
      });
    }
    if (expensesAwaitingCeo > 0) {
      alerts.push({
        id: "ceo-expenses",
        severity: "danger",
        title: `${expensesAwaitingCeo} expense${expensesAwaitingCeo === 1 ? "" : "s"} awaiting CEO`,
        chapter: "Finance",
        href: "/finance",
      });
    }
    for (const c of chapters) {
      const budget = Number(c.monthlyBudget) || 0;
      const spent = Number(c.monthlySpent) || 0;
      if (budget > 0 && spent / budget >= 0.9) {
        alerts.push({
          id: `budget-${c._id}`,
          severity: "warning",
          title: `${c.name} budget at ${Math.round((spent / budget) * 100)}% utilization`,
          chapter: c.city || c.name,
          href: "/chapters",
        });
      }
      if (c.lastActivity && new Date(c.lastActivity) < fourteenDaysAgo) {
        alerts.push({
          id: `idle-${c._id}`,
          severity: "warning",
          title: `${c.name} has no activity in 14+ days`,
          chapter: c.city || c.name,
          href: "/chapters",
        });
      }
    }
    if (unreadContact > 0) {
      alerts.push({
        id: "contact",
        severity: "warning",
        title: `${unreadContact} new contact message${unreadContact === 1 ? "" : "s"}`,
        chapter: "Website",
        href: "/contact-messages",
      });
    }
    if (pendingReviews > 0) {
      alerts.push({
        id: "reviews",
        severity: "warning",
        title: `${pendingReviews} review${pendingReviews === 1 ? "" : "s"} awaiting approval`,
        chapter: "Website",
        href: "/reviews",
      });
    }

    const leaderboard = chapters
      .map((c) => {
        const id = String(c._id);
        const fromTeam = teamFundsMap.get(id) || 0;
        const fromPublic = publicFundsMap.get(id) || 0;
        const liveRaised = fromTeam + fromPublic;
        return {
          id,
          name: c.name,
          city: c.city,
          president: c.president?.name || "TBD",
          members: userMemberMap.get(id) ?? c.memberCount ?? 0,
          casesClosed: c.casesClosed ?? 0,
          events: c.totalEvents ?? 0,
          fundsRaised: liveRaised > 0 ? liveRaised : c.fundsRaised ?? 0,
          status: c.status,
          imageUrl: c.imageUrl || "",
        };
      })
      .sort((a, b) => b.fundsRaised - a.fundsRaised)
      .slice(0, 8);

    const activity = [];
    for (const c of recentCases) {
      activity.push({
        id: `case-${c._id}`,
        type: "case",
        text: `Case ${c.caseId || ""} — ${c.applicant || "Applicant"} (${c.status})`,
        meta: `${c.chapter?.name || c.chapter?.city || "Chapter"} · ${relativeTime(c.createdAt)}`,
        at: c.createdAt,
      });
    }
    for (const d of recentTeamDonations) {
      activity.push({
        id: `don-${d._id}`,
        type: "donation",
        text: `Donation of PKR ${(d.amount || 0).toLocaleString()} (${d.status})`,
        meta: `${d.donor?.name || "Member"} · ${d.chapter?.name || d.chapter?.city || "Chapter"} · ${relativeTime(d.createdAt)}`,
        at: d.createdAt,
      });
    }
    for (const e of recentExpenses) {
      activity.push({
        id: `exp-${e._id}`,
        type: "expense",
        text: `Expense “${e.title || "Untitled"}” — PKR ${(e.amount || 0).toLocaleString()} (${e.status})`,
        meta: `${e.chapter?.name || e.chapter?.city || "Chapter"} · ${relativeTime(e.createdAt)}`,
        at: e.createdAt,
      });
    }
    for (const ev of recentWebsiteEvents) {
      activity.push({
        id: `we-${ev._id}`,
        type: "event",
        text: `Upcoming: ${ev.title}`,
        meta: `${ev.location || "Event"} · ${new Date(ev.date).toLocaleDateString()}`,
        at: ev.date,
      });
    }
    activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    res.json({
      success: true,
      data: {
        kpis: {
          totalChapters,
          activeChapters,
          totalMembers: people.members,
          totalVolunteers: people.volunteers,
          totalPeople: people.total,
          activeAccounts: people.activeAccounts,
          people,
          donationsMTD,
          donationsYTD,
          activeCases,
          pendingCeoCases,
          pendingDocCases,
          runningDocCases,
          completeDocCases,
          upcomingEvents: upcomingChapterEvents + upcomingWebsiteEvents,
          unreadContact,
          pendingReviews,
          newsletterSubscribers,
          unreadNotifications,
          expensesAwaitingCeo,
        },
        trend,
        momPct,
        chapters: chapters
          .map((c) => ({
            id: String(c._id),
            name: c.name,
            city: c.city || "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        alerts: alerts.slice(0, 8),
        leaderboard,
        activity: activity.slice(0, 10),
      },
    });
  } catch (err) {
    next(err);
  }
}

const PENDING_WELFARE = ["submitted", "under_review", "sent_to_ceo", "approved"];
const DONE_WELFARE = ["disbursed", "closed"];

async function buildChapterReportPayload(chapterDoc) {
  const chapterOid = new mongoose.Types.ObjectId(String(chapterDoc._id));
  const president =
    chapterDoc.president && typeof chapterDoc.president === "object"
      ? chapterDoc.president
      : null;

  const [
    members,
    team,
    teamStatusTotals,
    publicDonTotal,
    casesPending,
    casesDone,
    casesRejected,
    docPending,
    docRunning,
    docComplete,
    events,
    recentTeamDonations,
    recentWelfareCases,
  ] = await Promise.all([
    Member.find({ chapter: chapterOid })
      .select("name email phone role status joinedAt")
      .sort({ joinedAt: -1 })
      .lean(),
    User.find({ chapter: chapterOid, isActive: true })
      .select("name email phone chapterRole systemRole")
      .sort({ chapterRole: 1, name: 1 })
      .lean(),
    ChapterTeamDonation.aggregate([
      { $match: { chapter: chapterOid } },
      { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Donation.aggregate([
      {
        $match: {
          chapter: chapterOid,
          status: { $in: ["confirmed", "pending"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    WelfareCase.countDocuments({
      chapter: chapterOid,
      status: { $in: PENDING_WELFARE },
    }),
    WelfareCase.countDocuments({
      chapter: chapterOid,
      status: { $in: DONE_WELFARE },
    }),
    WelfareCase.countDocuments({ chapter: chapterOid, status: "rejected" }),
    DocumentationFile.countDocuments({
      chapter: chapterOid,
      type: { $in: CASE_DOC_TYPES },
      $or: [{ caseStatus: "pending" }, { caseStatus: { $exists: false } }, { caseStatus: null }],
    }),
    DocumentationFile.countDocuments({
      chapter: chapterOid,
      type: { $in: CASE_DOC_TYPES },
      caseStatus: "running",
    }),
    DocumentationFile.countDocuments({
      chapter: chapterOid,
      type: { $in: CASE_DOC_TYPES },
      caseStatus: "complete",
    }),
    Event.find({ chapter: chapterOid })
      .select("title date venue status expectedAttendees actualAttendees")
      .sort({ date: -1 })
      .limit(100)
      .lean(),
    ChapterTeamDonation.find({ chapter: chapterOid })
      .populate("donor", "name email")
      .select("amount status note createdAt donor")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    WelfareCase.find({ chapter: chapterOid })
      .select("caseId applicant category amount status urgency createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const donationTotals = { pending: 0, verified: 0, rejected: 0, count: 0 };
  for (const row of teamStatusTotals) {
    const key = row._id || "pending";
    if (key in donationTotals) donationTotals[key] = row.total || 0;
    donationTotals.count += row.count || 0;
  }
  const publicTotal = publicDonTotal[0]?.total || 0;
  const publicCount = publicDonTotal[0]?.count || 0;
  const teamRaised = (donationTotals.pending || 0) + (donationTotals.verified || 0);
  const fundsRaised = teamRaised + publicTotal;

  const eventCounts = { Pending: 0, Approved: 0, Rejected: 0, Completed: 0 };
  for (const ev of events) {
    if (ev.status in eventCounts) eventCounts[ev.status] += 1;
  }

  return {
    chapter: {
      id: String(chapterDoc._id),
      name: chapterDoc.name,
      city: chapterDoc.city || "",
      status: chapterDoc.status || "",
      established: chapterDoc.established || null,
      monthlyBudget: chapterDoc.monthlyBudget || 0,
      monthlySpent: chapterDoc.monthlySpent || 0,
      fundsRaised,
    },
    president: president
      ? {
          name: president.name || "TBD",
          email: president.email || "",
          phone: president.phone || "",
        }
      : { name: "TBD", email: "", phone: "" },
    summary: {
      members: members.length,
      activeMembers: members.filter((m) => m.status === "active").length,
      teamAccounts: team.length,
      fundsRaised,
      donationsPending: donationTotals.pending || 0,
      donationsVerified: donationTotals.verified || 0,
      donationsRejected: donationTotals.rejected || 0,
      publicDonations: publicTotal,
      publicDonationCount: publicCount,
      teamDonationCount: donationTotals.count || 0,
      casesPending,
      casesDone,
      casesRejected,
      docPending,
      docRunning,
      docComplete,
      eventsTotal: events.length,
      eventsPending: eventCounts.Pending,
      eventsApproved: eventCounts.Approved,
      eventsCompleted: eventCounts.Completed,
    },
    members: members.map((m) => ({
      name: m.name,
      email: m.email,
      phone: m.phone || "",
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
    })),
    team: team.map((u) => ({
      name: u.name,
      email: u.email,
      phone: u.phone || "",
      role: u.chapterRole || u.systemRole,
    })),
    donations: recentTeamDonations.map((d) => ({
      donor: d.donor?.name || "—",
      amount: d.amount || 0,
      status: d.status,
      note: d.note || "",
      date: d.createdAt,
    })),
    cases: recentWelfareCases.map((c) => ({
      caseId: c.caseId || "",
      applicant: c.applicant,
      category: c.category,
      amount: c.amount || 0,
      status: c.status,
      urgency: c.urgency,
      date: c.createdAt,
    })),
    events: events.map((e) => ({
      title: e.title,
      date: e.date,
      venue: e.venue || "",
      status: e.status,
      attendees: e.actualAttendees || e.expectedAttendees || 0,
    })),
  };
}

/**
 * GET /dashboard/report?chapter=all|<id>
 * Full chapter report payload for PDF export (CEO dashboard).
 */
export async function getReport(req, res, next) {
  try {
    const chapterRaw = String(req.query.chapter || "all").trim();
    const generatedAt = new Date().toISOString();

    if (chapterRaw && chapterRaw !== "all") {
      if (!mongoose.Types.ObjectId.isValid(chapterRaw)) {
        return res.status(400).json({ success: false, message: "Invalid chapter id." });
      }
      const chapter = await Chapter.findById(chapterRaw)
        .populate("president", "name email phone")
        .lean();
      if (!chapter) {
        return res.status(404).json({ success: false, message: "Chapter not found." });
      }
      const report = await buildChapterReportPayload(chapter);
      return res.json({
        success: true,
        data: {
          mode: "chapter",
          generatedAt,
          report,
        },
      });
    }

    const chapters = await Chapter.find({})
      .populate("president", "name email phone")
      .sort({ name: 1 })
      .lean();

    const reports = [];
    for (const c of chapters) {
      reports.push(await buildChapterReportPayload(c));
    }

    const totals = reports.reduce(
      (acc, r) => {
        const s = r.summary;
        acc.chapters += 1;
        acc.members += s.members;
        acc.fundsRaised += s.fundsRaised;
        acc.donationsVerified += s.donationsVerified;
        acc.donationsPending += s.donationsPending;
        acc.casesPending += s.casesPending;
        acc.casesDone += s.casesDone;
        acc.docPending += s.docPending;
        acc.docRunning += s.docRunning;
        acc.docComplete += s.docComplete;
        acc.eventsTotal += s.eventsTotal;
        return acc;
      },
      {
        chapters: 0,
        members: 0,
        fundsRaised: 0,
        donationsVerified: 0,
        donationsPending: 0,
        casesPending: 0,
        casesDone: 0,
        docPending: 0,
        docRunning: 0,
        docComplete: 0,
        eventsTotal: 0,
      },
    );

    res.json({
      success: true,
      data: {
        mode: "all",
        generatedAt,
        totals,
        reports,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/chapter-report
 * Chapter president / VP — report for their own chapter only.
 */
export async function getMyChapterReport(req, res, next) {
  try {
    const chapterRef = req.user?.chapter;
    const chapterId =
      chapterRef && typeof chapterRef === "object" ? chapterRef._id : chapterRef;
    if (!chapterId) {
      return res.status(400).json({
        success: false,
        message: "No chapter assigned to your account.",
      });
    }

    const chapter = await Chapter.findById(chapterId)
      .populate("president", "name email phone")
      .lean();
    if (!chapter) {
      return res.status(404).json({ success: false, message: "Chapter not found." });
    }

    const report = await buildChapterReportPayload(chapter);
    res.json({
      success: true,
      data: {
        mode: "chapter",
        generatedAt: new Date().toISOString(),
        report,
      },
    });
  } catch (err) {
    next(err);
  }
}

