import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  createMyThread,
  listMyThreads,
  getMyThread,
  replyToThread,
  listInbox,
  startInboxThread,
  updateThreadStatus,
} from "../controllers/itSupport.controller.js";

const router = Router();

router.use(protect);

router.get("/threads", listMyThreads);
router.post("/threads", createMyThread);
router.get("/threads/:id", getMyThread);
router.post("/threads/:id/replies", replyToThread);
router.patch("/threads/:id/status", updateThreadStatus);

router.get("/inbox", listInbox);
router.post("/inbox/start", startInboxThread);

export default router;
