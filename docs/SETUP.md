# Setup guide

This takes the app from your computer to a live website. Everything here uses free plans.
Do the steps in order; each one takes 2 to 10 minutes.

You will create accounts on: **GitHub**, **Supabase**, **Cloudflare**, and set up **Gmail** (or Zoho) for sending email.

---

## 1. Put the code on GitHub (private)

1. Create a **private** repository on GitHub, for example `collab-desk`.
2. In this folder (`D:\Influence`) run:

   ```bash
   git add .
   git commit -m "Collab Desk"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/collab-desk.git
   git push -u origin main
   ```

## 2. Create the Supabase project (database + login)

1. Go to <https://supabase.com>, sign up, **New project**.
   - Region: **Mumbai (ap-south-1)**, so it's fast in India.
   - Set a strong **database password** and save it in your password manager.
2. When it's ready, open **Project Settings → API** and note:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon / publishable key** (safe to put in the website)
   - The **project ref** is the `xxxx` part of the URL.
3. Create an access token at <https://supabase.com/dashboard/account/tokens> (for the deploy job).

### Push the database

From `D:\Influence`:

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

This creates every table, the security rules and the background jobs. (The sample data in
`supabase/seed.sql` is **not** pushed; the live database starts empty.)

### Tell the database who the creator is

In Supabase, open **SQL Editor** and run (change the values):

```sql
update public.creator_settings set
  creator_email = 'her-email@gmail.com',   -- the ONLY email that opens the studio
  display_name  = 'Her Name',
  handle        = 'her_instagram_handle',
  niche         = 'Lifestyle, travel, fashion',
  city          = 'Bangalore',
  site_url      = 'https://your-domain.com' -- or the pages.dev address from step 5
where id = 1;
```

Everything else (followers, rates, goal, app name) she can change later on the **My page** screen.

## 3. Email: Gmail (or Zoho) for sign-in codes and notifications

### Gmail

1. Turn on **2-Step Verification** for the Gmail account: <https://myaccount.google.com/security>.
2. Create an **App password**: <https://myaccount.google.com/apppasswords> → name it "Collab Desk" → copy the 16 letters.

| Setting | Value |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `465` |
| User | the full Gmail address |
| Password | the 16-letter app password |

Gmail allows about 500 emails a day.

### Zoho (optional)

Same as above with host `smtp.zoho.in` (India accounts), port `465`, and a Zoho **app-specific password**.
Zoho's free plan may refuse outside apps. If sign-in emails don't arrive, use Gmail.

### a) Sign-in code emails (Supabase Auth)

In Supabase:

1. **Authentication → Emails → SMTP Settings** → enable custom SMTP, fill in the table above.
   Sender name: her name. Sender email: the Gmail address.
2. **Authentication → Emails → Templates**:
   - **Magic link**: subject `Your sign-in code: {{ .Token }}`, body = paste the contents of `supabase/templates/otp.html`.
   - **Confirm signup**: same subject and body.
3. **Authentication → Rate limits**: raise "emails sent per hour" to 30.
4. **Authentication → URL configuration**: Site URL = your website address.

### b) Notification emails (requests, status updates)

