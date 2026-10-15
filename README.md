# Collab Desk

A private workspace for an Instagram creator to manage brand collaborations, plus a page where brands send requests and follow them.

- **Creator studio** (`/studio`): today's to-dos, collab board, calendar, payments, brand history, brand page settings.
- **Brand area** (`/brand`): brands sign in with an email code, send requests and see only their own requests.
- **Public page** (`/`): the creator's profile with "Send a request".

## How it's built

| Part | Tech | Where |
|---|---|---|
| Website | SvelteKit (static single-page app) | `web/` → Cloudflare Pages |
| Database, login, security rules | Supabase (Postgres + Auth) | `supabase/migrations/` |
| Emails | Supabase Edge Function + your Gmail/Zoho | `supabase/functions/process-outbox/` |
| Scheduled jobs | Postgres cron + GitHub Actions | `supabase/migrations/…_jobs.sql`, `.github/workflows/` |

Security: brands never read tables directly. They use database functions that only return their own requests
(`supabase/migrations/…_brand_api.sql`). Only the email set as `creator_email` can open the studio.

## Getting started

See **[docs/SETUP.md](docs/SETUP.md)** for going live, and its last section for running it on your computer.

The first design prototype is kept in `prototype/collab-desk.html`.
