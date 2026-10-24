import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  listTeamRecords,
  createTeamRecord,
  updateTeamRecord,
  deleteTeamRecord,
  reviewTeamRecord,
} from "../controllers/teamRecord.controller.js";

const router = Router();

router.use(protect);
router.get("/", listTeamRecords);
router.post("/", createTeamRecord);
router.patch("/:id", updateTeamRecord);
router.patch("/:id/review", reviewTeamRecord);
router.delete("/:id", deleteTeamRecord);

export default router;
