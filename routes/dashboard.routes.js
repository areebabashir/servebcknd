import { Router } from "express";
import { protect, requireCeoDashboard, requireSystemOrChapter } from "../middleware/auth.js";
import {
  getOverview,
  getTrend,
  getReport,
  getMyChapterReport,
} from "../controllers/dashboard.controller.js";

const router = Router();

router.use(protect);

/** Chapter president / VP — own chapter report only */
router.get(
  "/chapter-report",
  requireSystemOrChapter({
    system: ["president"],
    chapter: ["president", "vice_president"],
  }),
  getMyChapterReport,
);

router.get("/overview", requireCeoDashboard, getOverview);
router.get("/trend", requireCeoDashboard, getTrend);
router.get("/report", requireCeoDashboard, getReport);

export default router;
