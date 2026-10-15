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
