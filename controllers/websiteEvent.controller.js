import WebsiteEvent from "../models/WebsiteEvent.js";
import EventRegistration from "../models/EventRegistration.js";
import { sendEmail } from "../utils/email.js";
import { hasSystemOrChapterRole } from "../middleware/auth.js";

function chapterIdOf(user) {
  if (!user?.chapter) return null;
  if (typeof user.chapter === "object") return user.chapter._id || null;
  return user.chapter;
}

function canManageChapterWebsiteEvents(user) {
  return hasSystemOrChapterRole(user, {
    system: ["president"],
    chapter: ["president", "vice_president"],
  });
}

function formatPublicEvent(doc) {
  const d = doc.toObject ? doc.toObject() : doc;
  const dateObj = d.date ? new Date(d.date) : null;
  let days = 0;
  if (dateObj && !Number.isNaN(dateObj.getTime())) {
    const eventDay = Date.UTC(
      dateObj.getUTCFullYear(),
      dateObj.getUTCMonth(),
      dateObj.getUTCDate(),
    );
    const now = new Date();
    const todayDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    days = Math.max(0, Math.round((eventDay - todayDay) / (1000 * 60 * 60 * 24)));
  }
  const dateLabel = dateObj
    ? dateObj
        .toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
          timeZone: "UTC",
        })
        .toUpperCase()
    : "";
  const chapterName =
    d.chapter && typeof d.chapter === "object" ? d.chapter.name || "" : "";
  return {
    id: String(d._id),
    title: d.title,
    date: dateLabel,
    dateIso: dateObj ? dateObj.toISOString() : null,
    location: d.location,
    capacity: d.capacity || "",
    description: d.description || "",
    chapterName,
    days,
  };
}

function parseEventFields(body) {
  const title = String(body?.title || "").trim();
  const location = String(body?.location || "").trim();
  const capacity = String(body?.capacity || "").trim();
  const description = String(body?.description || "").trim();
  const dateRaw = body?.date;
  if (!title || !location || !dateRaw) {
    return {
      error: "Title, date, and location are required.",
    };
  }
  const date = new Date(dateRaw);
  if (Number.isNaN(date.getTime())) {
    return { error: "Invalid date." };
  }
  return {
    fields: {
      title,
      location,
      capacity,
      description,
      date,
      published: body?.published !== false,
      sortOrder: Number(body?.sortOrder) || 0,
    },
  };
}

/** GET /website-events/public — all published (upcoming first, then past). */
export async function listPublicEvents(req, res, next) {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const upcoming = await WebsiteEvent.find({
      published: true,
      date: { $gte: now },
    })
      .populate("chapter", "name city")
      .sort({ date: 1, sortOrder: 1 })
      .limit(limit)
      .lean();

    let docs = upcoming;
    if (docs.length < limit) {
      const past = await WebsiteEvent.find({
        published: true,
        date: { $lt: now },
      })
        .populate("chapter", "name city")
        .sort({ date: -1, sortOrder: 1 })
        .limit(limit - docs.length)
        .lean();
      docs = [...docs, ...past];
    }

    res.json({ success: true, data: docs.map(formatPublicEvent) });
  } catch (err) {
    next(err);
  }
}

/** POST /website-events/:id/register */
export async function registerForEvent(req, res, next) {
  try {
    const event = await WebsiteEvent.findById(req.params.id);
    if (!event || !event.published) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    if (event.date < dayStart) {
      return res.status(400).json({
        success: false,
        message: "This event has already ended. Registration is closed.",
      });
    }
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim();
    const note = String(req.body?.note || "").trim();
    if (!name || !email) {
      return res.status(400).json({ success: false, message: "Name and email are required." });
    }

    await EventRegistration.create({
      event: event._id,
      name,
      email,
      phone,
      note,
    });

    await sendEmail({
      to: email,
      subject: `Registration received — ${event.title}`,
      html: `<p>Dear ${name},</p>
             <p>Thank you for registering for <strong>${event.title}</strong> in ${event.location}.</p>
             <p>We will share more details closer to the event date.</p>
             <p>— Serve Humanity Team</p>`,
    }).catch((e) => console.warn("Event registration email failed:", e.message));

    res.status(201).json({
      success: true,
      message: "You’re registered. Check your email for confirmation.",
    });
  } catch (err) {
    next(err);
  }
}

