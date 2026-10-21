# Letting any creator connect Instagram (Meta review)

Right now the Meta app is in **Development** mode. Only Instagram accounts that have a role on the
app (testers) can connect. For any creator to connect, Meta needs three things:

1. **Business Verification**: Meta confirms who runs Miracle.
2. **App Review**: Meta checks how Miracle uses each Instagram permission, then grants Advanced Access.
3. **Live mode**: you switch the app from Development to Live.

All of it is free. Verification takes a few days to a couple of weeks. Review usually takes days,
and a first submission is often sent back once. Start Business Verification first, because it takes
the longest.

---

## Until then: add each new creator as a tester

1. developers.facebook.com → your app → **App roles → Roles** → **Add people** → **Instagram Tester** →
   type their Instagram username.
2. The creator opens Instagram → **Settings → Website permissions (Apps and websites) → Tester invites**
   and accepts.
3. They can then connect from their studio (My page → Connect Instagram).

---

## Step 1. Settings in the Meta app (once)

**App settings → Basic**
- App icon: `docs/miracle-icon-1024.png` (1024 × 1024, the current logo).
- Privacy policy URL: `https://miracleapp.live/privacy`
- User data deletion: choose **Data deletion instructions URL** → `https://miracleapp.live/data-deletion`
- Category: Business. App domains: `miracleapp.live`. Contact email: `contact@miracleapp.live`.

**Instagram → API setup with Instagram login → Business login settings**
- OAuth redirect URIs: add
  `https://qzsfuvcxpqaavmwkxutt.supabase.co/functions/v1/instagram-auth`
  This is the one address every creator now comes back to after allowing access. Add it **before**
  anyone reconnects. You can leave the old `…/studio/instagram` addresses there.

**Instagram → Webhooks**: already set up for `messages` (see `docs/SETUP.md`). Nothing new.

## Step 2. Business Verification

1. App settings → Basic → **Verification** → **Start verification** → choose or create a business
   portfolio (for example "Miracle").
2. In business.facebook.com → **Settings → Security Center → Start verification**. Enter the legal
   business name, address, phone and website (`miracleapp.live`) **exactly** as they appear on your
   documents.
3. Upload a document with that legal name. In India, people commonly use a GST certificate, a
   Udyam (MSME) registration certificate, or a PAN or bank statement in the business name. Meta's
   list changes, so check the options it shows you.
4. Confirm by email or phone. An email at your own domain (contact@miracleapp.live) helps.
   Optional: verify the domain in **Brand safety → Domains** (a DNS TXT record on miracleapp.live in
   Cloudflare).
5. Back in App settings → Basic, check that the app shows as connected to a **verified** business.

## Step 3. A test setup for the reviewer

Meta's reviewers sign in and try every permission themselves. If they can't get in, the whole
submission is rejected. Miracle signs people in with email codes, which a reviewer can't receive, so
there is a password sign-in that only appears at `/login?pw=1`.

1. Supabase dashboard → **Authentication → Users → Add user → Create new user**: email
   `review@miracleapp.live`, a strong password you type yourself (never paste it into a chat), and tick
   **Auto confirm user**.
2. Sign in at `https://demo.miracleapp.live/login?pw=1` with that email and password.
3. Open `https://demo.miracleapp.live/join` (you're already signed in), claim **demo**, and send the request.
4. Approve it in the admin panel (admin.miracleapp.live), then sign in again at the step 2 address. It
   now opens the demo studio.
5. Fill the demo studio with a little sample data: rates, a couple of collabs.
6. Make a test Instagram **professional** (Creator or Business) account the reviewer can use, add it as
   an Instagram Tester (see above), and connect it to the demo studio once to check it works.

## Step 4. Submit App Review

Instagram → API setup with Instagram login → **Complete app review** → **Continue to app review** →
App Review → Requests → **Edit**.

Ask only for what Miracle uses (asking for more gets the submission refused):

| Permission | What to write | What the screencast shows |
| --- | --- | --- |
| `instagram_business_basic` | Creators connect their own professional account so Miracle shows their profile and follower numbers on their page and media kit. | Sign in at demo.miracleapp.live → My page → Connect Instagram → Instagram's allow screen → back in Miracle with name, photo and followers. |
| `instagram_business_manage_insights` | Miracle shows the creator's reach, views and audience to brands they choose to share it with, and in results reports. | The insights page and a collab's results report filling with real numbers. |
| `instagram_business_manage_messages` | Creators read brand-collaboration DMs and reply from Miracle. Non-collaboration messages are not stored. | From a second account, send a brand-style DM → it appears in Miracle's inbox → reply from Miracle → the reply shows in Instagram. |
| `instagram_business_content_publish` | Creators schedule approved collaboration posts and Miracle publishes them to their own account. | Schedule a post in Miracle → it appears on the Instagram account. |

For each one: a short description, a screencast of just that permission (English UI, captions where a
step isn't obvious), and agree to the allowed use.

**Reviewer instructions** (paste in the testing section):
1. Open `https://demo.miracleapp.live/login?pw=1`, sign in with the review email and password.
2. My page → Connect Instagram, and sign in with the test Instagram account below.
3. Then the steps for each permission, as in the table.

Also fill in the data handling questions: data is processed by Supabase, Cloudflare, Vercel and an
email delivery service (see the privacy policy).

## Step 5. After approval

1. Switch the app to **Live** (the toggle at the top of the App Dashboard).
2. Any creator with a professional Instagram account can now connect. Personal accounts can't; they
   switch for free in Instagram → Settings → Account type and tools → Switch to professional account.
3. You no longer need to add testers.

Sources: Meta's [App Review for Instagram](https://developers.facebook.com/docs/instagram-platform/app-review)
and [Business Verification](https://developers.facebook.com/docs/development/release/business-verification)
pages. Menu names in Meta's dashboard change from time to time; the steps stay the same.
