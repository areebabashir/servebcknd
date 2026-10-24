import { Router } from "express";
import { protect, requireSystemOrChapter } from "../middleware/auth.js";
import { getMedia, uploadMedia, updateMediaStatus, deleteMedia } from "../controllers/media.controller.js";
import { upload } from "../middleware/upload.js";

const router = Router();

const MEDIA_SYSTEM = ["ceo", "bog_media", "president"];
const MEDIA_CHAPTER = ["media_head", "president", "vice_president", "director"];
const canManage = requireSystemOrChapter({ system: MEDIA_SYSTEM, chapter: MEDIA_CHAPTER });

router.get("/", protect, getMedia);
router.post("/upload", protect, canManage, upload.single("file"), uploadMedia);
router.patch("/:id/status", protect, canManage, updateMediaStatus);
router.delete("/:id", protect, canManage, deleteMedia);

export default router;
