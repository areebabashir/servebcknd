import { Router } from "express";
import {
  protect,
  requireFullAccess,
  requireFullAccessOr,
  requireCeoDashboard,
  requireSystemOrChapter,
} from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
  getAllChapters,
  getPublicChapters,
  getChapter,
  getChapterHeads,
  getChapterDetails,
  createChapter,
  assignChapterPresident,
  updateChapter,
  updateChapterDonationAccounts,
  updateChapterImage,
  deleteChapter,
  getChapterStats,
} from "../controllers/chapter.controller.js";

const router = Router();

router.get("/public", getPublicChapters);
router.get("/", getAllChapters);
router.get("/:id/heads", getChapterHeads);
router.get("/:id/details", protect, requireCeoDashboard, getChapterDetails);
router.get("/:id/stats", protect, getChapterStats);
router.get("/:id", getChapter);
router.post("/", protect, requireFullAccess, upload.single("image"), createChapter);
router.patch("/:id/president", protect, requireFullAccess, assignChapterPresident);
router.patch("/:id/image", protect, requireFullAccess, upload.single("image"), updateChapterImage);
router.patch(
  "/:id/donation-accounts",
  protect,
  requireSystemOrChapter({
    system: ["president"],
    chapter: ["president"],
  }),
  updateChapterDonationAccounts,
);
router.patch("/:id", protect, requireFullAccessOr("president"), updateChapter);
router.delete("/:id", protect, requireFullAccess, deleteChapter);

export default router;
