import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
  getPublicWebsite,
  listWebsitePages,
  getWebsitePage,
  upsertWebsitePage,
  seedWebsiteDefaults,
  resetWebsitePage,
  uploadWebsiteImage,
} from "../controllers/website.controller.js";

const router = Router();

/** Public read (main website) */
router.get("/public", getPublicWebsite);

/** Admin (CEO / Founder / CTO / COO + bog_media) */
router.use(protect);
router.get("/", listWebsitePages);
router.post("/seed", seedWebsiteDefaults);
router.post("/upload-image", upload.single("file"), uploadWebsiteImage);
router.get("/:page", getWebsitePage);
router.put("/:page", upsertWebsitePage);
router.post("/:page/reset", resetWebsitePage);

export default router;
