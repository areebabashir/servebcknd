/**
 * Chapter hierarchy:
 * President / VPs (female + male)
 *   └── Cabinet (finance, ops, verification, documentation, media)
 *         └── Directors (team collection)
 *               └── Members
 */
export const CABINET_ROLES = [
  "operations_head",
  "verification_head",
  "media_head",
  "finance_head",
  "documentation_head",
];

/** @deprecated alias — cabinet seats (legacy name "team heads") */
export const TEAM_HEAD_ROLES = CABINET_ROLES;

export const VP_ROLES = ["vice_president", "vice_president_male"];

export function isCabinetRole(role) {
  return CABINET_ROLES.includes(role);
}

/** @deprecated use isCabinetRole */
export function isTeamHeadRole(role) {
  return isCabinetRole(role);
}

export function isVicePresidentRole(role) {
  return VP_ROLES.includes(role);
}

/** Directors under a cabinet member — own a team collection */
export function isTeamDirectorRole(role) {
  return role === "director";
}

/** Valid donation rollup targets: directors (preferred) or legacy cabinet assignments */
export function isValidTeamLeadRole(role) {
  return isTeamDirectorRole(role) || isCabinetRole(role);
}

/** Leadership with personal donations only (no director team). */
export function isOwnCollectionRole(role) {
  return role === "president" || isVicePresidentRole(role);
}

/** Roles president / VP may create / assign as seats (includes chapter IT Manager) */
export const CABINET_ASSIGNABLE_ROLES = [...VP_ROLES, ...CABINET_ROLES];
