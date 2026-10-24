import User from "../models/User.js";
import { CABINET_ROLES, isCabinetRole } from "./teamHeads.js";

/** Maps cabinet chapterRole → team module key */
export const CABINET_MODULE_MAP = {
  finance_head: "finance",
  operations_head: "operations",
  verification_head: "verification",
  documentation_head: "documentation",
  media_head: "media",
};

export const MODULE_CABINET_ROLE = Object.fromEntries(
  Object.entries(CABINET_MODULE_MAP).map(([role, mod]) => [mod, role]),
);

export const APPROVAL_STATUSES = ["draft", "pending", "approved", "rejected"];

export function cabinetRoleForModule(module) {
  return MODULE_CABINET_ROLE[module] || null;
}

export function moduleForCabinetRole(chapterRole) {
  return CABINET_MODULE_MAP[chapterRole] || null;
}

export function refId(ref) {
  if (!ref) return null;
  return ref._id || ref;
}

/** Which team module this user belongs to (cabinet seat or reports to one). */
export function teamModuleOf(user) {
  if (!user) return null;
  const fromRole = moduleForCabinetRole(user.chapterRole);
  if (fromRole) return fromRole;
  const cm = user.cabinetMember;
  if (cm && typeof cm === "object" && cm.chapterRole) {
    return moduleForCabinetRole(cm.chapterRole);
  }
  return null;
}

export function isCabinetForModule(user, module) {
  return moduleForCabinetRole(user?.chapterRole) === module;
}

export function isChapterLeadership(user) {
  return (
    user?.systemRole === "president" ||
    user?.chapterRole === "president" ||
    user?.chapterRole === "vice_president" ||
    user?.chapterRole === "vice_president_male"
  );
}

export function isBogUser(user) {
  return ["ceo", "founder", "cto", "coo"].includes(user?.systemRole) || String(user?.systemRole || "").startsWith("bog_");
}

/**
 * Submission ownership stamped at create time.
 * Directors/members inherit cabinet from cabinetMember; cabinet seats use self.
 */
export async function resolveSubmissionOwnership(user) {
  if (isCabinetRole(user.chapterRole)) {
    return {
      cabinetMember: user._id,
      teamDirector: null,
      teamModule: moduleForCabinetRole(user.chapterRole),
    };
  }

  let cabinetId = refId(user.cabinetMember);
  let cabinetRole = null;
  if (user.cabinetMember && typeof user.cabinetMember === "object") {
    cabinetRole = user.cabinetMember.chapterRole;
  } else if (cabinetId) {
    const cab = await User.findById(cabinetId).select("chapterRole");
    cabinetRole = cab?.chapterRole;
  }

  return {
    cabinetMember: cabinetId,
    teamDirector: refId(user.teamDirector),
    teamModule: cabinetRole ? moduleForCabinetRole(cabinetRole) : null,
  };
}

/**
 * List filter: cabinet sees all team submissions; directors/members see only own.
 * President/VP/BOG see all in chapter (already chapter-scoped).
 */
export function applySubmissionListScope(filter, user, module) {
  if (isBogUser(user) || isChapterLeadership(user)) {
    if (module) filter.teamModule = module;
    return filter;
  }

  if (isCabinetForModule(user, module)) {
    filter.cabinetMember = user._id;
    filter.teamModule = module;
    return filter;
  }

  filter.createdBy = user._id;
  if (module) filter.teamModule = module;
  return filter;
}

/** Only approved records are "published" to real docs / public views */
export function applyPublishedScope(filter) {
  filter.approvalStatus = "approved";
  return filter;
}

export function canReadSubmission(user, doc, module) {
  if (isBogUser(user) || isChapterLeadership(user)) return true;
  if (isCabinetForModule(user, module) && String(doc.cabinetMember) === String(user._id)) {
    return true;
  }
  return String(doc.createdBy?._id || doc.createdBy) === String(user._id);
}

export function canEditSubmission(user, doc, module) {
  if (isBogUser(user) || isChapterLeadership(user)) return true;
  if (isCabinetForModule(user, module) && String(doc.cabinetMember) === String(user._id)) {
    return true;
  }
  if (String(doc.createdBy?._id || doc.createdBy) !== String(user._id)) return false;
  return doc.approvalStatus !== "approved";
}

export function canReviewSubmission(user, doc, module) {
  return (
    isCabinetForModule(user, module) &&
    String(doc.cabinetMember) === String(user._id) &&
    doc.approvalStatus === "pending"
  );
}

export function belongsToTeamModule(user, module) {
  if (isCabinetForModule(user, module)) return true;
  return teamModuleOf(user) === module;
}
