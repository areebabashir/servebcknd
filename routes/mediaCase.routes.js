import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  listMediaCases,
  getMediaCase,
  createMediaCase,
  updateMediaCase,
  deleteMediaCase,
} from "../controllers/mediaCase.controller.js";

const router = Router();

router.use(protect);
router.get("/", listMediaCases);
router.get("/:id", getMediaCase);
router.post("/", createMediaCase);
router.patch("/:id", updateMediaCase);
router.delete("/:id", deleteMediaCase);

export default router;
