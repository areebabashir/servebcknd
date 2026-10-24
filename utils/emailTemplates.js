import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BRAND = {
  orange: "#f89c1b",
  accent: "#f45d22",
  blue: "#234a8f",
  ink: "#1a1a1a",
  muted: "#6b7280",
  border: "#e5e7eb",
  soft: "#fff8f0",
};

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline logo for email clients (CID). Falls back to LOGO_URL if file missing. */
export function getEmailLogoAttachment() {
  const candidates = [
    process.env.EMAIL_LOGO_PATH,
    path.join(__dirname, "../assets/logo.png"),
    path.join(__dirname, "../../frontend/src/assets/logo.png"),
  ].filter(Boolean);

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        return {
          filename: "logo.png",
          path: filePath,
          cid: "sh-logo",
          contentType: "image/png",
        };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function logoImgHtml() {
  const remote = process.env.LOGO_URL || process.env.EMAIL_LOGO_URL;
  const src = remote || "cid:sh-logo";
  return `<img src="${src}" alt="Serve Humanity" width="64" height="64" style="display:block;width:64px;height:64px;border:0;border-radius:12px;object-fit:contain;background:#fff" />`;
}

function priorityBadge(priority) {
  if (priority === "urgent") {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:700;letter-spacing:.04em">URGENT</span>`;
  }
  if (priority === "high") {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#ffedd5;color:#c2410c;font-size:11px;font-weight:700;letter-spacing:.04em">HIGH PRIORITY</span>`;
  }
  return "";
}

/**
 * Branded HTML email for leadership notifications.
 */
export function buildNotificationEmailTemplate({ title, body, priority = "normal", recipientName }) {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(/\n/g, "<br/>");
  const safeName = recipientName ? escapeHtml(recipientName) : "";
  const greeting = safeName ? `Assalamu Alaikum, ${safeName}` : "Assalamu Alaikum";
  const badge = priorityBadge(priority);
  const year = new Date().getFullYear();

  const subjectPrefix =
    priority === "urgent" ? "[Urgent] " : priority === "high" ? "[High] " : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 8px 24px rgba(35,74,143,0.08)">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, ${BRAND.blue} 0%, #1a3568 55%, ${BRAND.accent} 100%);padding:22px 28px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="72" valign="middle">${logoImgHtml()}</td>
                  <td valign="middle" style="padding-left:14px">
                    <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.01em;line-height:1.2">Serve Humanity</div>
                    <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:4px">Hearts That Serve</div>
                  </td>
                  <td align="right" valign="middle">${badge}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Accent bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg, ${BRAND.orange}, ${BRAND.accent}, ${BRAND.blue});font-size:0;line-height:0">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 8px">
              <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted}">${greeting},</p>
              <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${BRAND.blue};font-weight:700">${safeTitle}</h1>
              <div style="background:${BRAND.soft};border-left:4px solid ${BRAND.orange};border-radius:0 12px 12px 0;padding:16px 18px">
                <p style="margin:0;font-size:15px;line-height:1.65;color:${BRAND.ink}">${safeBody}</p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px 8px">
              <p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.5">
                This message was sent by Serve Humanity leadership. Please do not reply to this automated email unless instructed.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 28px 28px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BRAND.border};padding-top:18px">
                <tr>
                  <td>
                    <div style="font-size:13px;font-weight:600;color:${BRAND.blue}">Serve Humanity</div>
                    <div style="font-size:12px;color:${BRAND.muted};margin-top:4px">Serving with compassion · Together for humanity</div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:12px">&copy; ${year} Serve Humanity. All rights reserved.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "Serve Humanity — Khidmat-e-Insaniyat Welfare Society",
    "",
    greeting + ",",
    "",
    title,
    "",
    body,
    "",
    "— Serve Humanity leadership",
  ].join("\n");

  const attachments = [];
  const logo = getEmailLogoAttachment();
  if (logo && !process.env.LOGO_URL && !process.env.EMAIL_LOGO_URL) {
    attachments.push(logo);
  }

  return {
    subject: `${subjectPrefix}${title}`,
    html,
    text,
    attachments,
  };
}

