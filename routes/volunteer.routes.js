import { Router } from "express";
import { protect, requireFullAccessOr } from "../middleware/auth.js";
import { submitApplication, getApplications, updateApplication } from "../controllers/volunteer.controller.js";
import rateLimit from "express-rate-limit";

const appLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, message: "Too many applications. Try again later." },
});

const router = Router();

router.post("/apply", appLimit, submitApplication);

router.use(protect);
router.get("/", requireFullAccessOr("president", "hr_head"), getApplications);
router.patch("/:id", requireFullAccessOr("president", "hr_head"), updateApplication);

export default router;
