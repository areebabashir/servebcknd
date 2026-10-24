import { Router } from "express";
import {
  protect,
  requireFullAccess,
  requireSystemOrChapter,
  requireCeoDashboard,
} from "../middleware/auth.js";
import {
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
  getBoardMembers,
  createBogAccount,
  createChapterDirector,
  createTeamDirector,
  createTeamMember,
  listChapterMembersForCeo,
  getChapterMemberDetailForCeo,
  listJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
} from "../controllers/user.controller.js";
import { FULL_ACCESS_ROLES } from "../models/User.js";

const router = Router();

router.use(protect);

router.get("/board", requireCeoDashboard, getBoardMembers);
router.post("/board", requireFullAccess, createBogAccount);

router.get("/chapter-members", requireCeoDashboard, listChapterMembersForCeo);

router.get(
  "/join-requests",
  requireSystemOrChapter({
    system: ["president"],
    chapter: [
      "president",
      "vice_president",
      "vice_president_male",
      "finance_head",
      "operations_head",
      "verification_head",
      "documentation_head",
      "media_head",
    ],
  }),
  listJoinRequests,
);
router.patch(
  "/:id/join-approve",
  requireSystemOrChapter({
    system: ["president"],
    chapter: [
      "president",
      "vice_president",
      "vice_president_male",
      "finance_head",
      "operations_head",
      "verification_head",
      "documentation_head",
      "media_head",
    ],
  }),
  approveJoinRequest,
);
router.patch(
  "/:id/join-reject",
  requireSystemOrChapter({
    system: ["president"],
    chapter: [
      "president",
      "vice_president",
      "vice_president_male",
      "finance_head",
      "operations_head",
      "verification_head",
      "documentation_head",
      "media_head",
    ],
  }),
  rejectJoinRequest,
);

router.get("/:id/chapter-detail", requireCeoDashboard, getChapterMemberDetailForCeo);

router.post(
  "/chapter-directors",
  requireSystemOrChapter({
    system: ["president"],
    chapter: ["president", "vice_president", "vice_president_male"],
  }),
  createChapterDirector,
);

router.post(
  "/team-directors",
  requireSystemOrChapter({
    chapter: [
      "finance_head",
      "operations_head",
      "verification_head",
      "documentation_head",
      "media_head",
    ],
  }),
  createTeamDirector,
);

router.post(
  "/team-members",
  requireSystemOrChapter({
    chapter: [
      "finance_head",
      "operations_head",
      "verification_head",
      "documentation_head",
      "media_head",
    ],
  }),
  createTeamMember,
);

router.get(
  "/",
  requireSystemOrChapter({
    system: [...FULL_ACCESS_ROLES, "president"],
    chapter: [
      "president",
      "vice_president",
      "vice_president_male",
      "finance_head",
      "operations_head",
      "verification_head",
      "documentation_head",
      "media_head",
    ],
  }),
  getAllUsers,
);
router.get("/:id", getUser);
router.patch("/:id", updateUser);
router.delete(
  "/:id",
  requireSystemOrChapter({
    system: [...FULL_ACCESS_ROLES, "president"],
    chapter: ["president"],
  }),
  deleteUser,
);

export default router;
