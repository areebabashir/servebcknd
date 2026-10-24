
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

const PORT = process.env.PORT || 5000;
const API = "/api/v1";
const isVercel = process.env.VERCEL === "1";

// --------------------------------------------------
// CORS CONFIGURATION
// --------------------------------------------------

const allowedOrigins = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

function corsOrigin(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }

  const normalizedOrigin = origin.replace(/\/+$/, "");

  if (allowedOrigins.includes(normalizedOrigin)) {
    return callback(null, true);
  }

  if (
    process.env.NODE_ENV !== "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return callback(null, true);
  }

  console.error("CORS blocked origin:", origin);

  return callback(new Error(`CORS blocked for origin: ${origin}`));
}

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// --------------------------------------------------
// SECURITY AND MIDDLEWARE
// --------------------------------------------------

app.use(helmet());
app.use(compression());
app.use(cookieParser());

app.use(
  morgan(
    process.env.NODE_ENV === "production" ? "combined" : "dev"
  )
);

app.use(express.json({ limit: "10mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests, please try again later.",
    },
  })
);

// --------------------------------------------------
// SOCKET.IO - LOCAL SERVER ONLY
// --------------------------------------------------

let io = null;

if (!isVercel) {
  io = new SocketIO(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}

app.set("io", io);

// --------------------------------------------------
// ROOT AND HEALTH ROUTES
// --------------------------------------------------

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welfare Management API is running",
    health: "/health",
    apiBase: API,
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// --------------------------------------------------
// DATABASE CONNECTION
// --------------------------------------------------

let dbPromise;

function ensureDB() {
  if (!dbPromise) {
    dbPromise = connectDB().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

// --------------------------------------------------
// API ROUTES
// CORS middleware handles OPTIONS before this section.
// --------------------------------------------------

app.use(API, async (req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (error) {
    next(error);
  }
});

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

// --------------------------------------------------
// ERROR HANDLING
// --------------------------------------------------

app.use(notFound);
app.use(errorHandler);

// --------------------------------------------------
// EXPORT FOR VERCEL
// --------------------------------------------------

export default app;

// --------------------------------------------------
// LOCAL SERVER
// --------------------------------------------------

if (!isVercel) {
  async function startServer() {
    try {
      await ensureDB();

      httpServer.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(
          `Environment: ${process.env.NODE_ENV || "development"}`
        );

        startDonationReminderScheduler();
      });
    } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  startServer();
}