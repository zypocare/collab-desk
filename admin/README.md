# Miracle admin

The admin panel at **admin.miracleapp.live**: see how Miracle is doing, approve or decline creator sign-ups, and pause or resume creators. It's a small Vite + Svelte single-page app that talks to the same Supabase project as the app (only through the `admin_*` functions, which check the signed-in email is in `app_admins`).

- **Run locally:** copy `.env.example` to `.env` (point it at the local stack, http://127.0.0.1:54321), then `npm install` and `npm run dev` (opens on http://localhost:5180). Local sign-in codes arrive in Mailpit at http://127.0.0.1:54324.
- **Check:** `npm run check` and `npm run build`.
- **Deploy:** from this folder, `npm run build` then `npx wrangler deploy` (it serves `dist/` as the `miracle-admin` Worker on admin.miracleapp.live). Or connect the repo in Cloudflare Workers Builds with root directory `admin`, build command `npm run build`, deploy command `npx wrangler deploy`, and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and `VITE_TURNSTILE_SITE_KEY` if sign-in needs the check) as build variables.
- Add more admins by inserting their email into `public.app_admins`.
