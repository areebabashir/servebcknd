import ItSupportThread from "../models/ItSupportThread.js";
import User, { CEO_DASHBOARD_ROLES } from "../models/User.js";
import { sendEmail } from "../utils/email.js";
import { buildNotificationEmailTemplate } from "../utils/emailTemplates.js";

function chapterIdOf(user) {
  if (!user?.chapter) return null;
  return user.chapter._id || user.chapter;
}

function isOrgItManager(user) {
  return user?.systemRole === "bog_it";
}

function resolveScopeForUser(user) {
  if (CEO_DASHBOARD_ROLES.includes(user?.systemRole)) return "board";
  return "chapter";
}

function populateThread(q) {
  return q
    .populate("requester", "name email systemRole chapterRole phone")
    .populate("chapter", "name city")
    .populate("messages.sender", "name email systemRole chapterRole")
    .populate("lastSender", "name email systemRole chapterRole");
}

function summarizeThread(doc, viewerIsIt) {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const last = plain.messages?.[plain.messages.length - 1];
  return {
    ...plain,
    messageCount: plain.messages?.length || 0,
    preview: last?.body ? String(last.body).slice(0, 140) : "",
    unread: viewerIsIt ? !!plain.unreadForIt : !!plain.unreadForRequester,
  };
}

async function sendSupportEmail({ to, recipientName, title, body }) {
  if (!to) return;
  try {
    const mail = buildNotificationEmailTemplate({
      title,
      body,
      priority: "normal",
      recipientName,
    });
    await sendEmail({
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments,
    });
  } catch (err) {
    // Email failure must not prevent support messages from being delivered in-app.
    console.error(`IT support email failed for ${to}:`, err?.message || err);
  }
}

async function emailItManagers({ senderName, senderEmail, subject, body, scope }) {
  const managers = await User.find({
    systemRole: "bog_it",
    isActive: true,
    email: { $exists: true, $nin: [null, ""] },
  })
    .select("name email")
    .lean();

  await Promise.all(
    managers.map((manager) =>
      sendSupportEmail({
        to: manager.email,
        recipientName: manager.name,
        title: `New IT message: ${subject}`,
        body: `${senderName} (${senderEmail}) sent a ${scope} IT support message:\n\n${body}\n\nSign in to the CEO dashboard and open the IT messages inbox to reply.`,
      }),
    ),
  );
}

async function emailRequester({ requesterId, subject, body, started = false }) {
  const requester = await User.findById(requesterId).select("name email").lean();
  if (!requester?.email) return;

  await sendSupportEmail({
    to: requester.email,
    recipientName: requester.name,
    title: started ? `IT contacted you: ${subject}` : `IT replied: ${subject}`,
    body: `${body}\n\nSign in and open Contact IT to continue the conversation.`,
  });
}

/**
 * POST /it-support/threads
 * Any authenticated user opens a ticket with IT.
 */