/**
 * Official warning letter email to a chapter member.
 */
export function buildWarningEmailTemplate({
  title = "Official Warning Letter",
  body,
  recipientName,
  chapterName,
  senderName,
}) {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(/\n/g, "<br/>");
  const safeName = recipientName ? escapeHtml(recipientName) : "";
  const safeChapter = chapterName ? escapeHtml(chapterName) : "";
  const safeSender = senderName ? escapeHtml(senderName) : "Serve Humanity Leadership";
  const greeting = safeName ? `Assalamu Alaikum, ${safeName}` : "Assalamu Alaikum";
  const year = new Date().getFullYear();
  const issued = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 8px 24px rgba(35,74,143,0.08)">
          <tr>
            <td style="background:linear-gradient(135deg, ${BRAND.blue} 0%, #1a3568 55%, #b91c1c 100%);padding:22px 28px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="72" valign="middle">${logoImgHtml()}</td>
                  <td valign="middle" style="padding-left:14px">
                    <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.01em;line-height:1.2">Serve Humanity</div>
                    <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:4px">Official Warning Letter</div>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:700;letter-spacing:.04em">WARNING</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="height:4px;background:linear-gradient(90deg, #b91c1c, ${BRAND.orange}, ${BRAND.blue});font-size:0;line-height:0">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px">
              <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted}">Date: ${escapeHtml(issued)}</p>
              ${safeChapter ? `<p style="margin:0 0 16px;font-size:12px;color:${BRAND.muted}">Chapter: <strong style="color:${BRAND.ink}">${safeChapter}</strong></p>` : ""}
              <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted}">${greeting},</p>
              <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#b91c1c;font-weight:700">${safeTitle}</h1>
              <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${BRAND.ink}">
                This is an official warning from Serve Humanity leadership regarding your conduct / performance as a chapter member. Please read carefully.
              </p>
              <div style="background:#fef2f2;border-left:4px solid #b91c1c;border-radius:0 12px 12px 0;padding:16px 18px">
                <p style="margin:0;font-size:15px;line-height:1.65;color:${BRAND.ink}">${safeBody}</p>
              </div>
              <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:${BRAND.ink}">
                You are expected to take corrective action immediately. Further violations may result in additional disciplinary measures, including suspension from chapter duties.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 8px">
              <p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.5">
                Issued by: <strong style="color:${BRAND.ink}">${safeSender}</strong><br/>
                This message was sent by Serve Humanity leadership. Please contact your chapter president or leadership if you have questions.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 28px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BRAND.border};padding-top:18px">
                <tr>
                  <td>
                    <div style="font-size:13px;font-weight:600;color:${BRAND.blue}">Serve Humanity</div>
                    <div style="font-size:12px;color:${BRAND.muted};margin-top:4px">Serving with compassion · Together for humanity</div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:12px">&copy; ${year} Serve Humanity. All rights reserved.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "Serve Humanity — Official Warning Letter",
    "",
    `Date: ${issued}`,
    chapterName ? `Chapter: ${chapterName}` : "",
    "",
    greeting + ",",
    "",
    title,
    "",
    body,
    "",
    "You are expected to take corrective action immediately.",
    "",
    `Issued by: ${senderName || "Serve Humanity Leadership"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const attachments = [];
  const logo = getEmailLogoAttachment();
  if (logo && !process.env.LOGO_URL && !process.env.EMAIL_LOGO_URL) {
    attachments.push(logo);
  }

  return {
    subject: `[Warning] ${title}`,
    html,
    text,
    attachments,
  };
}

/**
 * Password reset email with branded layout + verification code.
 */
export function buildPasswordResetEmail({ name, code, expiresMinutes = 30 }) {
  const safeName = escapeHtml(name || "there");
  const safeCode = escapeHtml(String(code || ""));
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border}">
        <tr>
          <td style="background:linear-gradient(135deg, ${BRAND.blue} 0%, #1a3568 55%, ${BRAND.accent} 100%);padding:22px 28px">
            <table role="presentation" width="100%"><tr>
              <td width="72">${logoImgHtml()}</td>
              <td style="padding-left:14px">
                <div style="color:#fff;font-size:18px;font-weight:700">Serve Humanity</div>
                <div style="color:rgba(255,255,255,.85);font-size:12px;margin-top:4px">Password reset</div>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;background:linear-gradient(90deg, ${BRAND.orange}, ${BRAND.accent}, ${BRAND.blue})">&nbsp;</td></tr>
        <tr>
          <td style="padding:28px">
            <p style="margin:0 0 12px;font-size:14px;color:${BRAND.muted}">Assalamu Alaikum, ${safeName},</p>
            <h1 style="margin:0 0 12px;font-size:20px;color:${BRAND.blue}">Your reset code</h1>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${BRAND.ink}">
              We received a request to reset your Serve Humanity account password.
              Enter this code on the reset page. It expires in <strong>${expiresMinutes} minutes</strong>.
            </p>
            <p style="margin:0 0 24px;text-align:center">
              <span style="display:inline-block;letter-spacing:0.35em;font-size:28px;font-weight:700;color:${BRAND.blue};background:#f0f7ff;border:1px solid ${BRAND.border};border-radius:12px;padding:14px 22px">
                ${safeCode}
              </span>
            </p>
            <p style="margin:20px 0 0;font-size:12px;color:${BRAND.muted}">
              If you didn’t request this, you can ignore this email — your password will stay the same.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 24px">
            <div style="border-top:1px solid ${BRAND.border};padding-top:16px;font-size:11px;color:#9ca3af">
              &copy; ${year} Serve Humanity. All rights reserved.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Assalamu Alaikum, ${name || "there"},`,
    "",
    "Your Serve Humanity password reset code:",
    String(code || ""),
    "",
    `This code expires in ${expiresMinutes} minutes.`,
    "If you didn’t request this, ignore this email.",
  ].join("\n");

  const attachments = [];
  const logo = getEmailLogoAttachment();
  if (logo && !process.env.LOGO_URL && !process.env.EMAIL_LOGO_URL) {
    attachments.push(logo);
  }

  return {
    subject: "Your Serve Humanity password reset code",
    html,
    text,
    attachments,
  };
}

