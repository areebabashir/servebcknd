import SiteContent, { WEBSITE_PAGES } from "../models/SiteContent.js";
import { DEFAULT_WEBSITE_CONTENT } from "../data/websiteDefaults.js";
import { uploadToCloudinary } from "../middleware/upload.js";

const WEBSITE_EDITORS = new Set(["ceo", "founder", "cto", "coo", "bog_media"]);

function canEditWebsite(user) {
  return WEBSITE_EDITORS.has(user?.systemRole);
}

/** Fill missing section keys from defaults (keeps saved edits).
 *  Team/leadership is CMS-driven — never inject dummy people from defaults.
 *  About deep-merges nested blocks (founder, ceo, programs) so new fields always appear in CMS. */
function withDefaultSections(page, sections) {
  if (page === "leadership" || page === "chapters") {
    // Don't inject dummy lists — Team people & chapter cards come from live DB / CMS saves only
    const remote = sections && typeof sections === "object" ? sections : {};
    if (page === "chapters") {
      const defaults = DEFAULT_WEBSITE_CONTENT.chapters || {};
      return {
        hero: { ...(defaults.hero || {}), ...(remote.hero || {}) },
        items: [],
      };
    }
    return remote;
  }
  const defaults = DEFAULT_WEBSITE_CONTENT[page] || {};
  const remote = sections && typeof sections === "object" ? sections : {};
  if (page === "footer") {
    const merged = { ...defaults, ...remote };
    const dSocial =
      defaults.social && typeof defaults.social === "object" ? defaults.social : {};
    const rSocial = remote.social && typeof remote.social === "object" ? remote.social : {};
    merged.social = { ...dSocial, ...rSocial };
    return merged;
  }
  // Need Support page — replace legacy "Volunteer / Join the mission" CMS copy
  if (page === "volunteer") {
    const dHero = defaults.hero && typeof defaults.hero === "object" ? defaults.hero : {};
    const rHero = remote.hero && typeof remote.hero === "object" ? remote.hero : {};
    const stale =
      !rHero.title ||
      rHero.title === "Join the mission" ||
      rHero.eyebrow === "Volunteer" ||
      String(rHero.description || "").includes("12,500 volunteers");
    return {
      ...defaults,
      ...remote,
      hero: stale ? { ...dHero } : { ...dHero, ...rHero },
    };
  }
  if (page !== "about") {
    return { ...defaults, ...remote };
  }

  const merged = { ...defaults, ...remote };
  for (const key of ["hero", "story", "founder", "ceo", "programs"]) {
    const d = defaults[key] && typeof defaults[key] === "object" ? defaults[key] : {};
    const r = remote[key] && typeof remote[key] === "object" ? remote[key] : {};
    merged[key] = { ...d, ...r };
  }
  if (!Array.isArray(merged.values) || merged.values.length === 0) {
    merged.values = defaults.values || [];
  }
  if (!Array.isArray(merged.programs?.items) || merged.programs.items.length === 0) {
    merged.programs = {
      ...(merged.programs || {}),
      items: defaults.programs?.items || [],
    };
  }
  if (!Array.isArray(merged.story?.paragraphs) || merged.story.paragraphs.length === 0) {
    merged.story = {
      ...(merged.story || {}),
      paragraphs: defaults.story?.paragraphs || [],
    };
  }
  return merged;
}

