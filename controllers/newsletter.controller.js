import NewsletterSubscriber from "../models/NewsletterSubscriber.js";
import { sendEmail } from "../utils/email.js";
import { sendDueDonationReminders } from "../jobs/donationReminders.js";
import {
  buildNewsletterWelcomeEmail,
  buildComposedNewsletterEmail,
  NEWSLETTER_THEMES,
} from "../utils/emailTemplates.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function donatePageUrl() {
  const base = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/donate`;
}

/** POST /newsletter/subscribe — public */
export async function subscribe(req, res, next) {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: "A valid email is required." });
    }

    const existing = await NewsletterSubscriber.findOne({ email });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        existing.unsubscribedAt = null;
        await existing.save();
      }
      return res.json({
        success: true,
        message: "You’re already on the list. Thank you!",
      });
    }

    await NewsletterSubscriber.create({
      email,
      source: String(req.body?.source || "footer").slice(0, 40),
      isActive: true,
    });

    const welcome = buildNewsletterWelcomeEmail({ donateUrl: donatePageUrl() });
    await sendEmail({
      to: email,
      subject: welcome.subject,
      html: welcome.html,
      text: welcome.text,
      attachments: welcome.attachments,
    }).catch((e) => console.warn("Newsletter welcome email failed:", e.message));

    res.status(201).json({
      success: true,
      message: "Subscribed. Check your inbox for a welcome note.",
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.json({
        success: true,
        message: "You’re already on the list. Thank you!",
      });
    }
    next(err);
  }
}

/** GET /newsletter — CEO list */
export async function listSubscribers(req, res, next) {
  try {
    const { status = "active", page = 1, limit = 100 } = req.query;
    const filter = {};
    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      NewsletterSubscriber.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NewsletterSubscriber.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: Number(page), data });
  } catch (err) {
    next(err);
  }
}

/** PATCH /newsletter/:id/unsubscribe */
export async function unsubscribe(req, res, next) {
  try {
    const doc = await NewsletterSubscriber.findByIdAndUpdate(
      req.params.id,
      { isActive: false, unsubscribedAt: new Date() },
      { new: true },
    );
    if (!doc) {
      return res.status(404).json({ success: false, message: "Subscriber not found." });
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

/** DELETE /newsletter/:id */
export async function deleteSubscriber(req, res, next) {
  try {
    const doc = await NewsletterSubscriber.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Subscriber not found." });
    }
    res.json({ success: true, message: "Subscriber removed." });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /newsletter/send-donation-reminders
 * CEO: send donation reminder emails now (force defaults to true).
 */
export async function sendDonationRemindersNow(req, res, next) {
  try {
    const force = req.body?.force !== false;
    const result = await sendDueDonationReminders({ force });
    res.json({
      success: true,
      message: `Sent ${result.sent} donation reminder(s).`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /newsletter/themes — available compose icons/themes */
export async function listNewsletterThemes(_req, res) {
  const data = Object.entries(NEWSLETTER_THEMES).map(([id, t]) => ({
    id,
    label: t.label,
    icon: t.icon,
    eyebrow: t.eyebrow,
  }));
  res.json({ success: true, data });
}

/**
 * POST /newsletter/compose-send
 * Compose a custom newsletter email and send to all active subscribers.
 */
export async function composeAndSendNewsletter(req, res, next) {
  try {
    const {
      theme = "heart",
      eyebrow,
      title,
      body,
      subject,
      ctaLabel,
      ctaUrl,
    } = req.body || {};

    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Title and message body are required.",
      });
    }
    if (!NEWSLETTER_THEMES[theme]) {
      return res.status(400).json({
        success: false,
        message: "Invalid theme. Pick a valid icon theme.",
      });
    }

    const subscribers = await NewsletterSubscriber.find({ isActive: true })
      .select("_id email")
      .limit(1000)
      .lean();

    if (!subscribers.length) {
      return res.status(400).json({
        success: false,
        message: "No active subscribers to email.",
      });
    }

    const mail = buildComposedNewsletterEmail({
      theme,
      eyebrow,
      title: String(title).trim(),
      body: String(body).trim(),
      subject: subject ? String(subject).trim() : undefined,
      ctaLabel: ctaLabel ? String(ctaLabel).trim() : "",
      ctaUrl: ctaUrl ? String(ctaUrl).trim() : "",
    });

    let sent = 0;
    let failed = 0;
    for (const sub of subscribers) {
      try {
        const result = await sendEmail({
          to: sub.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          attachments: mail.attachments,
        });
        if (result) sent += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        console.warn(`Compose newsletter failed for ${sub.email}:`, err?.message || err);
      }
    }

    res.json({
      success: true,
      message: `Sent to ${sent} subscriber(s).`,
      data: {
        theme: mail.theme,
        subject: mail.subject,
        candidateCount: subscribers.length,
        sent,
        failed,
      },
    });
  } catch (err) {
    next(err);
  }
}
