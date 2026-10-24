import nodemailer from "nodemailer";

function smtpUser() {
  return process.env.SMTP_USER || process.env.EMAIL_USER || "";
}

function smtpPass() {
  // Gmail shows app passwords with spaces — strip them for SMTP auth
  return (process.env.SMTP_PASS || process.env.EMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
}

function isPlaceholder(value) {
  const v = String(value || "").trim().toLowerCase();
  return (
    !v ||
    v.includes("your_email") ||
    v.includes("your_app_password") ||
    v === "password" ||
    v === "changeme"
  );
}

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const user = smtpUser();
  const pass = smtpPass();

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendEmail({ to, subject, html, text, attachments }) {
  const user = smtpUser();
  const pass = smtpPass();

  if (isPlaceholder(user) || isPlaceholder(pass)) {
    console.warn("SMTP not configured — skipping email.");
    return;
  }

  return getTransporter().sendMail({
    from: process.env.EMAIL_FROM || `"Serve Humanity" <${user}>`,
    to,
    subject,
    html,
    text,
    attachments: attachments?.length ? attachments : undefined,
  });
}