/**
 * Occasional donation reminder for newsletter subscribers.
 */
export function buildDonationReminderEmail({ donateUrl }) {
  const year = new Date().getFullYear();
  const url = escapeHtml(donateUrl || "https://servehumanity.org/donate");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Donate — Serve Humanity</title>
</head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:Georgia,'Times New Roman',serif;color:${BRAND.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:32px 14px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 12px 40px rgba(35,74,143,0.12)">

          <!-- Hero -->
          <tr>
            <td style="background:linear-gradient(145deg, ${BRAND.blue} 0%, #1a3568 48%, ${BRAND.accent} 100%);padding:36px 32px 28px;text-align:center">
              <div style="display:inline-block;margin:0 auto 16px">${logoImgHtml()}</div>
              <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:rgba(255,255,255,0.9);font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:10px">
                Hearts That Serve
              </div>
              <h1 style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:28px;line-height:1.25;font-weight:700;color:#ffffff">
                A little help today<br/>means dignity tomorrow
              </h1>
            </td>
          </tr>

          <tr>
            <td style="height:5px;background:linear-gradient(90deg, ${BRAND.orange}, ${BRAND.accent}, ${BRAND.blue});font-size:0;line-height:0">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 8px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
              <p style="margin:0 0 8px;font-size:14px;color:${BRAND.muted}">Assalamu Alaikum,</p>
              <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:${BRAND.ink}">
                Thank you for staying with <strong style="color:${BRAND.blue}">Serve Humanity</strong>.
                Right now, families still need food packages, medical care, and school support —
                and every rupee you give is verified, tracked, and delivered with care.
              </p>

              <!-- Impact cards -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px">
                <tr>
                  <td width="33%" style="padding:4px" valign="top">
                    <div style="background:${BRAND.soft};border-radius:14px;padding:14px 10px;text-align:center;border:1px solid #fde8d0">
                      <div style="font-size:20px;font-weight:800;color:${BRAND.accent};line-height:1.2">Food</div>
                      <div style="font-size:11px;color:${BRAND.muted};margin-top:4px;line-height:1.35">Ration packs for hungry homes</div>
                    </div>
                  </td>
                  <td width="33%" style="padding:4px" valign="top">
                    <div style="background:#f0f5ff;border-radius:14px;padding:14px 10px;text-align:center;border:1px solid #dbe5f5">
                      <div style="font-size:20px;font-weight:800;color:${BRAND.blue};line-height:1.2">Care</div>
                      <div style="font-size:11px;color:${BRAND.muted};margin-top:4px;line-height:1.35">Medical camps &amp; medicines</div>
                    </div>
                  </td>
                  <td width="33%" style="padding:4px" valign="top">
                    <div style="background:#fff7ed;border-radius:14px;padding:14px 10px;text-align:center;border:1px solid #fed7aa">
                      <div style="font-size:20px;font-weight:800;color:${BRAND.orange};line-height:1.2">Hope</div>
                      <div style="font-size:11px;color:${BRAND.muted};margin-top:4px;line-height:1.35">Education &amp; orphan support</div>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="background:linear-gradient(135deg, #fff8f0 0%, #fff 100%);border:1px solid #fde8d0;border-radius:16px;padding:22px 20px;text-align:center;margin:0 0 8px">
                <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${BRAND.accent};letter-spacing:0.04em;text-transform:uppercase">
                  Ready when you are
                </p>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:${BRAND.ink}">
                  Give what you can — even a small gift becomes someone’s next meal or medicine.
                </p>
                <a href="${url}" style="display:inline-block;background:linear-gradient(135deg, ${BRAND.orange} 0%, ${BRAND.accent} 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:999px;box-shadow:0 8px 20px rgba(244,93,34,0.35)">
                  Donate with Serve Humanity →
                </a>
                <p style="margin:14px 0 0;font-size:12px;color:${BRAND.muted}">
                  Or open: <a href="${url}" style="color:${BRAND.blue};word-break:break-all">${url}</a>
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 28px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
              <p style="margin:0 0 18px;font-size:12px;line-height:1.55;color:${BRAND.muted}">
                You’re receiving this because you subscribed to Serve Humanity updates.
                We send only occasional reminders — never spam.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BRAND.border};padding-top:16px">
                <tr>
                  <td>
                    <div style="font-size:13px;font-weight:700;color:${BRAND.blue}">Serve Humanity</div>
                    <div style="font-size:12px;color:${BRAND.muted};margin-top:3px">Serving with compassion · Together for humanity</div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:10px">&copy; ${year} Serve Humanity. All rights reserved.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "Assalamu Alaikum,",
    "",
    "A little help today means dignity tomorrow.",
    "",
    "Thank you for staying with Serve Humanity. Families still need food, medical care, and school support — and every donation is verified and tracked.",
    "",
    "Food · Care · Hope",
    "",
    `Donate: ${donateUrl || "https://servehumanity.org/donate"}`,
    "",
    "You’re receiving this because you subscribed to our updates.",
    "",
    "— Serve Humanity Team",
  ].join("\n");

  const attachments = [];
  const logo = getEmailLogoAttachment();
  if (logo && !process.env.LOGO_URL && !process.env.EMAIL_LOGO_URL) {
    attachments.push(logo);
  }

  return {
    subject: "Your kindness can feed a family today — Serve Humanity",
    html,
    text,
    attachments,
  };
}

