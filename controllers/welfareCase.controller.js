import WelfareCase from "../models/WelfareCase.js";
import Chapter from "../models/Chapter.js";

export async function getCases(req, res, next) {
  try {
    const { chapter, status, category, urgency, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (chapter) filter.chapter = chapter;
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (urgency) filter.urgency = urgency;

    const skip = (Number(page) - 1) * Number(limit);
    const [cases, total] = await Promise.all([
      WelfareCase.find(filter)
        .skip(skip).limit(Number(limit))
        .populate("chapter", "name city")
        .populate("submittedBy", "name")
        .populate("reviewedBy", "name")
        .populate("approvedBy", "name")
        .sort({ createdAt: -1 }),
      WelfareCase.countDocuments(filter),
    ]);
    res.json({ success: true, total, page: Number(page), data: cases });
  } catch (err) {
    next(err);
  }
}

export async function getCase(req, res, next) {
  try {
    const wc = await WelfareCase.findById(req.params.id)
      .populate("chapter", "name city")
      .populate("submittedBy", "name email")
      .populate("reviewedBy", "name")
      .populate("approvedBy", "name");
    if (!wc) return res.status(404).json({ success: false, message: "Case not found." });
    res.json({ success: true, data: wc });
  } catch (err) {
    next(err);
  }
}

export async function createCase(req, res, next) {
  try {
    const wc = await WelfareCase.create({ ...req.body, submittedBy: req.user._id });

    req.app.get("io")?.emit("case:created", { caseId: wc.caseId, category: wc.category, urgency: wc.urgency });
    res.status(201).json({ success: true, data: wc });
  } catch (err) {
    next(err);
  }
}

export async function updateCaseStatus(req, res, next) {
  try {
    const { status, note } = req.body;
    const wc = await WelfareCase.findById(req.params.id);
    if (!wc) return res.status(404).json({ success: false, message: "Case not found." });

    wc.status = status;

    if (status === "approved") wc.approvedBy = req.user._id;
    if (status === "under_review") wc.reviewedBy = req.user._id;
    if (status === "disbursed") wc.disbursedAt = new Date();

    if (note) {
      wc.notes.push({ author: req.user.name, text: note });
    }

    // Large amounts auto-route to CEO
    const chapter = await Chapter.findById(wc.chapter);
    if (status === "approved" && chapter && wc.amount >= chapter.budgetThreshold) {
      wc.status = "sent_to_ceo";
    }

    await wc.save();

    req.app.get("io")?.emit("case:updated", { caseId: wc.caseId, status: wc.status });
    res.json({ success: true, data: wc });
  } catch (err) {
    next(err);
  }
}

export async function addCaseNote(req, res, next) {
  try {
    const { text } = req.body;
    const wc = await WelfareCase.findById(req.params.id);
    if (!wc) return res.status(404).json({ success: false, message: "Case not found." });
    wc.notes.push({ author: req.user.name, text });
    await wc.save();
    res.json({ success: true, data: wc });
  } catch (err) {
    next(err);
  }
}

export async function deleteCase(req, res, next) {
  try {
    await WelfareCase.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Case deleted." });
  } catch (err) {
    next(err);
  }
}
