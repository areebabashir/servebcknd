import { Router } from "express";
import { protect, requireFullAccessOr } from "../middleware/auth.js";
import { getExpenses, createExpense, updateExpenseStatus, deleteExpense } from "../controllers/expense.controller.js";

const router = Router();

router.use(protect);
router.get("/", getExpenses);
router.post("/", requireFullAccessOr("president", "finance_head", "operations_head"), createExpense);
router.patch("/:id/status", requireFullAccessOr("president", "finance_head"), updateExpenseStatus);
router.delete("/:id", requireFullAccessOr("president"), deleteExpense);

export default router;