/**
 * Welcome email after newsletter subscribe.
 */
export function buildNewsletterWelcomeEmail({ donateUrl } = {}) {
  const year = new Date().getFullYear();
  const url = escapeHtml(donateUrl || ((process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "") + "/donate"));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Welcome — Serve Humanity</title>
</head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:32px 14px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 12px 40px rgba(35,74,143,0.12)">
          <tr>
            <td style="background:linear-gradient(145deg, ${BRAND.blue} 0%, #1a3568 48%, ${BRAND.accent} 100%);padding:32px;text-align:center">
              <div style="display:inline-block;margin:0 auto 14px">${logoImgHtml()}</div>
              <div style="color:rgba(255,255,255,0.9);font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:8px">Welcome</div>
              <h1 style="margin:0;font-size:26px;line-height:1.3;font-weight:700;color:#ffffff">You’re part of the mission</h1>
            </td>
          </tr>
          <tr><td style="height:5px;background:linear-gradient(90deg, ${BRAND.orange}, ${BRAND.accent}, ${BRAND.blue})">&nbsp;</td></tr>
          <tr>
            <td style="padding:28px 32px">
              <p style="margin:0 0 14px;font-size:14px;color:${BRAND.muted}">Assalamu Alaikum,</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.ink}">
                Thank you for joining the Serve Humanity family. You’ll receive occasional field stories,
                event updates, and gentle reminders when your support can help a family in need.
              </p>
              <div style="background:${BRAND.soft};border-left:4px solid ${BRAND.orange};border-radius:0 12px 12px 0;padding:14px 16px;margin:0 0 22px">
                <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">
                  No spam — ever. Just real impact from chapters serving communities every day.
                </p>
              </div>
              <p style="margin:0;text-align:center">
                <a href="${url}" style="display:inline-block;background:linear-gradient(135deg, ${BRAND.orange}, ${BRAND.accent});color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:999px">
                  Visit donate page
                </a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px">
              <div style="border-top:1px solid ${BRAND.border};padding-top:16px;font-size:11px;color:#9ca3af">
                &copy; ${year} Serve Humanity. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "Assalamu Alaikum,",
    "",
    "You’re part of the mission.",
    "Thank you for joining Serve Humanity. You’ll receive occasional stories and donation reminders — no spam.",
    "",
    `Donate: ${donateUrl || url.replace(/&amp;/g, "&")}`,
    "",
    "— Serve Humanity Team",
  ].join("\n");

  const attachments = [];
  const logo = getEmailLogoAttachment();
  if (logo && !process.env.LOGO_URL && !process.env.EMAIL_LOGO_URL) {
    attachments.push(logo);
  }

  return {
    subject: "Welcome to Serve Humanity — you’re part of the mission",
    html,
    text,
    attachments,
  };
}

