import Notification, {
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_PRIORITIES,
} from "../models/Notification.js";
import User, { CEO_DASHBOARD_ROLES } from "../models/User.js";
import Chapter from "../models/Chapter.js";
import { sendEmail } from "../utils/email.js";
import {
  buildNotificationEmailTemplate,
  buildWarningEmailTemplate,
} from "../utils/emailTemplates.js";

const ALL_MEMBER_ROLES = [...CEO_DASHBOARD_ROLES, "president", "member"];

function rolesForAudience(audience) {
  if (audience === "bogs") return [...CEO_DASHBOARD_ROLES];
  if (audience === "bogs_presidents") return [...CEO_DASHBOARD_ROLES, "president"];
  if (audience === "all_members") return ALL_MEMBER_ROLES;
  return [];
}

export async function resolveAudienceUsers(audience) {
  const roles = rolesForAudience(audience);
  if (!roles.length) return [];

  return User.find({
    isActive: true,
    systemRole: { $in: roles },
    email: { $exists: true, $nin: [null, ""] },
  })
    .select("_id name email systemRole")
    .lean();
}

async function fanOutEmails(notification, usersById = new Map()) {
  let authFailedMessage = null;

  for (const recipient of notification.recipients) {
    if (!recipient.email) continue;

    if (authFailedMessage) {
      recipient.emailError = authFailedMessage;
      continue;
    }

    const user = usersById.get(String(recipient.user));
    const mail = buildNotificationEmailTemplate({
      title: notification.title,
      body: notification.body,
      priority: notification.priority,
      recipientName: user?.name,
    });

    try {
      const result = await sendEmail({
        to: recipient.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: mail.attachments,
      });
      if (result) {
        recipient.emailedAt = new Date();
        recipient.emailError = null;
      } else {
        recipient.emailError = "SMTP not configured (check SMTP_USER / SMTP_PASS in backend .env)";
      }
    } catch (err) {
      const message = err?.message || "Failed to send email";
      recipient.emailError = message;
      console.error(`Notification email failed for ${recipient.email}:`, message);
      if (/invalid login|badcredentials|username and password/i.test(message)) {
        authFailedMessage = message;
      }
    }
  }

  await notification.save();
}

