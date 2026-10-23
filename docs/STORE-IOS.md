# Miracle on the App Store

The iPhone app lives in `mobile/ios` (Capacitor, Swift Package Manager). Like Android, it opens
`app.miracleapp.live` in a native shell: Miracle's icon and splash, alerts through Apple's push service, outside
links in the browser. It's built on GitHub's Mac computers (Actions › **iPhone app**), so no Mac is needed:
every run checks the build, and once the secrets below are in, it signs the app and sends it to App Store
Connect (TestFlight). Versions are shared with Android: see [mobile/CHANGELOG.md](../mobile/CHANGELOG.md).

Bundle ID: `live.miracleapp.app` (fixed once published). iPhone only, portrait.

## What only you can do (in this order)

1. **Apple Developer Program** as an organisation, in the Apple Developer app on an iPhone, signed in as
   jitendra@zyposoft.com: ZYPOSOFT TECHNOLOGIES PRIVATE LIMITED, D-U-N-S 772010900, the D&B address,
   website https://zyposoft.com, US$99 a year. Apple may phone to confirm you can sign for the company.
2. **Certificates, IDs & Profiles › Identifiers › +**: App ID `live.miracleapp.app`, tick **Push Notifications**.
3. **Keys › +**: tick **Apple Push Notifications service (APNs)**, download the `.p8` (only once) into
   `D:\Influence-keys`. Ask Claude to put it in the Supabase secrets `APNS_KEY`, `APNS_KEY_ID` (the key's
   10-character ID) and `APPLE_TEAM_ID`. Never paste it in chat.
4. **App Store Connect › Users and Access › Integrations › App Store Connect API › Team keys › +**: role
   **App Manager**, download the `.p8` (only once) into `D:\Influence-keys`, note the Key ID and Issuer ID.
   Ask Claude to put them in the GitHub secrets `APPLE_API_KEY_P8_BASE64`, `APPLE_API_KEY_ID`,
   `APPLE_API_ISSUER_ID` and `APPLE_TEAM_ID` (Membership details shows the Team ID).
5. **App Store Connect › Apps › +**: iOS, name **Miracle: Collabs Made Easy**, English, bundle ID
   `live.miracleapp.app`, SKU `miracle-ios`, full access.
6. Run Actions › iPhone app › **Run workflow**. About 20 minutes later the build is in **TestFlight**: add
   yourself under Internal Testing and install it with Apple's TestFlight app.

## Store listing (ready to paste)

- **Name (30):** Miracle: Collabs Made Easy · **Subtitle (30):** Brand deals for creators
- **Category:** Business (secondary: Productivity) · **Age rating:** answer the questionnaire like Play's
  (users message each other; no mature content); restrict to 17+ only if Apple's answers suggest it.
- **Promotional text / description / keywords:** the description in [STORE-ANDROID.md](STORE-ANDROID.md);
  keywords (100 characters): `creator,influencer,brand deals,collab,media kit,invoice,GST,UPI,instagram,rate card`
- **Screenshots:** `docs/store/ios/` (6.9-inch, 1320 × 2868), made by `node mobile/store/make.mjs`.
- **Support URL:** https://www.miracleapp.live · **Privacy policy:** https://www.miracleapp.live/privacy
- **App Privacy:** the same data as Play's Data safety (name, email, phone, address, other info, other
  financial info, messages, photos, videos, audio, files, app interactions, crash data, device ID), all
  linked to the user, none used for tracking.
- **Sign-in for review:** `review@miracleapp.live` and its password (typed by you); add "type the email
  and a password box appears".
- **Account deletion:** in the app (Settings › Sign-in & account) and https://www.miracleapp.live/data-deletion.

## What Apple looks at more than Google

- **Not just a website (guideline 4.2):** Miracle has native alerts, a launch screen and an offline screen;
  add more native touches if the review asks.
- **No buying inside the app** unless it uses Apple's in-app purchase: if plans are sold, sell them on the
  website and don't show prices or buy buttons in the iPhone app.
- **Sign in with Apple** is only required for apps that offer Google or Facebook sign-in; Miracle uses an
  email code, so it isn't needed.