export const NEWSLETTER_THEMES = {
  heart: {
    label: "Donate / Heart",
    icon: "❤️",
    eyebrow: "Compassion in action",
    accent: BRAND.accent,
    softBg: BRAND.soft,
    softBorder: "#fde8d0",
  },
  food: {
    label: "Food & Ration",
    icon: "🍽️",
    eyebrow: "Feed a family",
    accent: BRAND.orange,
    softBg: "#fff7ed",
    softBorder: "#fed7aa",
  },
  medical: {
    label: "Medical care",
    icon: "🩺",
    eyebrow: "Health & healing",
    accent: BRAND.blue,
    softBg: "#f0f5ff",
    softBorder: "#dbe5f5",
  },
  education: {
    label: "Education",
    icon: "📚",
    eyebrow: "Hope through learning",
    accent: "#0f766e",
    softBg: "#f0fdfa",
    softBorder: "#99f6e4",
  },
  event: {
    label: "Event invite",
    icon: "📅",
    eyebrow: "Join us",
    accent: "#7c3aed",
    softBg: "#f5f3ff",
    softBorder: "#ddd6fe",
  },
  update: {
    label: "Field update",
    icon: "✨",
    eyebrow: "From the field",
    accent: BRAND.blue,
    softBg: "#f8fafc",
    softBorder: BRAND.border,
  },
  gratitude: {
    label: "Thank you",
    icon: "🤲",
    eyebrow: "With gratitude",
    accent: BRAND.orange,
    softBg: BRAND.soft,
    softBorder: "#fde8d0",
  },
};

/**
 * Custom composed newsletter blast to subscribers.
 */
