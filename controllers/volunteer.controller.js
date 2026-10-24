import VolunteerApplication from "../models/VolunteerApplication.js";
import { sendEmail } from "../utils/email.js";

export async function submitApplication(req, res, next) {
  try {
    const { fullName, email, phone, city, program, motivation } = req.body;
    if (!fullName || !email || !phone || !city || !program) {
      return res.status(400).json({ success: false, message: "All required fields must be filled." });
    }

    const app = await VolunteerApplication.create({ fullName, email, phone, city, program, motivation });

    await sendEmail({
      to: email,
      subject: "Application received — Serve Humanity",
      html: `<p>Dear ${fullName},</p>
             <p>Thank you for applying to volunteer with Serve Humanity! We have received your application for 
             <strong>${program}</strong> and will get back to you within 48 hours.</p>
             <p>— Serve Humanity Team</p>`,
    }).catch((e) => console.warn("Email failed:", e.message));

    res.status(201).json({ success: true, message: "Application submitted. We will reach out within 48 hours." });
  } catch (err) {
    next(err);
  }
}

export async function getApplications(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const skip = (Number(page) - 1) * Number(limit);
    const [apps, total] = await Promise.all([
      VolunteerApplication.find(filter)
        .skip(skip).limit(Number(limit))
        .populate("chapterAssigned", "name city")
        .sort({ createdAt: -1 }),
      VolunteerApplication.countDocuments(filter),
    ]);
    res.json({ success: true, total, data: apps });
  } catch (err) {
    next(err);
  }
}

export async function updateApplication(req, res, next) {
  try {
    const { status, chapterAssigned } = req.body;
    const app = await VolunteerApplication.findById(req.params.id);
    if (!app) return res.status(404).json({ success: false, message: "Application not found." });

    app.status = status;
    app.reviewedBy = req.user._id;
    app.reviewedAt = new Date();
    if (chapterAssigned) app.chapterAssigned = chapterAssigned;

    await app.save();

    const statusMsg = status === "approved"
      ? "Congratulations! Your volunteer application has been approved."
      : "Thank you for your interest. Unfortunately we cannot proceed with your application at this time.";

    await sendEmail({
      to: app.email,
      subject: `Volunteer Application Update — Serve Humanity`,
      html: `<p>Dear ${app.fullName},</p><p>${statusMsg}</p><p>— Serve Humanity Team</p>`,
    }).catch((e) => console.warn("Email failed:", e.message));

    res.json({ success: true, data: app });
  } catch (err) {
    next(err);
  }
}
