# Miracle admin

The admin panel at **admin.miracleapp.live**, a CRM for all of Miracle: a dashboard (key numbers, funnels, the collab pipeline, what needs an admin), list views with saved views, filters, sorting, bulk actions and CSV export, record pages with timelines, notes and related records, Ctrl K search across every kind of record, and an audit trail of every admin action. It's a small Vite + Svelte single-page app that talks to the same Supabase project as the app, only through the `admin_*` functions (each checks the signed-in email is in `app_admins`).

- **Built so far (phase 1):** Dashboard; People (Sign-ups, Creators, Creator teams, Brand logins, Brand workspaces) with record pages; Audit trail. Support, Safety, Problems and Brands are the earlier screens inside the new shell. Deals, Automation, Growth and System controls come in later phases.
- **Adding a list screen:** add a branch to `private.admin_rows(kind)` in SQL and a config to `src/lib/crm/lists.ts`; `ListView.svelte` does the rest. Every new admin action calls `private.admin_log(...)` so it shows in the audit trail.

- **Run locally:** copy `.env.example` to `.env` (point it at the local stack, http://127.0.0.1:54321), then `npm install` and `npm run dev` (opens on http://localhost:5180). Local sign-in codes arrive in Mailpit at http://127.0.0.1:54324.
- **Check:** `npm run check` and `npm run build`.
- **Deploy:** from this folder, `npm run build` then `npx wrangler deploy` (it serves `dist/` as the `miracle-admin` Worker on admin.miracleapp.live). Or connect the repo in Cloudflare Workers Builds with root directory `admin`, build command `npm run build`, deploy command `npx wrangler deploy`, and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and `VITE_TURNSTILE_SITE_KEY` if sign-in needs the check) as build variables.
- Add more admins by inserting their email into `public.app_admins`.
- Live: Cloudflare Workers Builds deploys it from `main` (root directory `admin`) on every push.
