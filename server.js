import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Server as SocketIO } from "socket.io";

import { connectDB } from "./config/db.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

// Routes
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import memberRoutes from "./routes/member.routes.js";
import welfareCaseRoutes from "./routes/welfareCase.routes.js";
import donationRoutes from "./routes/donation.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import eventRoutes from "./routes/event.routes.js";
import chapterRoutes from "./routes/chapter.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import volunteerRoutes from "./routes/volunteer.routes.js";
import mediaRoutes from "./routes/media.routes.js";
import mediaTemplateRoutes from "./routes/mediaTemplate.routes.js";
import mediaCaseRoutes from "./routes/mediaCase.routes.js";
import documentationRoutes from "./routes/documentation.routes.js";
import financeRoutes from "./routes/finance.routes.js";
import websiteRoutes from "./routes/website.routes.js";
import teamRecordRoutes from "./routes/teamRecord.routes.js";
import chapterDonationRoutes from "./routes/chapterDonation.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import websiteEventRoutes from "./routes/websiteEvent.routes.js";
import newsletterRoutes from "./routes/newsletter.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import caseReferralRoutes from "./routes/caseReferral.routes.js";
import itRoutes from "./routes/it.routes.js";
import itSupportRoutes from "./routes/itSupport.routes.js";
import { startDonationReminderScheduler } from "./jobs/donationReminders.js";


const app = express();
const httpServer = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsOrigin(origin, callback) {
  // Non-browser requests (no Origin header)
  if (!origin) return callback(null, true);

  if (allowedOrigins.includes(origin)) return callback(null, true);

  // In development, allow any localhost / 127.0.0.1 port (Vite often switches ports)
  if (
    process.env.NODE_ENV !== "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return callback(null, true);
  }

  return callback(new Error(`CORS blocked for origin: ${origin}`));
}

// Socket.IO
const io = new SocketIO(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});
app.set("io", io);

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// CORS
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// Security & perf
app.use(helmet());
app.use(compression());
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Global rate limit
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later." },
  })
);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// API routes
const API = "/api/v1";
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/members`, memberRoutes);
app.use(`${API}/cases`, welfareCaseRoutes);
app.use(`${API}/donations`, donationRoutes);
app.use(`${API}/expenses`, expenseRoutes);
app.use(`${API}/events`, eventRoutes);
app.use(`${API}/chapters`, chapterRoutes);
app.use(`${API}/contact`, contactRoutes);
app.use(`${API}/volunteer`, volunteerRoutes);
app.use(`${API}/media`, mediaRoutes);
app.use(`${API}/media-templates`, mediaTemplateRoutes);
app.use(`${API}/media-case-files`, mediaCaseRoutes);
app.use(`${API}/documentation`, documentationRoutes);
app.use(`${API}/finance-files`, financeRoutes);
app.use(`${API}/website`, websiteRoutes);
app.use(`${API}/team-records`, teamRecordRoutes);
app.use(`${API}/chapter-donations`, chapterDonationRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/reviews`, reviewRoutes);
app.use(`${API}/website-events`, websiteEventRoutes);
app.use(`${API}/newsletter`, newsletterRoutes);
app.use(`${API}/dashboard`, dashboardRoutes);
app.use(`${API}/case-referrals`, caseReferralRoutes);
app.use(`${API}/it`, itRoutes);
app.use(`${API}/it-support`, itSupportRoutes);


// 404 + error handler
app.use(notFound);
app.use(errorHandler);

// Start
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    startDonationReminderScheduler();
  });
});
