# Split Deployment (Vercel UI + Render API)

This repo supports running the UI at `https://applictus.com` and the API at `https://api.applictus.com`.

## Domains + DNS
1. **Vercel**: set the UI project domain to `applictus.com`.
2. **Render**: set the API service domain to `api.applictus.com`.
3. **DNS (Namecheap)**:
   - `applictus.com` → Vercel (A/ALIAS per Vercel instructions).
   - `api.applictus.com` → Render (CNAME per Render instructions).

## Render (API) Environment Variables
Required:
- `NODE_ENV=production`
- `APP_WEB_BASE_URL=https://applictus.com`
- `APP_API_BASE_URL=https://api.applictus.com`
- `APP_COOKIE_DOMAIN=.applictus.com` (recommended for cross-subdomain cookies)
- `DATABASE_URL=...` (Supabase/Postgres)
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `JOBTRACK_ENC_KEY=...` (token encryption)
- `TRUST_PROXY=1` (required behind Render proxy)

Optional:
- `GOOGLE_REDIRECT_URI=https://api.applictus.com/api/auth/google/callback`
- `JOBTRACK_LOG_LEVEL=debug` (temporary troubleshooting)

## Vercel (UI) Configuration
The frontend defaults to `https://api.applictus.com` when not on localhost.

If you want to override:
1. Set `<meta name="app-api-base-url" content="https://api.applictus.com">` in `web/index.html`, or
2. Inject `window.APP_CONFIG = { API_BASE_URL: 'https://api.applictus.com' }` before `app.js`.

Local dev automatically targets `http://localhost:3000`.

## Google OAuth Console
Add to **Authorized JavaScript origins**:
- `https://applictus.com`

Add to **Authorized redirect URIs**:
- `https://api.applictus.com/api/auth/google/callback`

## Health & Session Checks
- `GET https://api.applictus.com/api/health` → `{ ok: true }`
- `GET https://api.applictus.com/api/auth/session` (with cookies) → user payload

## Manual Checklist
1. Load `https://applictus.com` and sign up.
2. Confirm session cookie is set and login persists on refresh.
3. Connect Gmail and confirm redirect returns to `https://applictus.com/#account`.
4. Run Gmail sync and confirm data appears in dashboard.

