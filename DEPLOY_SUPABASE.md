# Deploying Applictus with Supabase Postgres on Render

1) Configure Render environment
   - Set `DATABASE_URL` to your Supabase connection string (Transaction Pooler).
   - Ensure it includes `sslmode=require`. If not, add `?sslmode=require` (the server enforces SSL anyway).

2) Create the schema once in Supabase
   - From repo root run:
     ```
     node server/scripts/print-postgres-schema.js
     ```
   - Copy the output and paste it into the Supabase SQL Editor, then run it.

3) Verify connectivity and schema
   - With `DATABASE_URL` set locally:
     ```
     node server/scripts/check-postgres.js
     ```
   - If it says tables not found, repeat step 2.

4) Redeploy on Render
   - Redeploy the service so it uses Postgres instead of the local SQLite file.

Notes
- Migrations are **not** auto-run in production; apply the SQL manually as above.
- SQLite remains the default for local dev/tests when `DATABASE_URL` is unset.
