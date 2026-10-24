# Serve Humanity — Backend API

Node.js · Express · MongoDB (Mongoose) · Socket.IO · JWT Auth

## Quick Start

```bash
# 1. Install dependencies (already done)
npm install

# 2. Configure environment
# Edit .env — set MONGO_URI, JWT_SECRET, SMTP, Cloudinary

# 3. Seed the database
npm run seed

# 4. Start dev server
npm run dev
```

Server runs at **http://localhost:5000**

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default 5000) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random secret for JWT signing |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `CLOUDINARY_*` | Cloudinary credentials for media uploads |
| `SMTP_*` | Nodemailer SMTP credentials |
| `CLIENT_ORIGINS` | Comma-separated allowed CORS origins |

## API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | Register |
| POST | `/api/v1/auth/login` | Public | Login (returns JWT) |
| POST | `/api/v1/auth/logout` | Public | Clear cookie |
| GET | `/api/v1/auth/me` | Bearer | Current user |
| PATCH | `/api/v1/auth/change-password` | Bearer | Change password |
| GET | `/api/v1/chapters` | Public | List chapters |
| POST | `/api/v1/chapters` | CEO | Create chapter |
| GET | `/api/v1/chapters/:id/stats` | Bearer | Chapter KPIs |
| GET | `/api/v1/members` | Bearer | List members |
| POST | `/api/v1/members` | HR/President | Add member |
| GET | `/api/v1/cases` | Bearer | List welfare cases |
| POST | `/api/v1/cases` | Bearer | Submit case |
| PATCH | `/api/v1/cases/:id/status` | Verification+ | Update status |
| POST | `/api/v1/cases/:id/notes` | Bearer | Add note |
| GET | `/api/v1/donations` | Bearer | List donations |
| POST | `/api/v1/donations` | **Public** | Submit donation (from website) |
| GET | `/api/v1/donations/stats` | Bearer | Aggregated stats |
| GET | `/api/v1/expenses` | Bearer | List expenses |
| POST | `/api/v1/expenses` | Finance+ | Create expense |
| PATCH | `/api/v1/expenses/:id/status` | Finance+ | Approve/reject |
| GET | `/api/v1/events` | Public | List events |
| POST | `/api/v1/events` | Event Head+ | Create event |
| POST | `/api/v1/contact` | **Public** | Contact form |
| POST | `/api/v1/volunteer/apply` | **Public** | Volunteer application |
| GET | `/api/v1/volunteer` | HR/President | List applications |
| POST | `/api/v1/media/upload` | Media Head+ | Upload file (multipart) |
| GET | `/health` | Public | Health check |

## Real-time Events (Socket.IO)

Connect to `ws://localhost:5000` — the server emits:

| Event | Payload |
|---|---|
| `case:created` | `{ caseId, category, urgency }` |
| `case:updated` | `{ caseId, status }` |
| `donation:new` | `{ amount, cause }` |
| `expense:created` | `{ expenseId, amount }` |
| `expense:updated` | `{ expenseId, status }` |
| `member:created` | Member document |
| `member:updated` | Member document |
| `event:updated` | `{ eventId, status }` |
| `chapter:updated` | Chapter document |

## Folder Structure

```
backend/
├── config/        db.js
├── controllers/   auth, user, chapter, member, welfareCase,
│                  donation, expense, event, contact, volunteer, media
├── middleware/    auth.js, errorHandler.js, upload.js
├── models/        User, Chapter, Member, WelfareCase, Donation,
│                  Expense, Event, ContactMessage, VolunteerApplication, Media
├── routes/        *.routes.js
├── utils/         email.js
├── seed.js
└── server.js
```

## Seed Credentials

After `npm run seed`:

| Role | Email | Password |
|---|---|---|
| CEO | ceo@servehumanity.org | Password123! |
| Chapter President | ayesha@sh.org | Password123! |
| Finance Head | fatima@sh.org | Password123! |
| Verification Head | sana@sh.org | Password123! |

After `npm run seed:it`:

| Role | Email | Password |
|---|---|---|
| IT Manager — CEO dashboard (`bog_it`), manages board + all chapters | it@servehumanity.org | Password123! |
"# servebcknd" 
