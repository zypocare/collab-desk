# Letting any creator connect Instagram (Meta App Review)

Until Meta approves the app, only Instagram accounts with a role on it (testers) can connect.
App Review grants **Advanced Access**, so any creator with a professional account can connect.

Where things stand (22 Oct 2026):

| Step | Status |
| --- | --- |
| Business portfolio: Zyposoft Technologies Private Limited | Done |
| Business verification | **Verified** |
| App attached to the portfolio, renamed **Miracle**, new icon | Done |
| Privacy and data-deletion pages name Zyposoft | Done (www.miracleapp.live) |
| Return address `https://qzsfuvcxpqaavmwkxutt.supabase.co/functions/v1/instagram-auth` | Added |
| Demo creator `demo.miracleapp.live` with @memes_unlimited_official connected | Done |
| App Review request with 5 permissions | **To submit** |

Until approval, add each new creator as a tester: developers.facebook.com → your app → **App roles →
Roles → Add people → Instagram Tester**. The creator accepts at instagram.com → **Settings → Apps and
websites → Tester invites**, then connects from their studio.

---

## 1. Before recording: get the demo account ready

**a. A reviewer login.** Meta's reviewers can't receive email codes, so they sign in with a password
at `/login?pw=1`.

1. Supabase dashboard → **Authentication → Users → Add user → Create new user**.
   Email `review@miracleapp.live`, a strong password you type yourself, tick **Auto confirm user**.
2. Sign in to `https://demo.miracleapp.live` as the demo creator (no-reply@miracleapp.live) →
   **Settings → Team** → invite `review@miracleapp.live` as **Manager**.
3. Check it works: in a private window open `https://demo.miracleapp.live/login?pw=1` and sign in with
   the review email and password. It should open the demo studio.

**b. Allow DMs and posting.** Demo studio → **Settings → Profile & Instagram → Allow DMs and
posting**, and accept on Instagram's screen. Without this, the messages and publishing parts can't
be shown.

**c. A collab with an approved draft**, for the publishing scene. In the demo studio: **Collabs → add
one** (a brand name and a Reel), open it, **upload a draft with an image or video file**, and have it
approved. You can approve it from the brand's link, or ask Claude to mark it approved. An approved
draft with a file shows **Schedule** in the collab.

**d. A second Instagram account to send a DM from**, for example your personal one.

Important: Miracle only keeps DMs that look like a **brand collaboration**. Other messages are checked
and dropped. So the test DM must read like a real brand enquiry (see scene 3).

---

## 2. The recording

One screen recording, about 3–4 minutes, English UI, no sound needed. Add short captions with any
editor (Clipchamp on Windows works) where a step isn't obvious. Upload the same video to each
permission, or cut it into one clip per permission.

**Scene 1. Sign in and connect** (instagram_business_basic, public_profile)
1. Open `https://demo.miracleapp.live/login?pw=1`, sign in with the review login.
2. **Settings → Profile & Instagram → Connect Instagram** (Disconnect first if it is already connected).
3. Instagram's allow screen shows "Miracle" and the permissions → **Allow**.
4. Back in Miracle: name, profile photo, followers and recent posts appear.

**Scene 2. Insights** (instagram_business_manage_insights)
1. Open **Brand page** (or `demo.miracleapp.live/insights`): reach, views, engagement, audience by age
   and city.
2. Open **Content**: each post with its views and reach.

**Scene 3. Messages** (instagram_business_manage_messages)
1. On a phone, from the second Instagram account, send @memes_unlimited_official:
   *"Hi! I'm Riya from Kora Botanicals. We'd love a paid Reel collaboration for our new face oil next
   month. What are your rates?"*
2. In Miracle, open **Inbox**: the message appears as a collab enquiry. Open it.
3. Type a reply in Miracle and send it: *"Thanks Riya! My rates are on my page, happy to share a quote."*
4. Show the reply arriving in Instagram on the phone.

**Scene 4. Publishing** (instagram_business_content_publish)
1. **Collabs** → the collab with the approved draft → **Schedule** → pick "now" or a time a minute
   ahead → confirm.
2. When it shows **Published**, click **View on Instagram**: the post is on @memes_unlimited_official.
   (You can delete the test post afterwards.)

