# Vercel Deployment (UI + API, same origin)

This project is configured for a single-origin deployment on Vercel:
- **UI**: static assets from `/public`
- **API**: serverless Express under `/api/*`

## Required Vercel Environment Variables
Set these in the Vercel project:

### Core
- `NODE_ENV=production`
- `DATABASE_URL=...` (Supabase Postgres)
- `TRUST_PROXY=1`

### App URLs
- `APP_WEB_BASE_URL=https://applictus.com`
- `APP_API_BASE_URL=https://applictus.com`
- `APP_COOKIE_DOMAIN=` (leave empty for host‑only cookies)

### Auth
- `GOOGLE_AUTH_CLIENT_ID=...`
- `GOOGLE_AUTH_CLIENT_SECRET=...`
- `GOOGLE_AUTH_REDIRECT_URI=https://applictus.com/api/auth/google/callback`
- Backward-compatible fallback envs are still accepted:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`

### Google OAuth scopes
- **Sign in with Google** scopes:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/gmail.readonly`
- **Connect Gmail** scope:
  - `https://www.googleapis.com/auth/gmail.readonly`

### Security
- `JOBTRACK_ENC_KEY=...` (token encryption)

## Notes
- The API is served by `api/[...path].js` which mounts the Express app.
- Static assets are served directly by Vercel from `/public`.
- No frontend framework required.

## Google OAuth Console
Authorized Redirect URIs:
- `https://applictus.com/api/auth/google/callback` (Google sign-in)
- `https://applictus.com/api/email/callback` (Gmail connect)


## Quick Smoke Checks
- `GET https://applictus.com/` → returns the SPA (no 404)
- `GET https://applictus.com/api/health` → `{ ok: true }`
- `GET https://applictus.com/api/auth/session` (with cookies) → user payload
