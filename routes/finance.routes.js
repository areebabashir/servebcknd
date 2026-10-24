import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
  listFinance,
  getFinance,
  createFinance,
  updateFinance,
  deleteFinance,
  reviewFinance,
  uploadFinanceAttachment,
  uploadFinanceExport,
  getFinanceStats,
} from "../controllers/finance.controller.js";

const router = Router();

router.use(protect);
router.get("/stats", getFinanceStats);
router.get("/", listFinance);
router.post("/upload", upload.single("file"), uploadFinanceAttachment);
router.post("/upload-export", upload.single("file"), uploadFinanceExport);
router.get("/:id", getFinance);
router.post("/", createFinance);
router.patch("/:id", updateFinance);
router.patch("/:id/review", reviewFinance);
router.delete("/:id", deleteFinance);

export default router;
