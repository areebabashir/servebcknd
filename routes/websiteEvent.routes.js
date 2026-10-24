import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect, requireFullAccessOr } from "../middleware/auth.js";
import {
  listPublicEvents,
  registerForEvent,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  listRegistrations,
  listChapterEvents,
  createChapterEvent,
  updateChapterEvent,
  deleteChapterEvent,
  listChapterRegistrations,
} from "../controllers/websiteEvent.controller.js";

const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many registrations. Try again later." },
});

const router = Router();

router.get("/public", listPublicEvents);
router.post("/:id/register", registerLimit, registerForEvent);

router.use(protect);

/** Chapter president / VP — manage own chapter’s public website events */
router.get("/chapter/mine", listChapterEvents);
router.post("/chapter", createChapterEvent);
router.patch("/chapter/:id", updateChapterEvent);
router.delete("/chapter/:id", deleteChapterEvent);
router.get("/chapter/:id/registrations", listChapterRegistrations);

/** CEO / bog_media — org-wide list + manage all */
router.get("/", requireFullAccessOr("bog_media"), listEvents);
router.post("/", requireFullAccessOr("bog_media"), createEvent);
router.patch("/:id", requireFullAccessOr("bog_media"), updateEvent);
router.delete("/:id", requireFullAccessOr("bog_media"), deleteEvent);
router.get("/:id/registrations", requireFullAccessOr("bog_media"), listRegistrations);

export default router;
