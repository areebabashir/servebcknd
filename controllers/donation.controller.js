import Donation from "../models/Donation.js";
import Chapter from "../models/Chapter.js";
import { sendEmail } from "../utils/email.js";

export async function getDonations(req, res, next) {
  try {
    const { chapter, campaign, cause, method, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (chapter) filter.chapter = chapter;
    if (campaign) filter.campaign = campaign;
    if (cause) filter.cause = cause;
    if (method) filter.method = method;

    const skip = (Number(page) - 1) * Number(limit);
    const [donations, total] = await Promise.all([
      Donation.find(filter).skip(skip).limit(Number(limit)).populate("chapter", "name").sort({ createdAt: -1 }),
      Donation.countDocuments(filter),
    ]);
    res.json({ success: true, total, data: donations });
  } catch (err) {
    next(err);
  }
}

export async function getDonationStats(req, res, next) {
  try {
    const { chapter } = req.query;
    const match = chapter ? { chapter: new (await import("mongoose")).default.Types.ObjectId(chapter) } : {};

    const [totals, byMonth, byCause] = await Promise.all([
      Donation.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      Donation.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $month: "$createdAt" },
            donations: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Donation.aggregate([
        { $match: match },
        { $group: { _id: "$cause", total: { $sum: "$amount" } } },
        { $sort: { total: -1 } },
      ]),
    ]);

    res.json({ success: true, data: { totals: totals[0] ?? {}, byMonth, byCause } });
  } catch (err) {
    next(err);
  }
}

export async function createDonation(req, res, next) {
  try {
    const loggedBy = req.user?._id ?? null;
    const donation = await Donation.create({ ...req.body, loggedBy });

    // Update chapter fundsRaised
    if (donation.chapter) {
      await Chapter.findByIdAndUpdate(donation.chapter, { $inc: { fundsRaised: donation.amount } });
    }

    // Send receipt email if donor email provided
    if (donation.donorEmail) {
      await sendEmail({
        to: donation.donorEmail,
        subject: "Thank you for your donation — Serve Humanity",
        html: `<p>Dear ${donation.donor},</p>
               <p>We received your donation of <strong>PKR ${donation.amount.toLocaleString()}</strong>
               for <strong>${donation.cause}</strong> on ${new Date().toLocaleDateString()}.</p>
               <p>Donation ID: <strong>${donation.donationId}</strong></p>
               <p>May Allah bless you. — Serve Humanity Team</p>`,
      }).catch((e) => console.warn("Email failed:", e.message));
    }

    req.app.get("io")?.emit("donation:new", { amount: donation.amount, cause: donation.cause });
    res.status(201).json({ success: true, data: donation });
  } catch (err) {
    next(err);
  }
}

export async function updateDonation(req, res, next) {
  try {
    const donation = await Donation.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!donation) return res.status(404).json({ success: false, message: "Donation not found." });
    res.json({ success: true, data: donation });
  } catch (err) {
    next(err);
  }
}

export async function deleteDonation(req, res, next) {
  try {
    await Donation.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Donation deleted." });
  } catch (err) {
    next(err);
  }
}
