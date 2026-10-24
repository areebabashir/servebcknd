import { Router } from "express";
import { protect, requireSystemOrChapter } from "../middleware/auth.js";
import {
  listItAccounts,
  createItAccount,
  resetItPassword,
  updateItAccount,
  listItChapters,
} from "../controllers/it.controller.js";

const router = Router();

/** IT Management lives only on the CEO dashboard (org IT Manager). */
const canIt = requireSystemOrChapter({
  system: ["bog_it"],
  chapter: [],
});

router.use(protect);
router.use(canIt);

router.get("/accounts", listItAccounts);
router.post("/accounts", createItAccount);
router.patch("/accounts/:id/reset-password", resetItPassword);
router.patch("/accounts/:id", updateItAccount);
router.get("/chapters", listItChapters);

export default router;