---

## 3. Text to paste into the review form

### instagram_business_basic

> Miracle (miracleapp.live) is a business tool for Instagram creators who work with brands. A creator
> connects their own Instagram professional account in Miracle's settings. We use
> instagram_business_basic to read the creator's username, name, profile picture, follower count and
> their own posts. This is shown on the creator's Miracle page and media kit so brands can see who they
> are working with, and it lets Miracle find the post a creator made for a brand collaboration so the
> collaboration can be marked as live. We only read the account of the creator who connected it, and
> the creator can disconnect at any time.

### instagram_business_manage_insights

> Creators use Miracle to share their real performance with brands instead of screenshots. We use
> instagram_business_manage_insights to read reach, views, engagement and audience breakdowns (age,
> gender, city, country) for the creator's own account and posts. Miracle shows these to the creator,
> on an insights page the creator chooses to share with brands, and in results reports for the
> specific posts a creator made for a brand. Numbers are only shown where the creator turns sharing on.

### instagram_business_manage_messages

> Brands usually start collaborations by sending a creator an Instagram DM. We use
> instagram_business_manage_messages so the creator sees these brand enquiries in Miracle's inbox next
> to the deal they belong to, and can reply from Miracle. Miracle only keeps messages that are about a
> brand collaboration; other messages are checked automatically and not stored, and the creator can
> mark any chat as "not a collab". Replies are sent only by the creator, by hand, within Instagram's
> 24-hour messaging window. Miracle never sends automated or bulk messages.

### instagram_business_content_publish

> When a brand approves a creator's draft for a paid collaboration in Miracle, the creator can schedule
> that approved post to go live on their own Instagram account at the agreed time, optionally adding
> the brand as a collaborator. We use instagram_business_content_publish only for this: publishing a
> post the creator chose, from their own approved draft, to their own account, when they press
> Schedule. Miracle never posts without the creator's action.

### public_profile

> Used only for the standard sign-in with Instagram. We don't use it for anything else.

### Reviewer instructions (the "testing" box)

> 1. Open https://demo.miracleapp.live/login?pw=1 and sign in with:
>    Email: review@miracleapp.live
>    Password: (type it here in Meta's form)
> 2. Go to Settings → Profile & Instagram → Connect Instagram, and sign in with the test Instagram
>    account: @memes_unlimited_official, password: (type it here in Meta's form). This account is a
>    tester on the app.
> 3. instagram_business_basic: after connecting, the profile, followers and posts appear on the
>    Settings and Brand page screens.
> 4. instagram_business_manage_insights: open Brand page or demo.miracleapp.live/insights for reach,
>    views and audience.
> 5. instagram_business_manage_messages: send a brand-style DM to @memes_unlimited_official from any
>    Instagram account (for example: "Hi, we're a skincare brand and would like a paid Reel
>    collaboration. What are your rates?"). It appears in Miracle's Inbox; open it and reply.
> 6. instagram_business_content_publish: Collabs → the collab with an approved draft → Schedule. The
>    post is published to @memes_unlimited_official.

The Instagram password goes only into Meta's form, never into a chat. If Instagram asks for a login
code when the reviewer signs in, Meta's reviewers usually contact you; keep the phone on that account
nearby for a few days.

### Data handling questions

- **Who processes the data for you:** Supabase (database, sign-in, files), Cloudflare (runs the app
  and optional AI features), Google Gemini (backup for optional AI features; incoming Instagram
  messages are never sent to it), Vercel (website), an email delivery service, Meta.
  This matches the privacy policy.
- **Company:** Zyposoft Technologies Private Limited, India.
- **Do you sell or share data with third parties for advertising?** No.
- **Data deletion:** `https://www.miracleapp.live/data-deletion`; requests to contact@miracleapp.live.
- **Privacy policy:** `https://www.miracleapp.live/privacy`.

---

## 4. After approval

1. Check **Publish** still shows the app as Published (live).
2. Any creator with a professional Instagram account can connect. Personal accounts switch for free:
   Instagram → Settings → Account type and tools → Switch to professional account.
3. No more testers needed.

If Meta sends it back, the message names the permission and the reason, usually "the video doesn't
show the permission being used". Fix that part and resubmit; the approved permissions stay approved.
