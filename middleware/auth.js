import jwt from "jsonwebtoken";
import User, { CEO_DASHBOARD_ROLES, FULL_ACCESS_ROLES, isFullAccessRole } from "../models/User.js";

export { FULL_ACCESS_ROLES, isFullAccessRole };

export async function protect(req, res, next) {
  try {
    let token;

    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id)
      .select("-password")
      .populate("chapter", "name city")
      .populate("teamDirector", "name email chapterRole")
      .populate("cabinetMember", "name email chapterRole");

    if (!req.user) {
      return res.status(401).json({ success: false, message: "User no longer exists." });
    }

    next();
  } catch (err) {
    next(err);
  }
}

/** requireRole("ceo") or requireRole(["ceo","bog_finance"]) — checks systemRole only */
export function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.systemRole)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    next();
  };
}

/** CEO / Founder / CTO / COO — full org admin */
export function requireFullAccess(req, res, next) {
  if (!req.user || !isFullAccessRole(req.user.systemRole)) {
    return res.status(403).json({ success: false, message: "Leadership access only." });
  }
  next();
}

/** Full-access roles plus any extra system roles */
export function requireFullAccessOr(...extraSystemRoles) {
  return requireRole(...FULL_ACCESS_ROLES, ...extraSystemRoles.flat());
}

/** Allow if systemRole OR chapterRole matches (chapter ops roles live on chapterRole). */
export function hasSystemOrChapterRole(user, { system = [], chapter = [] } = {}) {
  if (!user) return false;
  if (system.includes(user.systemRole)) return true;
  if (chapter.includes(user.chapterRole)) return true;
  return false;
}

export function requireSystemOrChapter({ system = [], chapter = [] } = {}) {
  return (req, res, next) => {
    if (!hasSystemOrChapterRole(req.user, { system, chapter })) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    next();
  };
}

/** Any user who may open the CEO / Board dashboard */
export function requireCeoDashboard(req, res, next) {
  if (!req.user || !CEO_DASHBOARD_ROLES.includes(req.user.systemRole)) {
    return res.status(403).json({ success: false, message: "CEO / Board access only." });
  }
  next();
}