export function buildComposedNewsletterEmail({
  theme = "heart",
  eyebrow,
  title,
  body,
  ctaLabel,
  ctaUrl,
  subject,
}) {
  const year = new Date().getFullYear();
  const themeKey = NEWSLETTER_THEMES[theme] ? theme : "heart";
  const t = NEWSLETTER_THEMES[themeKey];
  const safeTitle = escapeHtml(title || "Serve Humanity update");
  const safeEyebrow = escapeHtml(eyebrow || t.eyebrow);
  const safeBody = escapeHtml(body || "").replace(/\n/g, "<br/>");
  const hasCta = Boolean(ctaLabel?.trim() && ctaUrl?.trim());
  const safeCtaLabel = escapeHtml(ctaLabel || "Learn more");
  const safeCtaUrl = escapeHtml(ctaUrl || "");
  const mailSubject = subject?.trim() || title?.trim() || "Update from Serve Humanity";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:32px 14px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 12px 40px rgba(35,74,143,0.12)">

          <tr>
            <td style="background:linear-gradient(145deg, ${BRAND.blue} 0%, #1a3568 48%, ${t.accent} 100%);padding:34px 32px 28px;text-align:center">
              <div style="display:inline-block;margin:0 auto 12px">${logoImgHtml()}</div>
              <div style="font-size:36px;line-height:1;margin:0 0 12px">${t.icon}</div>
              <div style="color:rgba(255,255,255,0.9);font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:10px">
                ${safeEyebrow}
              </div>
              <h1 style="margin:0;font-size:26px;line-height:1.3;font-weight:700;color:#ffffff">${safeTitle}</h1>
            </td>
          </tr>

          <tr>
            <td style="height:5px;background:linear-gradient(90deg, ${BRAND.orange}, ${t.accent}, ${BRAND.blue});font-size:0;line-height:0">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:28px 32px 12px">
              <p style="margin:0 0 10px;font-size:14px;color:${BRAND.muted}">Assalamu Alaikum,</p>
              <div style="background:${t.softBg};border:1px solid ${t.softBorder};border-radius:16px;padding:18px 18px;margin:0 0 20px">
                <p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND.ink}">${safeBody}</p>
              </div>
              ${
                hasCta
                  ? `<p style="margin:0 0 8px;text-align:center">
                      <a href="${safeCtaUrl}" style="display:inline-block;background:linear-gradient(135deg, ${BRAND.orange} 0%, ${t.accent} 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 30px;border-radius:999px;box-shadow:0 8px 20px rgba(244,93,34,0.28)">
                        ${safeCtaLabel} →
                      </a>
                    </p>
                    <p style="margin:10px 0 0;text-align:center;font-size:12px;color:${BRAND.muted}">
                      Or open: <a href="${safeCtaUrl}" style="color:${BRAND.blue};word-break:break-all">${safeCtaUrl}</a>
                    </p>`
                  : ""
              }
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 28px">
              <p style="margin:0 0 16px;font-size:12px;line-height:1.55;color:${BRAND.muted}">
                You’re receiving this because you subscribed to Serve Humanity updates.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BRAND.border};padding-top:16px">
                <tr>
                  <td>
                    <div style="font-size:13px;font-weight:700;color:${BRAND.blue}">Serve Humanity</div>
                    <div style="font-size:12px;color:${BRAND.muted};margin-top:3px">Serving with compassion · Together for humanity</div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:10px">&copy; ${year} Serve Humanity. All rights reserved.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "Assalamu Alaikum,",
    "",
    `${t.icon} ${eyebrow || t.eyebrow}`,
    title || "",
    "",
    body || "",
    "",
    hasCta ? `${ctaLabel}: ${ctaUrl}` : "",
    "",
    "— Serve Humanity Team",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const attachments = [];
  const logo = getEmailLogoAttachment();
  if (logo && !process.env.LOGO_URL && !process.env.EMAIL_LOGO_URL) {
    attachments.push(logo);
  }

  return {
    subject: mailSubject,
    html,
    text,
    attachments,
    theme: themeKey,
  };
}



