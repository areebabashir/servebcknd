import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
  createChapterDonation,
  createBogDonation,
  listChapterDonations,
  listBogDonations,
  myTeamCollection,
  directorTeamTotals,
  verifyChapterDonation,
  deleteChapterDonation,
} from "../controllers/chapterDonation.controller.js";

const router = Router();

router.use(protect);
router.get("/director-totals", directorTeamTotals);
router.get("/my-team", myTeamCollection);
router.get("/bog", listBogDonations);
router.post("/bog", upload.single("screenshot"), createBogDonation);
router.get("/", listChapterDonations);
router.post("/", upload.single("screenshot"), createChapterDonation);
router.patch("/:id/verify", verifyChapterDonation);
router.delete("/:id", deleteChapterDonation);

export default router;
