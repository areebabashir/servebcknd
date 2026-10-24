import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
  listMediaTemplates,
  uploadMediaTemplate,
  updateMediaTemplate,
  deleteMediaTemplate,
} from "../controllers/mediaTemplate.controller.js";

const router = Router();

router.use(protect);
router.get("/", listMediaTemplates);
router.post("/upload", upload.single("file"), uploadMediaTemplate);
router.patch("/:id", updateMediaTemplate);
router.delete("/:id", deleteMediaTemplate);

export default router;
