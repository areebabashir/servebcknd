import Member from "../models/Member.js";
import Chapter from "../models/Chapter.js";

const MEMBER_BOG = new Set(["ceo"]);

function chapterIdOf(user) {
  if (!user?.chapter) return null;
  return user.chapter._id || user.chapter;
}

function applyChapterScope(filter, user) {
  if (MEMBER_BOG.has(user?.systemRole)) return filter;
  const cid = chapterIdOf(user);
  if (cid) filter.chapter = cid;
  return filter;
}

export async function getMembers(req, res, next) {
  try {
    const { chapter, status, role, page = 1, limit = 50 } = req.query;
    const filter = applyChapterScope({}, req.user);
    if (chapter && MEMBER_BOG.has(req.user.systemRole)) filter.chapter = chapter;
    if (status) filter.status = status;
    if (role) filter.role = role;

    const skip = (Number(page) - 1) * Number(limit);
    const [members, total] = await Promise.all([
      Member.find(filter)
        .skip(skip)
        .limit(Number(limit))
        .populate("chapter", "name city")
        .sort({ joinedAt: -1 }),
      Member.countDocuments(filter),
    ]);
    res.json({ success: true, total, data: members });
  } catch (err) {
    next(err);
  }
}

export async function getMember(req, res, next) {
  try {
    const member = await Member.findById(req.params.id).populate("chapter", "name city");
    if (!member) return res.status(404).json({ success: false, message: "Member not found." });
    if (!MEMBER_BOG.has(req.user.systemRole)) {
      const cid = chapterIdOf(req.user);
      if (cid && String(member.chapter?._id || member.chapter) !== String(cid)) {
        return res.status(403).json({ success: false, message: "Access denied." });
      }
    }
    res.json({ success: true, data: member });
  } catch (err) {
    next(err);
  }
}

export async function createMember(req, res, next) {
  try {
    const body = { ...req.body };
    if (!MEMBER_BOG.has(req.user.systemRole)) {
      const cid = chapterIdOf(req.user);
      if (!cid) {
        return res.status(400).json({
          success: false,
          message: "Your account is not assigned to a chapter.",
        });
      }
      body.chapter = cid;
    }
    const member = await Member.create(body);
    await Chapter.findByIdAndUpdate(member.chapter, { $inc: { memberCount: 1 } });

    req.app.get("io")?.emit("member:created", member);
    res.status(201).json({ success: true, data: member });
  } catch (err) {
    next(err);
  }
}

export async function updateMember(req, res, next) {
  try {
    const existing = await Member.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Member not found." });
    if (!MEMBER_BOG.has(req.user.systemRole)) {
      const cid = chapterIdOf(req.user);
      if (!cid || String(existing.chapter) !== String(cid)) {
        return res.status(403).json({ success: false, message: "Access denied." });
      }
    }

    const updates = { ...req.body };
    if (!MEMBER_BOG.has(req.user.systemRole)) {
      updates.chapter = chapterIdOf(req.user);
    }

    const member = await Member.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!member) return res.status(404).json({ success: false, message: "Member not found." });

    req.app.get("io")?.emit("member:updated", member);
    res.json({ success: true, data: member });
  } catch (err) {
    next(err);
  }
}

export async function deleteMember(req, res, next) {
  try {
    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ success: false, message: "Member not found." });
    if (!MEMBER_BOG.has(req.user.systemRole) && req.user.systemRole !== "president") {
      const cid = chapterIdOf(req.user);
      if (!cid || String(member.chapter) !== String(cid)) {
        return res.status(403).json({ success: false, message: "Access denied." });
      }
    }

    await Member.findByIdAndDelete(req.params.id);
    await Chapter.findByIdAndUpdate(member.chapter, { $inc: { memberCount: -1 } });
    res.json({ success: true, message: "Member removed." });
  } catch (err) {
    next(err);
  }
}