These are sent by the `process-outbox` server function. Give it the same email settings plus a
random secret (any long random text, for example from <https://www.uuidgenerator.net>):

```bash
npx supabase secrets set SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=her-email@gmail.com SMTP_PASS=the-app-password "SMTP_FROM=Her Name <her-email@gmail.com>" CRON_SECRET=PASTE-A-LONG-RANDOM-TEXT
npx supabase functions deploy
```

This deploys all server functions:

| Function | What it does |
|---|---|
| `process-outbox` | Sends notification emails (requests, quotes, drafts, status updates) |
| `daily-digest` | The 9 AM summary by email and Telegram |
| `telegram-connect` | Connects her Telegram from the **My page** screen |
| `calendar` | The private calendar link for Google Calendar or iPhone |
| `payment-reminders` | Polite payment reminders to brands (10 AM daily) |
| `bank-alert` | Matches bank "credited" emails to invoices |
| `instagram-auth` | Connects her Instagram |
| `instagram-sync` | Daily Instagram numbers, go-live detection and results reports (6 AM) |

### c) Telegram (optional, for the 9 AM summary on her phone)

1. In Telegram, open **@BotFather**, send `/newbot`, pick a name (for example "Nivi Collabs") and a username ending in `bot`.
2. Copy the **token** BotFather gives you and save it as a secret:

   ```bash
   npx supabase secrets set TELEGRAM_BOT_TOKEN=PASTE-THE-TOKEN
   ```

3. In the app: **My page → Reminders → Telegram → Connect**, tap **Start** in Telegram, then **I've tapped Start**.

Then, in **SQL Editor**, tell the database where the function lives (same secret as above):

```sql
insert into private.job_config (key, value) values
  ('functions_url', 'https://YOUR-PROJECT-REF.supabase.co/functions/v1'),
  ('cron_secret',   'PASTE-THE-SAME-LONG-RANDOM-TEXT')
on conflict (key) do update set value = excluded.value;
```

### d) Bank alerts (optional, marks invoices paid automatically)

1. Make sure your bank emails you when money is credited (most banks have this in net banking → alerts).
2. Follow the steps at the top of `apps-script/gmail-watcher.gs`. You copy two values from the app
   (**My page → Billing and invoices → Address / Private key**) into the script.
3. When a credit matches an invoice (by invoice number in the UPI note, or by the exact amount), the invoice
   is marked paid and you get an email (and a Telegram message, if connected). Anything else waits in
   **Payments → Bank credits** for you to match by hand.

### e) Instagram (live stats, automatic go-live, results reports)

Do this after the website is online (step 5): Instagram only sends people back to an `https://` address.

1. **Her Instagram account:** Instagram app → Settings → Account type and tools → **Switch to professional account → Creator**. Free, and nothing changes for her followers.
2. **Create the Meta app:** go to <https://developers.facebook.com/apps> → **Create app**. Choose the Instagram use case ("Manage messaging & content on Instagram") and app type **Business**.
3. In the app: **Instagram → API setup with Instagram login**.
   - Under **Set up Instagram business login → Business login settings**, add the redirect address
     `https://your-domain.com/studio/instagram` (use your real address, exactly).
   - Copy the **Instagram app ID** and **Instagram app secret** shown there (not the Facebook app ID).
4. **App roles → Roles → Add people → Instagram tester** → her Instagram username. She accepts it in the
   Instagram app (Settings → Website permissions → Apps and websites → Tester invites).
   The app can stay in **Development** mode because only her own account uses it; no review by Meta is needed.
5. Give the server the app keys and deploy the functions:

   ```bash
   npx supabase secrets set INSTAGRAM_APP_ID=PASTE-APP-ID INSTAGRAM_APP_SECRET=PASTE-APP-SECRET
   npx supabase functions deploy
   ```

6. In Cloudflare Pages, add the environment variable `VITE_INSTAGRAM_APP_ID` with the same app ID, and redeploy.
7. In the app: **My page → Instagram → Connect Instagram**, sign in, allow access. Done.

From then on, every morning at 6:
- her follower count, engagement and average views update on the brand page, with the audience (age, gender, top cities) once she has 100+ followers;
- a post that @mentions a brand she has a confirmed collab with moves that collab to **Live**, tells the brand, and checks the caption for #ad;
- 7 days after a collab post, a **results report** is made. By default she checks it and presses **Send to brand** (she can switch to automatic in My page).

The 60-day Instagram access renews itself. If Instagram ever refuses it (for example after a password change), My page shows it and she presses **Reconnect**.

> Local development uses a simulated Instagram account (`IG_MOCK=1` in `supabase/functions/.env`). Never set `IG_MOCK` on the live server.

## 4. Bot protection (Cloudflare Turnstile)

1. In Cloudflare → **Turnstile → Add widget**. Hostnames: your domain and `*.pages.dev`. Mode: **Managed**.
2. Copy the **site key** (for the website, step 5) and the **secret key**.
3. In Supabase → **Authentication → Attack Protection → CAPTCHA** → enable, provider **Turnstile**, paste the secret key.

## 5. Put the website online (Cloudflare Pages)

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → pick the repository.
2. Build settings:
   - Framework preset: **None**
   - Root directory: `web`
   - Build command: `npm run build`
   - Build output directory: `build`
3. Environment variables:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL from step 2 |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key |
   | `VITE_TURNSTILE_SITE_KEY` | Turnstile site key |
   | `VITE_INSTAGRAM_APP_ID` | Instagram app ID (step 3e, can be added later) |
   | `NODE_VERSION` | `22` |

4. **Save and deploy.** You'll get an address like `collab-desk.pages.dev`.
5. Domain (when you have it): **Custom domains → Set up a domain**. Then update `site_url`
   (SQL from step 2 or the **My page** screen) and Supabase **URL configuration**.

From now on, every `git push` updates the website automatically.

## 6. Automatic jobs on GitHub

In GitHub → your repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value | Used by |
|---|---|---|
| `SUPABASE_URL` | Project URL | Keep database awake (daily) |
| `SUPABASE_ANON_KEY` | anon key | Keep database awake |
| `SUPABASE_DB_URL` | Supabase → **Connect** → *Session pooler* connection string, with your DB password filled in | Weekly backup |
| `BACKUP_PASSPHRASE` | a long passphrase you will remember (needed to open backups) | Weekly backup |
| `SUPABASE_ACCESS_TOKEN` | token from step 2 | Deploy backend |
| `SUPABASE_DB_PASSWORD` | database password | Deploy backend |
| `SUPABASE_PROJECT_REF` | project ref | Deploy backend |

Then open the **Actions** tab, and run **Keep database awake** and **Weekly backup** once by hand to check they pass.

## 7. First sign-in

1. Open the website → **Sign in** → enter **her** email (the one in `creator_email`) → type the code. She lands in her studio.
2. Fill in **My page** (followers, rates, goal).
3. Share the website address with brands. They sign in with their own work email and only ever see their own requests.

---

## Optional extras (all free)

### Free AI (screenshots, reply drafts, captions, pitches)
Nothing to set up. It runs on the website's own Cloudflare server with Cloudflare's free AI
models (`web/worker/index.ts`, the `AI` binding in `web/wrangler.jsonc`). Only the creator can use
it, at most 50 times a day, so it stays inside Cloudflare's free daily allowance.

### Instagram DMs and posting from the app
In the Meta app that Instagram is connected through (developers.facebook.com > your app):
1. **Instagram > API setup with Instagram login > Permissions**: make sure
   `instagram_business_manage_messages` and `instagram_business_content_publish` are added.
   While the app is in development mode they work for accounts that have a role on the app
   (add her Instagram account as an Instagram tester under **App roles** if it isn't already).
2. **Instagram > Webhooks**: set
   - Callback URL: `https://qzsfuvcxpqaavmwkxutt.supabase.co/functions/v1/instagram-webhook`
   - Verify token: the `IG_VERIFY_TOKEN` value in `supabase/functions/.env` (private, not in git;
     it is already saved in the Supabase secrets).
   Then subscribe to the **messages** field.
3. In the app: **My page > Profile & Instagram > Allow DMs and posting**, and accept on Instagram.

### YouTube subscriber count
Videos and Shorts sync without a key. For the subscriber count, create a free key
(console.cloud.google.com > APIs & Services > enable **YouTube Data API v3** > Credentials >
API key) and save it as a Supabase secret:
`npx supabase secrets set YOUTUBE_API_KEY=your-key --project-ref qzsfuvcxpqaavmwkxutt`

## Restoring a backup

1. Download the newest backup from GitHub → **Actions → Weekly backup → latest run → Artifacts**.
2. Decrypt and unpack:

   ```bash
   gpg -d collab-backup-YYYY-MM-DD.tar.gz.gpg > backup.tar.gz
   tar -xzf backup.tar.gz
   ```

3. Load it into an empty Supabase project (psql comes with PostgreSQL):

   ```bash
   psql "YOUR-DB-CONNECTION-STRING" -f backup/roles.sql -f backup/schema.sql -c "SET session_replication_role = replica" -f backup/data.sql
   ```

## Working on the app locally

Needs Node.js 22+ and Docker Desktop.

```bash
npx supabase start        # local database, login and email inbox
npx supabase db reset     # rebuild with sample data
cd web && npm install && npm run dev
```

- App: <http://localhost:5173>. Sign in as the creator with `creator@example.test`.
- Emails (sign-in codes too) land in the local inbox at <http://127.0.0.1:54324>.
- Database admin: <http://127.0.0.1:54323>.
