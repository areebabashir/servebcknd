import Expense from "../models/Expense.js";
import Chapter from "../models/Chapter.js";

export async function getExpenses(req, res, next) {
  try {
    const { chapter, status, category, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (chapter) filter.chapter = chapter;
    if (status) filter.status = status;
    if (category) filter.category = category;

    const skip = (Number(page) - 1) * Number(limit);
    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .skip(skip).limit(Number(limit))
        .populate("chapter", "name city")
        .populate("submittedBy", "name")
        .populate("approvedBy", "name")
        .sort({ createdAt: -1 }),
      Expense.countDocuments(filter),
    ]);
    res.json({ success: true, total, data: expenses });
  } catch (err) {
    next(err);
  }
}

export async function createExpense(req, res, next) {
  try {
    const expense = await Expense.create({ ...req.body, submittedBy: req.user._id });

    // If above threshold, auto-route to CEO
    const chapter = await Chapter.findById(expense.chapter);
    if (chapter && expense.amount >= chapter.budgetThreshold) {
      expense.status = "sent_to_ceo";
      await expense.save();
    }

    req.app.get("io")?.emit("expense:created", { expenseId: expense.expenseId, amount: expense.amount });
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    next(err);
  }
}

export async function updateExpenseStatus(req, res, next) {
  try {
    const { status } = req.body;
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: "Expense not found." });

    expense.status = status;
    if (status === "approved") {
      expense.approvedBy = req.user._id;
      expense.approvedAt = new Date();
      // Update chapter spent
      await Chapter.findByIdAndUpdate(expense.chapter, { $inc: { monthlySpent: expense.amount } });
    }

    await expense.save();
    req.app.get("io")?.emit("expense:updated", { expenseId: expense.expenseId, status });
    res.json({ success: true, data: expense });
  } catch (err) {
    next(err);
  }
}

export async function deleteExpense(req, res, next) {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Expense deleted." });
  } catch (err) {
    next(err);
  }
}
