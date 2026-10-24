import { Router } from "express";
import {
  protect,
  requireSystemOrChapter,
  requireFullAccessOr,
} from "../middleware/auth.js";
import { FULL_ACCESS_ROLES } from "../models/User.js";
import { getMembers, getMember, createMember, updateMember, deleteMember } from "../controllers/member.controller.js";

const router = Router();

const HR_SYSTEM = [...FULL_ACCESS_ROLES, "president"];
const HR_CHAPTER = ["hr_head", "president", "vice_president", "director"];

router.use(protect);
router.get("/", getMembers);
router.get("/:id", getMember);
router.post("/", requireSystemOrChapter({ system: HR_SYSTEM, chapter: HR_CHAPTER }), createMember);
router.patch("/:id", requireSystemOrChapter({ system: HR_SYSTEM, chapter: HR_CHAPTER }), updateMember);
router.delete("/:id", requireFullAccessOr("president"), deleteMember);

export default router;
