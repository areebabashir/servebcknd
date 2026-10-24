import MediaCaseFile from "../models/MediaCaseFile.js";

const MEDIA_BOG = new Set(["ceo", "bog_media"]);
const CHAPTER_MEDIA_ACCESS = new Set([
  "media_head",
  "president",
  "vice_president",
  "director",
]);

function isMediaHead(user) {
  return MEDIA_BOG.has(user.systemRole) || user.chapterRole === "media_head";
}

function canAccessMediaCases(user) {
  return (
    isMediaHead(user) ||
    user.systemRole === "president" ||
    CHAPTER_MEDIA_ACCESS.has(user.chapterRole)
  );
}

function applyChapterScope(filter, user) {
  if (MEDIA_BOG.has(user.systemRole)) return filter;
  if (user.chapter) filter.chapter = user.chapter._id || user.chapter;
  return filter;
}

export async function listMediaCases(req, res, next) {
  try {
    if (!canAccessMediaCases(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { chapter, status, month, page = 1, limit = 50, q } = req.query;
    const filter = applyChapterScope({}, req.user);
    if (chapter && MEDIA_BOG.has(req.user.systemRole)) filter.chapter = chapter;
    if (status) filter.status = status;
    if (month) filter.month = new RegExp(month, "i");
    if (q) {
      filter.$or = [
        { title: new RegExp(q, "i") },
        { month: new RegExp(q, "i") },
        { notes: new RegExp(q, "i") },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      MediaCaseFile.find(filter)
        .skip(skip)
        .limit(Number(limit))
        .populate("chapter", "name city")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort({ createdAt: -1 }),
      MediaCaseFile.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: Number(page), data });
  } catch (err) {
    next(err);
  }
}

export async function getMediaCase(req, res, next) {
  try {
    if (!canAccessMediaCases(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const doc = await MediaCaseFile.findById(req.params.id)
      .populate("chapter", "name city")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");
    if (!doc) return res.status(404).json({ success: false, message: "Media case file not found." });

    if (
      !MEDIA_BOG.has(req.user.systemRole) &&
      req.user.chapter &&
      String(doc.chapter?._id || doc.chapter) !== String(req.user.chapter)
    ) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function createMediaCase(req, res, next) {
  try {
    if (!canAccessMediaCases(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { title, month, chapter, fields, notes, status } = req.body;
    if (!month?.trim()) {
      return res.status(400).json({ success: false, message: "Month is required." });
    }

    let chapterId = chapter || null;
    if (!MEDIA_BOG.has(req.user.systemRole) && req.user.chapter) {
      chapterId = req.user.chapter._id || req.user.chapter;
    }

    const monthLabel = String(month).trim();
    const doc = await MediaCaseFile.create({
      title: title || `${monthLabel} Media Cases`,
      month: monthLabel,
      chapter: chapterId,
      fields: fields || {},
      notes: notes || "",
      status: status || "draft",
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const populated = await MediaCaseFile.findById(doc._id)
      .populate("chapter", "name city")
      .populate("createdBy", "name email");

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function updateMediaCase(req, res, next) {
  try {
    if (!canAccessMediaCases(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const existing = await MediaCaseFile.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Media case file not found." });
    }

    const isHead = isMediaHead(req.user);
    const isOwner = String(existing.createdBy) === String(req.user._id);
    if (!isHead && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Only Media Head or the file creator can edit this record.",
      });
    }

    if (
      !MEDIA_BOG.has(req.user.systemRole) &&
      req.user.chapter &&
      String(existing.chapter) !== String(req.user.chapter)
    ) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const allowed = ["title", "month", "chapter", "fields", "notes", "status"];
    const updates = { updatedBy: req.user._id };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (!MEDIA_BOG.has(req.user.systemRole) && req.user.chapter) {
      updates.chapter = req.user.chapter;
    }

    const doc = await MediaCaseFile.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
      .populate("chapter", "name city")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function deleteMediaCase(req, res, next) {
  try {
    if (!canAccessMediaCases(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const existing = await MediaCaseFile.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Media case file not found." });
    }

    const isHead = isMediaHead(req.user);
    const isOwner = String(existing.createdBy) === String(req.user._id);
    if (!isHead && !isOwner && req.user.systemRole !== "ceo") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (
      !MEDIA_BOG.has(req.user.systemRole) &&
      req.user.chapter &&
      String(existing.chapter) !== String(req.user.chapter)
    ) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    await MediaCaseFile.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Media case file deleted." });
  } catch (err) {
    next(err);
  }
}