export async function createMyThread(req, res, next) {
  try {
    const subject = String(req.body?.subject || "").trim();
    const body = String(req.body?.body || "").trim();
    if (!subject || !body) {
      return res.status(400).json({ success: false, message: "Subject and message are required." });
    }
    if (subject.length > 200) {
      return res.status(400).json({ success: false, message: "Subject is too long." });
    }

    // IT staff use the inbox to start chats — keep Contact IT for everyone else
    if (req.user.systemRole === "bog_it") {
      return res.status(400).json({
        success: false,
        message: "Use IT Board / Chapter Messages to contact users.",
      });
    }

    const scope = resolveScopeForUser(req.user);
    const chapter = scope === "chapter" ? chapterIdOf(req.user) : null;
    if (scope === "chapter" && !chapter) {
      return res.status(400).json({
        success: false,
        message: "Your account is not linked to a chapter.",
      });
    }

    const thread = await ItSupportThread.create({
      subject,
      scope,
      chapter,
      requester: req.user._id,
      status: "open",
      messages: [{ sender: req.user._id, body }],
      lastMessageAt: new Date(),
      lastSender: req.user._id,
      unreadForIt: true,
      unreadForRequester: false,
    });

    const populated = await populateThread(ItSupportThread.findById(thread._id));
    void emailItManagers({
      senderName: req.user.name,
      senderEmail: req.user.email,
      subject,
      body,
      scope,
    }).catch((err) => console.error("IT support notification email failed:", err));
    res.status(201).json({ success: true, data: summarizeThread(populated, false) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /it-support/threads — my conversations
 */
export async function listMyThreads(req, res, next) {
  try {
    const threads = await populateThread(
      ItSupportThread.find({ requester: req.user._id }).sort({ lastMessageAt: -1 }).limit(200),
    );
    res.json({
      success: true,
      data: threads.map((t) => summarizeThread(t, false)),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /it-support/threads/:id
 */
export async function getMyThread(req, res, next) {
  try {
    const thread = await populateThread(ItSupportThread.findById(req.params.id));
    if (!thread) {
      return res.status(404).json({ success: false, message: "Conversation not found." });
    }

    const isRequester = String(thread.requester._id || thread.requester) === String(req.user._id);
    const isIt = isOrgItManager(req.user);
    if (!isRequester && !isIt) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (isRequester && thread.unreadForRequester) {
      thread.unreadForRequester = false;
      await thread.save();
    }
    if (isIt && thread.unreadForIt) {
      thread.unreadForIt = false;
      await thread.save();
    }

    res.json({ success: true, data: summarizeThread(thread, isIt && !isRequester) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /it-support/threads/:id/replies
 * Requester or IT can reply.
 */
export async function replyToThread(req, res, next) {
  try {
    const body = String(req.body?.body || "").trim();
    if (!body) {
      return res.status(400).json({ success: false, message: "Message is required." });
    }

    const thread = await ItSupportThread.findById(req.params.id);
    if (!thread) {
      return res.status(404).json({ success: false, message: "Conversation not found." });
    }

    const isRequester = String(thread.requester) === String(req.user._id);
    const isIt = isOrgItManager(req.user);
    if (!isRequester && !isIt) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (thread.status === "closed") {
      thread.status = "open";
    }

    thread.messages.push({ sender: req.user._id, body });
    thread.lastMessageAt = new Date();
    thread.lastSender = req.user._id;

    if (isIt) {
      thread.unreadForRequester = true;
      thread.unreadForIt = false;
    } else {
      thread.unreadForIt = true;
      thread.unreadForRequester = false;
    }

    await thread.save();
    if (isIt) {
      void emailRequester({
        requesterId: thread.requester,
        subject: thread.subject,
        body,
      }).catch((err) => console.error("IT support reply email failed:", err));
    } else {
      void emailItManagers({
        senderName: req.user.name,
        senderEmail: req.user.email,
        subject: thread.subject,
        body,
        scope: thread.scope,
      }).catch((err) => console.error("IT support notification email failed:", err));
    }
    const populated = await populateThread(ItSupportThread.findById(thread._id));
    res.json({ success: true, data: summarizeThread(populated, isIt) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /it-support/inbox?scope=board|chapter
 */
export async function listInbox(req, res, next) {
  try {
    if (!isOrgItManager(req.user)) {
      return res.status(403).json({ success: false, message: "IT inbox access only." });
    }

    const scope = String(req.query.scope || "").trim();
    if (scope !== "board" && scope !== "chapter") {
      return res.status(400).json({ success: false, message: "scope must be board or chapter." });
    }

    const status = String(req.query.status || "all").trim();
    const filter = { scope };
    if (status === "open" || status === "closed") filter.status = status;

    const threads = await populateThread(
      ItSupportThread.find(filter).sort({ lastMessageAt: -1 }).limit(300),
    );

    res.json({
      success: true,
      data: threads.map((t) => summarizeThread(t, true)),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /it-support/inbox/start
 * IT starts a conversation with any user.
 */
export async function startInboxThread(req, res, next) {
  try {
    if (!isOrgItManager(req.user)) {
      return res.status(403).json({ success: false, message: "IT inbox access only." });
    }

    const userId = req.body?.userId;
    const subject = String(req.body?.subject || "").trim();
    const body = String(req.body?.body || "").trim();
    if (!userId || !subject || !body) {
      return res.status(400).json({
        success: false,
        message: "userId, subject, and message are required.",
      });
    }

    const target = await User.findById(userId);
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    if (String(target._id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "Cannot start a chat with yourself." });
    }

    const scope = resolveScopeForUser(target);
    const chapter = scope === "chapter" ? chapterIdOf(target) : null;

    const thread = await ItSupportThread.create({
      subject,
      scope,
      chapter,
      requester: target._id,
      status: "open",
      messages: [{ sender: req.user._id, body }],
      lastMessageAt: new Date(),
      lastSender: req.user._id,
      unreadForIt: false,
      unreadForRequester: true,
    });

    const populated = await populateThread(ItSupportThread.findById(thread._id));
    void emailRequester({
      requesterId: target._id,
      subject,
      body,
      started: true,
    }).catch((err) => console.error("IT support message email failed:", err));
    res.status(201).json({ success: true, data: summarizeThread(populated, true) });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /it-support/threads/:id/status  { status: open|closed }
 */
export async function updateThreadStatus(req, res, next) {
  try {
    const status = String(req.body?.status || "").trim();
    if (status !== "open" && status !== "closed") {
      return res.status(400).json({ success: false, message: "status must be open or closed." });
    }

    const thread = await ItSupportThread.findById(req.params.id);
    if (!thread) {
      return res.status(404).json({ success: false, message: "Conversation not found." });
    }

    const isRequester = String(thread.requester) === String(req.user._id);
    const isIt = isOrgItManager(req.user);
    if (!isRequester && !isIt) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    thread.status = status;
    await thread.save();
    const populated = await populateThread(ItSupportThread.findById(thread._id));
    res.json({ success: true, data: summarizeThread(populated, isIt) });
  } catch (err) {
    next(err);
  }
}
