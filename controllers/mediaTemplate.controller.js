import MediaTemplate from "../models/MediaTemplate.js";
import { uploadToCloudinary } from "../middleware/upload.js";

const TEMPLATE_EDITORS = new Set(["ceo", "bog_media"]);

function canManageTemplates(user) {
  return TEMPLATE_EDITORS.has(user?.systemRole);
}

export async function listMediaTemplates(req, res, next) {
  try {
    const { category } = req.query;
    const filter = {};
    if (category) filter.category = category;

    const items = await MediaTemplate.find(filter)
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, total: items.length, data: items });
  } catch (err) {
    next(err);
  }
}

export async function uploadMediaTemplate(req, res, next) {
  try {
    if (!canManageTemplates(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const mime = String(req.file.mimetype || "").toLowerCase();
    if (!/^image\//.test(mime) && !mime.includes("pdf")) {
      return res
        .status(400)
        .json({ success: false, message: "Upload an image or PDF template." });
    }

    const result = await uploadToCloudinary(req.file, "serve-humanity/media/templates");
    const doc = await MediaTemplate.create({
      title: req.body.title || req.file.originalname,
      category: req.body.category || "Poster",
      url: result.secure_url,
      publicId: result.public_id || "",
      thumbnail: result.secure_url,
      description: req.body.description || "",
      uploadedBy: req.user._id,
    });

    const populated = await MediaTemplate.findById(doc._id).populate("uploadedBy", "name email");
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function updateMediaTemplate(req, res, next) {
  try {
    if (!canManageTemplates(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    const { title, category, description } = req.body;
    const doc = await MediaTemplate.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Template not found." });

    if (typeof title === "string" && title.trim()) doc.title = title.trim();
    if (category) doc.category = category;
    if (typeof description === "string") doc.description = description;
    await doc.save();

    const populated = await MediaTemplate.findById(doc._id).populate("uploadedBy", "name email");
    res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
}

export async function deleteMediaTemplate(req, res, next) {
  try {
    if (!canManageTemplates(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    const doc = await MediaTemplate.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Template not found." });
    res.json({ success: true, message: "Template deleted." });
  } catch (err) {
    next(err);
  }
}
