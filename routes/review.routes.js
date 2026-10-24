import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect, requireFullAccessOr } from "../middleware/auth.js";
import {
  submitReview,
  listApprovedReviews,
  listReviews,
  updateReviewStatus,
  deleteReview,
} from "../controllers/review.controller.js";

const reviewLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: { success: false, message: "Too many review submissions. Try again later." },
});

const router = Router();

router.get("/public", listApprovedReviews);
router.post("/", reviewLimit, submitReview);

router.use(protect);
router.get("/", requireFullAccessOr("bog_media"), listReviews);
router.patch("/:id", requireFullAccessOr("bog_media"), updateReviewStatus);
router.delete("/:id", requireFullAccessOr("bog_media"), deleteReview);

export default router;
