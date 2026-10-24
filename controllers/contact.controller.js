import ContactMessage from "../models/ContactMessage.js";
import { sendEmail } from "../utils/email.js";

export async function submitContact(req, res, next) {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const msg = await ContactMessage.create({ name, email, subject, message });

    // Auto-reply to sender
    await sendEmail({
      to: email,
      subject: "We received your message — Serve Humanity",
      html: `<p>Dear ${name},</p>
             <p>Thank you for reaching out. We have received your message and will reply within one business day.</p>
             <p>— Serve Humanity Team</p>`,
    }).catch((e) => console.warn("Auto-reply failed:", e.message));

    res.status(201).json({ success: true, message: "Message received. We will get back to you soon." });
  } catch (err) {
    next(err);
  }
}

export async function getMessages(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const skip = (Number(page) - 1) * Number(limit);
    const [messages, total] = await Promise.all([
      ContactMessage.find(filter).skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
      ContactMessage.countDocuments(filter),
    ]);
    res.json({ success: true, total, data: messages });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const msg = await ContactMessage.findByIdAndUpdate(req.params.id, { status: "read" }, { new: true });
    if (!msg) return res.status(404).json({ success: false, message: "Message not found." });
    res.json({ success: true, data: msg });
  } catch (err) {
    next(err);
  }
}
