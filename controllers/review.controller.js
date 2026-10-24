import Review from "../models/Review.js";

/** POST /reviews — public submit */
export async function submitReview(req, res, next) {
  try {
    const name = String(req.body?.name || "").trim();
    const role = String(req.body?.role || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const text = String(req.body?.text || "").trim();
    let stars = Number(req.body?.stars);
    if (!Number.isFinite(stars)) stars = 5;
    stars = Math.min(5, Math.max(1, Math.round(stars)));

    if (!name || !text) {
      return res.status(400).json({ success: false, message: "Name and review text are required." });
    }
    if (text.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Please write a bit more detail (at least 10 characters).",
      });
    }

    await Review.create({
      name,
      role,
      email,
      text,
      stars,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Thank you! Your review was submitted and will appear after approval.",
    });
  } catch (err) {
    next(err);
  }
}

/** GET /reviews/public — approved only */
export async function listApprovedReviews(req, res, next) {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const data = await Review.find({ status: "approved" })
      .select("name role text stars createdAt")
      .sort({ reviewedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /reviews — CEO list */
export async function listReviews(req, res, next) {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status && ["pending", "approved", "rejected"].includes(String(status))) {
      filter.status = status;
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Review.countDocuments(filter),
    ]);
    res.json({ success: true, total, data });
  } catch (err) {
    next(err);
  }
}

/** PATCH /reviews/:id — { status: approved|rejected } */
export async function updateReviewStatus(req, res, next) {
  try {
    const status = String(req.body?.status || "").toLowerCase();
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be approved, rejected, or pending.",
      });
    }
    const doc = await Review.findByIdAndUpdate(
      req.params.id,
      {
        status,
        reviewedAt: status === "pending" ? null : new Date(),
        reviewedBy: status === "pending" ? null : req.user._id,
      },
      { new: true },
    );
    if (!doc) return res.status(404).json({ success: false, message: "Review not found." });
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

/** DELETE /reviews/:id */
export async function deleteReview(req, res, next) {
  try {
    const doc = await Review.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Review not found." });
    res.json({ success: true, message: "Review deleted." });
  } catch (err) {
    next(err);
  }
}
