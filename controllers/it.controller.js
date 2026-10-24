import User, {
  CEO_DASHBOARD_ROLES,
  FULL_ACCESS_ROLES,
  isFullAccessRole,
} from "../models/User.js";
import Chapter from "../models/Chapter.js";

/** Org-wide IT Manager (CEO dashboard) — manages board + all chapter accounts. */
function isOrgItManager(user) {
  return user?.systemRole === "bog_it";
}

function canAccessIt(user) {
  return isOrgItManager(user);
}

/** Org IT may manage every account except its own (use Settings for self-service). */
function assertCanManageTarget(actor, target) {
  if (!target) return { ok: false, status: 404, message: "User not found." };
  if (String(target._id) === String(actor._id)) {
    return { ok: false, status: 400, message: "Use Settings / Profile for your own account." };
  }

  return { ok: true };
}

/**
 * GET /it/accounts?q=&chapter=&role=
 */
export async function listItAccounts(req, res, next) {
  try {
    if (!canAccessIt(req.user)) {
      return res.status(403).json({ success: false, message: "IT Management access only." });
    }

    const { q, chapter, role } = req.query;
    const filter = {};

    if (chapter && String(chapter) !== "all") {
      filter.chapter = chapter;
    }

    if (role?.trim()) {
      const r = String(role).trim();
      filter.$or = [{ systemRole: r }, { chapterRole: r }];
    }

    if (q?.trim()) {
      const needle = String(q).trim();
      const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const search = [{ name: rx }, { email: rx }, { phone: rx }];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: search }];
        delete filter.$or;
      } else {
        filter.$or = search;
      }
    }

    const users = await User.find(filter)
      .select("-password")
      .populate("chapter", "name city")
      .populate("teamDirector", "name email chapterRole")
      .populate("cabinetMember", "name email chapterRole")
      .sort({ name: 1 })
      .limit(500)
      .lean();

    res.json({ success: true, total: users.length, data: users });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /it/accounts
 * Org IT: board seats (bog_*) or chapter member accounts (any chapter).
 */
export async function createItAccount(req, res, next) {
  try {
    if (!canAccessIt(req.user)) {
      return res.status(403).json({ success: false, message: "IT Management access only." });
    }

    const { name, email, password, phone, systemRole, chapterRole, chapter } = req.body || {};
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

    let payload;
    const wantBoard = systemRole && CEO_DASHBOARD_ROLES.includes(systemRole);

    if (wantBoard) {
      if (FULL_ACCESS_ROLES.includes(systemRole) && req.user.systemRole === "bog_it") {
        return res.status(403).json({
          success: false,
          message: "IT Manager cannot create full-access leadership seats.",
        });
      }
      if (isFullAccessRole(systemRole) && !isFullAccessRole(req.user.systemRole)) {
        return res.status(403).json({
          success: false,
          message: "Only leadership can create CEO / Founder / CTO / COO seats.",
        });
      }
      const seatTaken = await User.findOne({ systemRole, isActive: true });
      if (seatTaken) {
        return res.status(409).json({
          success: false,
          message: `An active ${systemRole.replace(/_/g, " ")} account already exists.`,
        });
      }
      payload = {
        name: name.trim(),
        email: String(email).toLowerCase().trim(),
        password,
        phone: phone?.trim() || "",
        systemRole,
        chapterRole: null,
        chapter: null,
        isActive: true,
        membershipStatus: "approved",
      };
    } else {
      const chapterId = chapter || null;
      if (!chapterId) {
        return res.status(400).json({
          success: false,
          message: "Pick a chapter for this member account.",
        });
      }
      const chapterDoc = await Chapter.findById(chapterId);
      if (!chapterDoc) {
        return res.status(404).json({ success: false, message: "Chapter not found." });
      }
      payload = {
        name: name.trim(),
        email: String(email).toLowerCase().trim(),
        password,
        phone: phone?.trim() || "",
        systemRole: "member",
        chapterRole: chapterRole === "director" ? "director" : "member",
        chapter: chapterId,
        cabinetMember: null,
        teamDirector: null,
        isActive: true,
        membershipStatus: "approved",
      };
    }

    const user = await User.create(payload);
    if (user.chapter) {
      await Chapter.findByIdAndUpdate(user.chapter, { $inc: { memberCount: 1 } }).catch(() => {});
    }

    const safe = await User.findById(user._id)
      .select("-password")
      .populate("chapter", "name city");

    res.status(201).json({
      success: true,
      data: safe,
      temporaryPassword: String(password),
      message: "Account created. Share the email and password now — it will not be shown again.",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /it/accounts/:id/reset-password
 * Body: { password } — returned once as temporaryPassword
 */
export async function resetItPassword(req, res, next) {
  try {
    if (!canAccessIt(req.user)) {
      return res.status(403).json({ success: false, message: "IT Management access only." });
    }

    const password = String(req.body?.password || "");
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const target = await User.findById(req.params.id).select("+password");
    const gate = assertCanManageTarget(req.user, target);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, message: gate.message });
    }

    target.password = password;
    target.passwordChangedAt = new Date();
    await target.save();

    res.json({
      success: true,
      temporaryPassword: password,
      message: "Password reset. Share it now — it will not be shown again.",
      data: {
        _id: target._id,
        name: target.name,
        email: target.email,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /it/accounts/:id
 * Body: { isActive?, name?, email?, phone? }
 */
export async function updateItAccount(req, res, next) {
  try {
    if (!canAccessIt(req.user)) {
      return res.status(403).json({ success: false, message: "IT Management access only." });
    }

    const target = await User.findById(req.params.id);
    const gate = assertCanManageTarget(req.user, target);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, message: gate.message });
    }

    const updates = {};
    for (const key of ["name", "phone", "isActive"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (req.body.email !== undefined) {
      const nextEmail = String(req.body.email).toLowerCase().trim();
      if (!nextEmail) {
        return res.status(400).json({ success: false, message: "Email is required." });
      }
      const taken = await User.findOne({ email: nextEmail, _id: { $ne: target._id } });
      if (taken) {
        return res.status(409).json({ success: false, message: "That email is already in use." });
      }
      updates.email = nextEmail;
    }

    if (updates.name !== undefined && !String(updates.name).trim()) {
      return res.status(400).json({ success: false, message: "Name is required." });
    }
    if (updates.name !== undefined) updates.name = String(updates.name).trim();
    if (updates.phone !== undefined) updates.phone = String(updates.phone).trim();

    const user = await User.findByIdAndUpdate(target._id, updates, {
      new: true,
      runValidators: true,
    })
      .select("-password")
      .populate("chapter", "name city")
      .populate("teamDirector", "name email chapterRole")
      .populate("cabinetMember", "name email chapterRole");

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

/** GET /it/chapters — chapter list when creating / filtering members */
export async function listItChapters(req, res, next) {
  try {
    if (!isOrgItManager(req.user)) {
      return res.status(403).json({ success: false, message: "Org IT access only." });
    }
    const chapters = await Chapter.find({})
      .select("name city status")
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, data: chapters });
  } catch (err) {
    next(err);
  }
}

export { canAccessIt, isOrgItManager };
