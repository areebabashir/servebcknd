import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect, requireSystemOrChapter } from "../middleware/auth.js";
import {
  submitCaseReferral,
  listCaseReferrals,
  verifyCaseReferral,
  getCaseReferralOptions,
} from "../controllers/caseReferral.controller.js";

const submitLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: { success: false, message: "Too many registrations. Try again later." },
});

const chapterAccess = requireSystemOrChapter({
  system: ["ceo", "founder", "cto", "coo", "bog_documentation", "president"],
  chapter: ["president", "vice_president", "documentation_head", "verification_head"],
});

const router = Router();

router.get("/options", getCaseReferralOptions);
router.post("/", submitLimit, submitCaseReferral);

router.get("/", protect, chapterAccess, listCaseReferrals);
router.patch("/:id/verify", protect, chapterAccess, verifyCaseReferral);

export default router;