export async function createNotification(req, res, next) {
  try {
    const { title, body, audience, priority = "normal", expiresAt } = req.body || {};

    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ success: false, message: "Title and body are required." });
    }
    if (!NOTIFICATION_AUDIENCES.includes(audience) || audience === "warning") {
      return res.status(400).json({
        success: false,
        message: "Invalid audience. Use bogs, bogs_presidents, or all_members.",
      });
    }
    if (priority && !NOTIFICATION_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, message: "Invalid priority." });
    }

    const users = await resolveAudienceUsers(audience);
    if (!users.length) {
      return res.status(400).json({
        success: false,
        message: "No active recipients found for this audience.",
      });
    }

    const notification = await Notification.create({
      title: title.trim(),
      body: body.trim(),
      audience,
      priority: priority || "normal",
      createdBy: req.user._id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      recipients: users.map((u) => ({
        user: u._id,
        email: u.email,
        readAt: null,
        dismissedAt: null,
        emailedAt: null,
        emailError: null,
      })),
    });

    const usersById = new Map(users.map((u) => [String(u._id), u]));

    // Fan-out emails without blocking the HTTP response longer than needed —
    // still await so emailedAt/emailError are persisted before we respond.
    await fanOutEmails(notification, usersById);

    const emailed = notification.recipients.filter((r) => r.emailedAt).length;
    const failed = notification.recipients.filter((r) => r.emailError).length;
    const firstEmailError =
      notification.recipients.find((r) => r.emailError)?.emailError || null;

    res.status(201).json({
      success: true,
      data: notification,
      meta: {
        recipientCount: notification.recipients.length,
        emailed,
        emailFailed: failed,
        emailError: firstEmailError,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listSentNotifications(req, res, next) {
  try {
    const items = await Notification.find({ audience: { $ne: "warning" } })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("createdBy", "name email")
      .lean();

    const data = items.map((n) => ({
      ...n,
      recipientCount: n.recipients?.length ?? 0,
      emailedCount: n.recipients?.filter((r) => r.emailedAt).length ?? 0,
      emailFailedCount: n.recipients?.filter((r) => r.emailError).length ?? 0,
      readCount: n.recipients?.filter((r) => r.readAt).length ?? 0,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /notifications/warning
 * Send an official warning letter/email to one chapter member (User).
 */
export async function sendWarningMail(req, res, next) {
  try {
    const { chapterId, userId, title, body } = req.body || {};

    if (!chapterId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Chapter and member are required.",
      });
    }
    if (!body?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Warning message is required.",
      });
    }

    const chapter = await Chapter.findById(chapterId).select("name city").lean();
    if (!chapter) {
      return res.status(404).json({ success: false, message: "Chapter not found." });
    }

    const member = await User.findOne({
      _id: userId,
      chapter: chapterId,
    })
      .select("_id name email chapterRole systemRole isActive")
      .lean();

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found in this chapter.",
      });
    }
    if (!member.email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "This member has no email address on file.",
      });
    }

    const warningTitle = (title?.trim() || "Official Warning Letter").slice(0, 200);

    const notification = await Notification.create({
      title: warningTitle,
      body: body.trim(),
      audience: "warning",
      priority: "urgent",
      chapter: chapter._id,
      createdBy: req.user._id,
      recipients: [
        {
          user: member._id,
          email: member.email,
          readAt: null,
          dismissedAt: null,
          emailedAt: null,
          emailError: null,
        },
      ],
    });

    const mail = buildWarningEmailTemplate({
      title: warningTitle,
      body: body.trim(),
      recipientName: member.name,
      chapterName: chapter.name,
      senderName: req.user.name,
    });

    const recipient = notification.recipients[0];
    try {
      const result = await sendEmail({
        to: member.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: mail.attachments,
      });
      if (result) {
        recipient.emailedAt = new Date();
        recipient.emailError = null;
      } else {
        recipient.emailError =
          "SMTP not configured (check SMTP_USER / SMTP_PASS in backend .env)";
      }
    } catch (err) {
      recipient.emailError = err?.message || "Failed to send email";
      console.error(`Warning email failed for ${member.email}:`, recipient.emailError);
    }
    await notification.save();

    const populated = await Notification.findById(notification._id)
      .populate("createdBy", "name email")
      .populate("chapter", "name city")
      .populate("recipients.user", "name email chapterRole")
      .lean();

    res.status(201).json({
      success: true,
      data: populated,
      meta: {
        emailed: recipient.emailedAt ? 1 : 0,
        emailFailed: recipient.emailError ? 1 : 0,
        emailError: recipient.emailError || null,
        recipientName: member.name,
        recipientEmail: member.email,
        chapterName: chapter.name,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /notifications/warning — sent warning letter history */
export async function listWarningMails(req, res, next) {
  try {
    const items = await Notification.find({ audience: "warning" })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("createdBy", "name email")
      .populate("chapter", "name city")
      .populate("recipients.user", "name email chapterRole")
      .lean();

    const data = items.map((n) => {
      const recipient = n.recipients?.[0];
      return {
        ...n,
        recipientName: recipient?.user?.name || recipient?.email || "—",
        recipientEmail: recipient?.email || recipient?.user?.email || "",
        recipientRole: recipient?.user?.chapterRole || "",
        emailed: !!recipient?.emailedAt,
        emailError: recipient?.emailError || null,
        chapterName: n.chapter?.name || "—",
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getInbox(req, res, next) {
  try {
    const userId = req.user._id;
    const now = new Date();

    const items = await Notification.find({
      recipients: {
        $elemMatch: {
          user: userId,
          dismissedAt: null,
        },
      },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("createdBy", "name email")
      .lean();

    const data = items
      .map((n) => {
        const mine = n.recipients.find(
          (r) => String(r.user) === String(userId) && !r.dismissedAt,
        );
        if (!mine) return null;
        return {
          _id: n._id,
          title: n.title,
          body: n.body,
          priority: n.priority,
          audience: n.audience,
          createdBy: n.createdBy,
          createdAt: n.createdAt,
          expiresAt: n.expiresAt,
          readAt: mine?.readAt ?? null,
        };
      })
      .filter(Boolean);

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const userId = req.user._id;
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    const recipient = notification.recipients.find((r) => String(r.user) === String(userId));
    if (!recipient) {
      return res.status(403).json({ success: false, message: "You are not a recipient of this notification." });
    }

    if (!recipient.readAt) {
      recipient.readAt = new Date();
      await notification.save();
    }

    res.json({
      success: true,
      data: {
        _id: notification._id,
        readAt: recipient.readAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(req, res, next) {
  try {
    const userId = req.user._id;
    const now = new Date();

    const count = await Notification.countDocuments({
      recipients: {
        $elemMatch: {
          user: userId,
          readAt: null,
          dismissedAt: null,
        },
      },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    });

    res.json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
}

/**
 * Remove a notification from the current user's inbox only.
 * DELETE /notifications/:id/inbox
 */
export async function dismissFromInbox(req, res, next) {
  try {
    const userId = req.user._id;
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    const recipient = notification.recipients.find((r) => String(r.user) === String(userId));
    if (!recipient) {
      return res.status(403).json({
        success: false,
        message: "You are not a recipient of this notification.",
      });
    }

    if (!recipient.dismissedAt) {
      recipient.dismissedAt = new Date();
      if (!recipient.readAt) recipient.readAt = recipient.dismissedAt;
      await notification.save();
    }

    res.json({
      success: true,
      message: "Removed from your notifications.",
      data: { _id: notification._id, dismissedAt: recipient.dismissedAt },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /notifications/:id — leadership deletes sent history (removes for everyone).
 */
export async function deleteSentNotification(req, res, next) {
  try {
    const doc = await Notification.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    res.json({ success: true, message: "Notification removed from history." });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /notifications — clear all sent notification history.
 */
export async function clearSentHistory(req, res, next) {
  try {
    const result = await Notification.deleteMany({});
    res.json({
      success: true,
      message: `Cleared ${result.deletedCount || 0} notification(s) from history.`,
      data: { deletedCount: result.deletedCount || 0 },
    });
  } catch (err) {
    next(err);
  }
}
