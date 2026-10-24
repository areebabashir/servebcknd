import { Router } from "express";
import { protect, requireFullAccessOr } from "../middleware/auth.js";
import { getEvents, getEvent, createEvent, updateEvent, deleteEvent } from "../controllers/event.controller.js";

const router = Router();

router.get("/", getEvents);
router.get("/:id", getEvent);
router.post("/", protect, requireFullAccessOr("president", "event_head"), createEvent);
router.patch("/:id", protect, requireFullAccessOr("president", "event_head"), updateEvent);
router.delete("/:id", protect, requireFullAccessOr("president"), deleteEvent);

export default router;
