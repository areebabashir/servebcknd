import { Router } from "express";
import { protect, requireFullAccess } from "../middleware/auth.js";
import {
  createNotification,
  listSentNotifications,
  getInbox,
  markRead,
  getUnreadCount,
  dismissFromInbox,
  deleteSentNotification,
  clearSentHistory,
  sendWarningMail,
  listWarningMails,
} from "../controllers/notification.controller.js";

const router = Router();

router.use(protect);

// Any authenticated recipient (CEO board + chapter users) can manage their own inbox.
router.get("/inbox", getInbox);
router.get("/unread-count", getUnreadCount);
router.patch("/:id/read", markRead);
router.delete("/:id/inbox", dismissFromInbox);

router.post("/warning", requireFullAccess, sendWarningMail);
router.get("/warning", requireFullAccess, listWarningMails);

router.post("/", requireFullAccess, createNotification);
router.get("/", requireFullAccess, listSentNotifications);
router.delete("/", requireFullAccess, clearSentHistory);
router.delete("/:id", requireFullAccess, deleteSentNotification);

export default router;
