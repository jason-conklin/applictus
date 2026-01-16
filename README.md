# Applictus MVP Scaffold

Desktop-first job application tracker scaffold with auth, database, backend API, and a lightweight frontend shell. Email parsing is intentionally not implemented yet.

## Stack
- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Static HTML/CSS/JS served by the API

## Local setup
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

### Environment configuration
Copy `.env.example` to `.env` and fill in values as needed.
Environment variables control database path, auth, OAuth credentials, and logging.
Logging defaults to `info` and avoids sensitive content.

### Password auth
Email/password sign-up requires a password (minimum 12 characters). Passwords are hashed (bcrypt) and never stored in plaintext.
Sessions are stored in SQLite with httpOnly cookies and SameSite=Lax, and become secure cookies in production.

### CSRF protection
State-changing API requests require a CSRF token.
- Fetch token: `GET /api/auth/csrf` → `{ csrfToken }`
- Send the token on every `POST`, `PATCH`, or `DELETE` to `/api/*` (header `X-CSRF-Token`).
- Requests missing/invalid tokens return `403`.

### Rate limiting (auth endpoints)
Auth routes are rate-limited by IP (and by IP+email for login/signup):
- `POST /api/auth/login`
- `POST /api/auth/signup`
- `/api/auth/google/start`
- `/api/auth/google/callback`

Defaults: 10 requests per 10 minutes. Override with:
```
JOBTRACK_RATE_LIMIT_MAX=10
JOBTRACK_RATE_LIMIT_WINDOW_MS=600000
```

### Google Sign-In (identity)
Create OAuth credentials (Web application) and set:
```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```
Scopes: `openid`, `email`, `profile`.

## Gmail OAuth (read-only)
Create OAuth credentials in Google Cloud and set:
```bash
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REDIRECT_URI=http://localhost:3000/api/email/callback
```
Scope: `https://www.googleapis.com/auth/gmail.readonly`.
This is separate from Google Sign-In (identity) credentials.

Tokens are encrypted at rest using `JOBTRACK_TOKEN_ENC_KEY` (base64 32-byte key):
```bash
JOBTRACK_TOKEN_ENC_KEY=...
```
Generate a key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Migrations
Migrations run automatically on server start. To run them manually:
```bash
node server/src/index.js
```

## Deploy to Render (Express + SQLite)
Render setup:
- Build Command: `npm install`
- Start Command: `npm start`

Provision a Render Disk and mount it at `/var/data`, then set:
```
JOBTRACK_DB_PATH=/var/data/applictus.sqlite
```

Required env vars:
- `JOBTRACK_TOKEN_ENC_KEY=...` (base64 32-byte key)
- `JOBTRACK_DB_PATH=/var/data/applictus.sqlite`
- `GMAIL_CLIENT_ID=...` (if Gmail sync is enabled)
- `GMAIL_CLIENT_SECRET=...`
- `GMAIL_REDIRECT_URI=https://<your-render-url>/api/email/callback`

If you use Google Sign-In:
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `GOOGLE_REDIRECT_URI=https://<your-render-url>/api/auth/google/callback`

Notes:
- The app listens on `process.env.PORT` (Render-provided).
- The local default DB path is used when `JOBTRACK_DB_PATH` is not set.

### Gmail sync
Use the Gmail screen in the UI to run "Sync now", or call:
```
POST /api/email/sync
```
with JSON `{ "days": 30 }` (defaults to 30 days, max 365).
Optional classifier mode:
```
{ "mode": "balanced" }
```
`balanced` captures more job-related emails; `strict` is the default. You can also set
`JOBTRACK_CLASSIFIER_MODE=strict|balanced` as a server default.

### Unsorted events
Job-related messages that cannot be confidently matched are kept in the "Unsorted Events" list.
Use the UI to attach them to an existing application or create a new one.
Auto-created applications require classification confidence >= 0.85 and company confidence >= 0.85.
Known ATS senders can auto-create even if the role is unknown, but ambiguous sender domains stay unsorted.
API helpers:
```
GET /api/email/unsorted
POST /api/email/events/:id/attach
POST /api/email/events/:id/create-application
```

### Role extraction
During sync, Applictus extracts job titles from the email subject, snippet, and (when needed) the
plain-text body. Only the extracted role string plus confidence/source are stored; message bodies
are parsed transiently and discarded.

Debug helpers (dev/admin only):
```
GET /api/email/sync-debug?limit=20&reason=classified_not_job_related
GET /api/email/skipped-sample?days=30&limit=50&reason=not_job_related
```
Set `JOBTRACK_DEV_MODE=1` or `JOBTRACK_ADMIN_EMAIL` to enable.

Suggestion actions:
```
POST /api/applications/:id/suggestion/accept
POST /api/applications/:id/suggestion/dismiss
```

### Manual corrections
Edit metadata, override status, archive, and merge applications:
```
PATCH /api/applications/:id
POST /api/applications/:id/merge
GET /api/applications/archived
```
Use the Archive view in the UI to restore archived applications.

### Dashboard data APIs
Paginated list (filters: status, company, recency_days, min_confidence, suggestions_only):
```
GET /api/applications?limit=25&offset=0
```
Pipeline columns:
```
GET /api/applications/pipeline?per_status_limit=15
```
Application detail with timeline:
```
GET /api/applications/:id
```

### Dev-only events endpoint
Set `JOBTRACK_DEV_MODE=1` or `JOBTRACK_ADMIN_EMAIL=you@domain.com` to access:
```
GET /api/email/events
```

### Seed demo data
```bash
npm run seed
```
Seeded user: `demo@applictus.dev` (password defaults to `applictus-demo-123`).
Optional generator controls:
```
JOBTRACK_DEMO_COUNT=12
JOBTRACK_DEMO_EXTRA_EVENTS=4
JOBTRACK_DEMO_SEED=123
JOBTRACK_DEMO_PASSWORD=applictus-demo-123
```

## Tests
```bash
npm test
```
Tests live in `server/tests` and are run with Node's built-in test runner.

## Status inference
- Auto-apply only when confidence >= 0.90.
- Suggest-only for 0.70-0.89 (user must confirm).
- Ghosted suggestion after 21 days of inactivity for APPLIED/UNDER_REVIEW.
- Terminal statuses (REJECTED, OFFER_RECEIVED) are locked unless user override.

## Known limitations
- Conservative filtering can miss some job-related emails.
- Gmail-only ingestion; no other providers yet.
- Email bodies are not stored; only minimal metadata.

## Status enum
`APPLIED`, `UNDER_REVIEW`, `INTERVIEW_REQUESTED`, `INTERVIEW_COMPLETED`, `OFFER_RECEIVED`, `REJECTED`, `GHOSTED`, `UNKNOWN`

## Structure
- `server/src/index.js`: API + session auth + migrations.
- `server/migrations/001_init.sql`: Core SQLite schema.
- `server/migrations/002_oauth_tokens.sql`: OAuth token storage.
- `server/migrations/003_email_events_metadata.sql`: Email event metadata columns.
- `server/migrations/004_job_application_fields.sql`: Job application matching fields.
- `shared/types.js`: Shared enums.
- `shared/emailClassifier.js`: Conservative job-related email classifier.
- `shared/matching.js`: Conservative thread identity extraction.
- `shared/statusInference.js`: Status inference rules.
- `server/src/matching.js`: Event-to-application matching logic.
- `server/src/statusInferenceRunner.js`: Applies inference to stored applications.
- `web/`: Desktop-first UI shell (auth, Gmail connect, dashboard placeholder).