/** GET /website-events — CEO list (all chapters + org-wide) */
export async function listEvents(req, res, next) {
  try {
    const { published } = req.query;
    const filter = {};
    if (published === "true") filter.published = true;
    if (published === "false") filter.published = false;
    const data = await WebsiteEvent.find(filter)
      .populate("chapter", "name city")
      .populate("createdBy", "name email")
      .sort({ date: 1, createdAt: -1 })
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** POST /website-events — CEO / bog_media (org-wide) */
export async function createEvent(req, res, next) {
  try {
    const parsed = parseEventFields(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }
    const doc = await WebsiteEvent.create({
      ...parsed.fields,
      chapter: null,
      createdBy: req.user?._id || null,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

/** PATCH /website-events/:id */
export async function updateEvent(req, res, next) {
  try {
    const updates = {};
    if (req.body?.title != null) updates.title = String(req.body.title).trim();
    if (req.body?.location != null) updates.location = String(req.body.location).trim();
    if (req.body?.capacity != null) updates.capacity = String(req.body.capacity).trim();
    if (req.body?.description != null) updates.description = String(req.body.description).trim();
    if (req.body?.published != null) updates.published = Boolean(req.body.published);
    if (req.body?.sortOrder != null) updates.sortOrder = Number(req.body.sortOrder) || 0;
    if (req.body?.date != null) {
      const date = new Date(req.body.date);
      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid date." });
      }
      updates.date = date;
    }
    const doc = await WebsiteEvent.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate("chapter", "name city");
    if (!doc) return res.status(404).json({ success: false, message: "Event not found." });
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

/** DELETE /website-events/:id */
export async function deleteEvent(req, res, next) {
  try {
    const doc = await WebsiteEvent.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Event not found." });
    await EventRegistration.deleteMany({ event: doc._id });
    res.json({ success: true, message: "Event deleted." });
  } catch (err) {
    next(err);
  }
}

/** GET /website-events/:id/registrations */
export async function listRegistrations(req, res, next) {
  try {
    const data = await EventRegistration.find({ event: req.params.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /website-events/chapter/mine — events for the logged-in president's chapter */
export async function listChapterEvents(req, res, next) {
  try {
    if (!canManageChapterWebsiteEvents(req.user)) {
      return res.status(403).json({ success: false, message: "Chapter leadership access only." });
    }
    const chapterId = chapterIdOf(req.user);
    if (!chapterId) {
      return res.status(400).json({ success: false, message: "No chapter assigned to your account." });
    }
    const data = await WebsiteEvent.find({ chapter: chapterId })
      .populate("chapter", "name city")
      .sort({ date: 1, createdAt: -1 })
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** POST /website-events/chapter — chapter president creates a public event */
export async function createChapterEvent(req, res, next) {
  try {
    if (!canManageChapterWebsiteEvents(req.user)) {
      return res.status(403).json({ success: false, message: "Chapter leadership access only." });
    }
    const chapterId = chapterIdOf(req.user);
    if (!chapterId) {
      return res.status(400).json({ success: false, message: "No chapter assigned to your account." });
    }
    const parsed = parseEventFields(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }
    const doc = await WebsiteEvent.create({
      ...parsed.fields,
      chapter: chapterId,
      createdBy: req.user._id,
    });
    const populated = await WebsiteEvent.findById(doc._id)
      .populate("chapter", "name city")
      .lean();
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

async function findOwnedChapterEvent(req) {
  const chapterId = chapterIdOf(req.user);
  if (!chapterId) return { error: { status: 400, message: "No chapter assigned to your account." } };
  const doc = await WebsiteEvent.findById(req.params.id);
  if (!doc) return { error: { status: 404, message: "Event not found." } };
  if (!doc.chapter || String(doc.chapter) !== String(chapterId)) {
    return {
      error: {
        status: 403,
        message: "You can only manage events posted by your chapter.",
      },
    };
  }
  return { doc, chapterId };
}

/** PATCH /website-events/chapter/:id */
export async function updateChapterEvent(req, res, next) {
  try {
    if (!canManageChapterWebsiteEvents(req.user)) {
      return res.status(403).json({ success: false, message: "Chapter leadership access only." });
    }
    const owned = await findOwnedChapterEvent(req);
    if (owned.error) {
      return res.status(owned.error.status).json({ success: false, message: owned.error.message });
    }

    const updates = {};
    if (req.body?.title != null) updates.title = String(req.body.title).trim();
    if (req.body?.location != null) updates.location = String(req.body.location).trim();
    if (req.body?.capacity != null) updates.capacity = String(req.body.capacity).trim();
    if (req.body?.description != null) updates.description = String(req.body.description).trim();
    if (req.body?.published != null) updates.published = Boolean(req.body.published);
    if (req.body?.sortOrder != null) updates.sortOrder = Number(req.body.sortOrder) || 0;
    if (req.body?.date != null) {
      const date = new Date(req.body.date);
      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid date." });
      }
      updates.date = date;
    }

    Object.assign(owned.doc, updates);
    await owned.doc.save();
    const data = await WebsiteEvent.findById(owned.doc._id).populate("chapter", "name city").lean();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** DELETE /website-events/chapter/:id */
export async function deleteChapterEvent(req, res, next) {
  try {
    if (!canManageChapterWebsiteEvents(req.user)) {
      return res.status(403).json({ success: false, message: "Chapter leadership access only." });
    }
    const owned = await findOwnedChapterEvent(req);
    if (owned.error) {
      return res.status(owned.error.status).json({ success: false, message: owned.error.message });
    }
    await owned.doc.deleteOne();
    await EventRegistration.deleteMany({ event: owned.doc._id });
    res.json({ success: true, message: "Event deleted." });
  } catch (err) {
    next(err);
  }
}

/** GET /website-events/chapter/:id/registrations */
export async function listChapterRegistrations(req, res, next) {
  try {
    if (!canManageChapterWebsiteEvents(req.user)) {
      return res.status(403).json({ success: false, message: "Chapter leadership access only." });
    }
    const owned = await findOwnedChapterEvent(req);
    if (owned.error) {
      return res.status(owned.error.status).json({ success: false, message: owned.error.message });
    }
    const data = await EventRegistration.find({ event: owned.doc._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
