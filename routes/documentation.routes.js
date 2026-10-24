import { Router } from "express";
import { protect, requireSystemOrChapter } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
  listDocs,
  getDoc,
  createDoc,
  updateDoc,
  deleteDoc,
  reviewDoc,
  uploadDocAttachment,
  uploadDocPdf,
  getDocStats,
} from "../controllers/documentation.controller.js";

const router = Router();

const DOC_SYSTEM = ["ceo", "bog_documentation", "president"];
const DOC_CHAPTER = [
  "documentation_head",
  "president",
  "vice_president",
  "director",
  "assistant_director",
  "member",
];

const canView = requireSystemOrChapter({ system: DOC_SYSTEM, chapter: DOC_CHAPTER });
const canEdit = requireSystemOrChapter({ system: DOC_SYSTEM, chapter: DOC_CHAPTER });

router.use(protect);
router.get("/stats", canView, getDocStats);
router.get("/", canView, listDocs);
router.post("/upload", canEdit, upload.single("file"), uploadDocAttachment);
router.post("/upload-pdf", canEdit, upload.single("file"), uploadDocPdf);
router.get("/:id", canView, getDoc);
router.post("/", canEdit, createDoc);
router.patch("/:id", canEdit, updateDoc);
router.patch("/:id/review", canEdit, reviewDoc);
router.delete("/:id", canEdit, deleteDoc);

export default router;
