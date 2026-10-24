import { Router } from "express";
import { protect, requireFullAccessOr } from "../middleware/auth.js";
import {
  getCases,
  getCase,
  createCase,
  updateCaseStatus,
  addCaseNote,
  deleteCase,
} from "../controllers/welfareCase.controller.js";

const router = Router();

router.use(protect);
router.get("/", getCases);
router.get("/:id", getCase);
router.post("/", createCase);
router.patch("/:id/status", requireFullAccessOr("president", "verification_head"), updateCaseStatus);
router.post("/:id/notes", addCaseNote);
router.delete("/:id", requireFullAccessOr("president"), deleteCase);

export default router;
