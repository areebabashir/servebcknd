import NewsletterSubscriber from "../models/NewsletterSubscriber.js";
import { sendEmail } from "../utils/email.js";
import { buildDonationReminderEmail } from "../utils/emailTemplates.js";

function reminderIntervalDays() {
  const n = Number(process.env.NEWSLETTER_DONATION_REMINDER_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.min(90, Math.floor(n)) : 14;
}

function donateUrl() {
  const base = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/donate`;
}

/**
 * Send donation reminders to active subscribers who are due
 * (first reminder after interval days from subscribe, then every interval days).
 * @param {{ force?: boolean }} opts force = ignore last-sent interval (manual CEO send)
 */
export async function sendDueDonationReminders({ force = false } = {}) {
  const intervalDays = reminderIntervalDays();
  const cutoff = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000);
  const mail = buildDonationReminderEmail({ donateUrl: donateUrl() });

  const filter = force
    ? { isActive: true }
    : {
        isActive: true,
        $or: [
          { lastDonationReminderAt: null, createdAt: { $lte: cutoff } },
          { lastDonationReminderAt: { $lte: cutoff } },
        ],
      };

  const subscribers = await NewsletterSubscriber.find(filter).select("_id email").limit(500).lean();
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
      if (result) {
        await NewsletterSubscriber.updateOne(
          { _id: sub._id },
          { $set: { lastDonationReminderAt: new Date() } },
        );
        sent += 1;
      } else {
        failed += 1;
      }
    } catch (err) {
      failed += 1;
      console.warn(`Donation reminder failed for ${sub.email}:`, err?.message || err);
    }
  }

  return {
    intervalDays,
    candidateCount: subscribers.length,
    sent,
    failed,
  };
}

/** Check about once a day while the server is running. */
export function startDonationReminderScheduler() {
  const enabled = String(process.env.NEWSLETTER_DONATION_REMINDERS || "true").toLowerCase() !== "false";
  if (!enabled) {
    console.log("Newsletter donation reminders: disabled (NEWSLETTER_DONATION_REMINDERS=false)");
    return;
  }

  const intervalMs = Number(process.env.NEWSLETTER_REMINDER_CHECK_MS) || 24 * 60 * 60 * 1000;
  console.log(
    `Newsletter donation reminders: every ${reminderIntervalDays()} days (check every ${Math.round(intervalMs / 3600000)}h)`,
  );

  // First check shortly after boot (avoid delaying startup).
  setTimeout(() => {
    void sendDueDonationReminders().then((r) => {
      if (r.sent || r.failed) {
        console.log(
          `Donation reminders: ${r.sent} sent, ${r.failed} failed (${r.candidateCount} due)`,
        );
      }
    });
  }, 60_000);

  setInterval(() => {
    void sendDueDonationReminders().then((r) => {
      if (r.sent || r.failed) {
        console.log(
          `Donation reminders: ${r.sent} sent, ${r.failed} failed (${r.candidateCount} due)`,
        );
      }
    });
  }, intervalMs);
}
