import Media from "../models/Media.js";
import { uploadToCloudinary } from "../middleware/upload.js";

const MEDIA_BOG = new Set(["ceo", "bog_media"]);

function chapterIdOf(user) {
  if (!user?.chapter) return null;
  return user.chapter._id || user.chapter;
}

function applyChapterScope(filter, user) {
  if (MEDIA_BOG.has(user?.systemRole)) return filter;
  const cid = chapterIdOf(user);
  if (cid) filter.chapter = cid;
  return filter;
}

export async function getMedia(req, res, next) {
  try {
    const { chapter, status, type, page = 1, limit = 20 } = req.query;
    const filter = applyChapterScope({}, req.user);
    if (chapter && MEDIA_BOG.has(req.user?.systemRole)) filter.chapter = chapter;
    if (status) filter.status = status;
    if (type) filter.type = type;

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Media.find(filter)
        .skip(skip)
        .limit(Number(limit))
        .populate("chapter", "name city")
        .populate("uploadedBy", "name")
        .sort({ createdAt: -1 }),
      Media.countDocuments(filter),
    ]);
    res.json({ success: true, total, data: items });
  } catch (err) {
    next(err);
  }
}

export async function uploadMedia(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    let chapterId = req.body.chapter || null;
    if (!MEDIA_BOG.has(req.user.systemRole)) {
      chapterId = chapterIdOf(req.user);
      if (!chapterId) {
        return res.status(400).json({
          success: false,
          message: "Your account is not assigned to a chapter.",
        });
      }
    }
    if (!chapterId) {
      return res.status(400).json({ success: false, message: "Chapter is required." });
    }

    const result = await uploadToCloudinary(req.file, "serve-humanity/media");
    const media = await Media.create({
      title: req.body.title || req.file.originalname,
      type: req.body.type || "Graphic",
      url: result.secure_url,
      publicId: result.public_id,
      thumbnail: result.secure_url,
      chapter: chapterId,
      uploadedBy: req.user._id,
      tags: req.body.tags ? req.body.tags.split(",").map((t) => t.trim()) : [],
      description: req.body.description || "",
    });

    const populated = await Media.findById(media._id)
      .populate("chapter", "name city")
      .populate("uploadedBy", "name");

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function updateMediaStatus(req, res, next) {
  try {
    const { status } = req.body;
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ success: false, message: "Media not found." });

    if (!MEDIA_BOG.has(req.user.systemRole)) {
      const cid = chapterIdOf(req.user);
      if (!cid || String(media.chapter) !== String(cid)) {
        return res.status(403).json({ success: false, message: "Access denied." });
      }
    }

    media.status = status;
    if (status === "Approved") media.approvedBy = req.user._id;
    await media.save();

    res.json({ success: true, data: media });
  } catch (err) {
    next(err);
  }
}

export async function deleteMedia(req, res, next) {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ success: false, message: "Media not found." });

    if (!MEDIA_BOG.has(req.user.systemRole)) {
      const cid = chapterIdOf(req.user);
      if (!cid || String(media.chapter) !== String(cid)) {
        return res.status(403).json({ success: false, message: "Access denied." });
      }
    }

    await Media.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Media deleted." });
  } catch (err) {
    next(err);
  }
}
