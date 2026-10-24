import Event from "../models/Event.js";
import Chapter from "../models/Chapter.js";

export async function getEvents(req, res, next) {
  try {
    const { chapter, status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (chapter) filter.chapter = chapter;
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [events, total] = await Promise.all([
      Event.find(filter)
        .skip(skip).limit(Number(limit))
        .populate("chapter", "name city")
        .populate("organizer", "name")
        .populate("approvedBy", "name")
        .sort({ date: 1 }),
      Event.countDocuments(filter),
    ]);
    res.json({ success: true, total, data: events });
  } catch (err) {
    next(err);
  }
}

export async function getEvent(req, res, next) {
  try {
    const event = await Event.findById(req.params.id)
      .populate("chapter", "name city")
      .populate("organizer", "name email")
      .populate("approvedBy", "name");
    if (!event) return res.status(404).json({ success: false, message: "Event not found." });
    res.json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
}

export async function createEvent(req, res, next) {
  try {
    const event = await Event.create({ ...req.body, organizer: req.user._id });
    res.status(201).json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
}

export async function updateEvent(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found." });

    const { status, ...rest } = req.body;

    if (status) {
      event.status = status;
      if (status === "Approved") {
        event.approvedBy = req.user._id;
        await Chapter.findByIdAndUpdate(event.chapter, { $inc: { totalEvents: 1 } });
      }
    }

    Object.assign(event, rest);
    await event.save();

    req.app.get("io")?.emit("event:updated", { eventId: event._id, status: event.status });
    res.json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
}

export async function deleteEvent(req, res, next) {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Event deleted." });
  } catch (err) {
    next(err);
  }
}
