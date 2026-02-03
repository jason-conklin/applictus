# Deploying Applictus with Supabase Postgres on Render

1) Configure Render environment
   - Set `DATABASE_URL` to your Supabase connection string (Transaction Pooler).
   - Ensure it includes `sslmode=require`. If not, add `?sslmode=require` (the server enforces SSL anyway).

2) Run Postgres migrations (recommended)
   - With `DATABASE_URL` set locally (via `.env`), run:
     ```
     node server/scripts/migrate-postgres.js
     ```
   - Applictus also runs Postgres migrations on startup in production.

3) Verify connectivity and schema
   - With `DATABASE_URL` set locally:
     ```
     node server/scripts/check-postgres.js
     ```

4) Redeploy on Render
   - Redeploy the service so it uses Postgres instead of the local SQLite file.

Notes
- Postgres migrations are auto-run on startup when `DATABASE_URL` is set (and `NODE_ENV !== 'test'`).
- SQLite remains the default for local dev/tests when `DATABASE_URL` is unset.