/** Public: all published pages (or one page). */
export async function getPublicWebsite(req, res, next) {
  try {
    const { page } = req.query;
    if (page) {
      if (!WEBSITE_PAGES.includes(page)) {
        return res.status(400).json({ success: false, message: "Invalid page." });
      }
      let doc = await SiteContent.findOne({ page, published: true }).lean();
      if (!doc) {
        doc = {
          page,
          // Team page: empty until CMS saves — no dummy roster
          sections: page === "leadership" ? { hero: { title: "Team" }, groups: [] } : DEFAULT_WEBSITE_CONTENT[page] || {},
          published: true,
        };
      } else {
        doc = { ...doc, sections: withDefaultSections(page, doc.sections) };
      }
      return res.json({ success: true, data: doc });
    }

    const docs = await SiteContent.find({ published: true }).lean();
    const byPage = Object.fromEntries(docs.map((d) => [d.page, d]));
    const data = WEBSITE_PAGES.map((p) => {
      if (byPage[p]) {
        return { ...byPage[p], sections: withDefaultSections(p, byPage[p].sections) };
      }
      return {
        page: p,
        sections: DEFAULT_WEBSITE_CONTENT[p] || {},
        published: true,
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** Admin: list all pages (including unpublished). */
export async function listWebsitePages(req, res, next) {
  try {
    if (!canEditWebsite(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    const docs = await SiteContent.find()
      .populate("updatedBy", "name email")
      .sort({ page: 1 })
      .lean();
    const byPage = Object.fromEntries(docs.map((d) => [d.page, d]));
    const data = WEBSITE_PAGES.map((p) => {
      if (byPage[p]) {
        return { ...byPage[p], sections: withDefaultSections(p, byPage[p].sections) };
      }
      return {
        _id: null,
        page: p,
        sections: DEFAULT_WEBSITE_CONTENT[p] || {},
        published: true,
        updatedAt: null,
        updatedBy: null,
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getWebsitePage(req, res, next) {
  try {
    if (!canEditWebsite(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    const { page } = req.params;
    if (!WEBSITE_PAGES.includes(page)) {
      return res.status(400).json({ success: false, message: "Invalid page." });
    }
    let doc = await SiteContent.findOne({ page })
      .populate("updatedBy", "name email")
      .lean();
    if (!doc) {
      doc = {
        _id: null,
        page,
        sections: DEFAULT_WEBSITE_CONTENT[page] || {},
        published: true,
        updatedAt: null,
        updatedBy: null,
      };
    } else {
      doc = { ...doc, sections: withDefaultSections(page, doc.sections) };
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

/** Upsert a page's sections. */
export async function upsertWebsitePage(req, res, next) {
  try {
    if (!canEditWebsite(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    const { page } = req.params;
    if (!WEBSITE_PAGES.includes(page)) {
      return res.status(400).json({ success: false, message: "Invalid page." });
    }

    const { sections, published } = req.body;
    if (sections == null || typeof sections !== "object") {
      return res.status(400).json({ success: false, message: "sections object is required." });
    }

    const updates = {
      sections,
      updatedBy: req.user._id,
    };
    if (typeof published === "boolean") updates.published = published;

    const doc = await SiteContent.findOneAndUpdate(
      { page },
      { $set: updates, $setOnInsert: { page } },
      { new: true, upsert: true, runValidators: true },
    ).populate("updatedBy", "name email");

    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

/** Seed all pages from defaults (idempotent — only fills missing pages). */
export async function seedWebsiteDefaults(req, res, next) {
  try {
    if (!canEditWebsite(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    let created = 0;
    for (const page of WEBSITE_PAGES) {
      const existing = await SiteContent.findOne({ page });
      if (existing) continue;
      await SiteContent.create({
        page,
        sections: DEFAULT_WEBSITE_CONTENT[page] || {},
        published: true,
        updatedBy: req.user._id,
      });
      created += 1;
    }
    res.json({
      success: true,
      message: created ? `Seeded ${created} page(s).` : "All pages already exist.",
      created,
    });
  } catch (err) {
    next(err);
  }
}

/** Upload a gallery (or site) image to Cloudinary. */
export async function uploadWebsiteImage(req, res, next) {
  try {
    if (!canEditWebsite(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image uploaded." });
    }
    const mime = String(req.file.mimetype || "").toLowerCase();
    if (!/^image\//.test(mime)) {
      return res.status(400).json({ success: false, message: "Only image files are allowed." });
    }
    const result = await uploadToCloudinary(req.file, "serve-humanity/website/gallery");
    res.status(201).json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Reset one page to defaults. */
export async function resetWebsitePage(req, res, next) {
  try {
    if (!canEditWebsite(req.user)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    const { page } = req.params;
    if (!WEBSITE_PAGES.includes(page)) {
      return res.status(400).json({ success: false, message: "Invalid page." });
    }
    const doc = await SiteContent.findOneAndUpdate(
      { page },
      {
        $set: {
          sections: DEFAULT_WEBSITE_CONTENT[page] || {},
          published: true,
          updatedBy: req.user._id,
        },
        $setOnInsert: { page },
      },
      { new: true, upsert: true },
    ).populate("updatedBy", "name email");
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}
