# Miracle on Google Play

The Android app lives in `mobile/` (Capacitor). It opens `app.miracleapp.live` inside a native shell
with Miracle's icon, splash, back button, outside links in the phone's browser, and alerts through
Firebase. GitHub builds it (Actions › **Android app**): a test APK on every change, and a signed
`.aab` for Play once the upload key is set.

App id: `live.miracleapp.app` (fixed forever once published).

## What only you can do (in this order)

1. **Google Play Console account** as an organisation (Zyposoft Technologies Private Limited):
   play.google.com/console, one-time USD 25. Organisation accounts need the company's
   **D-U-N-S number** (free from Dun & Bradstreet, takes a few days if you don't have one) and
   skip the "12 testers for 14 days" rule that personal accounts have.
2. **Firebase project** (free) for alerts: console.firebase.google.com › Add project "Miracle".
   - Add an **Android app** with package `live.miracleapp.app`, download `google-services.json`,
     and put its whole text in the GitHub secret `ANDROID_GOOGLE_SERVICES_JSON`.
   - Project settings › Service accounts › **Generate new private key**: put the whole JSON in
     the Supabase secret `FIREBASE_SERVICE_ACCOUNT` (Edge Functions › Secrets). Never paste it in chat.
3. **Upload key**: ask Claude to make one. It is created on your computer, kept outside the
   repository, and stored in the GitHub secrets `ANDROID_KEYSTORE_BASE64`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Keep a backup copy.
4. In Play Console: create the app, turn on **Play App Signing**, upload the first `.aab`
   (Actions › Android app › Run workflow › download "miracle-android-store-bundle").
5. Copy the **app signing key's SHA-256** (Play Console › Setup › App signing) to Claude: it goes in
   `miracleapp.live/.well-known/assetlinks.json`, so Miracle links open straight in the app.

## Store listing (ready to paste)

- **App name (store title, 30 max):** Miracle: Collabs Made Easy · the name under the icon stays Miracle
- **Category:** Business · **Contact:** contact@miracleapp.live · **Website:** https://www.miracleapp.live
- **Short description (80):** Brand deals for Indian creators: rates, media kit, invoices and on-time pay.
- **Full description:**

  Miracle is the business side of being a creator in India.

  Get found: one link with your rates, packages, open weeks and past brands, a media kit that
  updates itself from Instagram, and replies to "COLLAB" comments by DM.

  Close better deals: every request scored on money, time and fit; the brand's agreement checked
  for what creators usually push back on; and what creators your size really charge.

  Get paid on time: quotes with an advance, GST invoices with a UPI QR, reminders that go by
  themselves, and a formal payment demand when a brand is very late.

  Grow: a check-up of your own reels, what's working, and what to post next.

  Stay tax-ready: your GST limit with barter counted, TDS by brand, and a Form 26AS check.

  An AI desk that knows your requests, money and calendar, in English, Hindi or Kannada, with
  autopilots you switch to Ask me or Auto. Brands pay you directly: no commission, ever.

- **Graphics:** ready in `docs/store/android/`: icon 512 px, feature graphic 1024×500 and five
  phone screenshots (1080×1920). Remake them with `node mobile/store/make.mjs`.
- **Privacy policy:** https://www.miracleapp.live/privacy · **Account deletion:**
  https://www.miracleapp.live/data-deletion (and in the app: Settings › Sign-in & account).
- **App access for reviewers:** the demo creator (see `docs/META-REVIEW.md`): sign in at
  `/login?pw=1` with the review login. Give the email and password in Play Console only.
- **Data safety:** collects name, email, phone (optional), business info (rates, invoices,
  bank/UPI details the creator types), Instagram account data she connects, and app activity for
  crash reports. Encrypted in transit, not sold, user can delete. No payments are processed.
- **Content rating:** questionnaire › Utility/productivity, no user-generated public content
  beyond the creator's own page.

## Known limits of this first version

- Alerts need steps 2 above; until then the app works, just without phone alerts.
- After connecting Instagram, the return lands on her own address; native extras (alerts, back
  button) come back the next time the app opens.
- iPhone comes next (needs a Mac or a cloud Mac build, an Apple Developer account at USD 99/year,
  and Apple's push key).
