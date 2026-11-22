# Miracle app versions

What changed in each version of the phone app's shell, newest first. The text under each version is
what goes into Play Console's release notes.

**Most changes never need a new version.** The app loads Miracle's screens from the server, so new
features and fixes go live for everyone as soon as the web app is deployed. A new store version is only
needed when the shell itself changes: a new permission (microphone, camera), plugin, icon, splash
screen, app name, link handling or Android settings.

How to ship one:
1. Change `"version"` in `mobile/package.json` (1.0.0 → 1.0.1 for a fix, 1.1.0 for something bigger).
2. Add a `## <version>` section below with the release notes (the build stops without one).
3. Push to main. GitHub builds it (Actions › Android app) and names the files with the version and the
   build number, like `miracle-android-store-bundle-v1.0.1-build12`.
4. Play Console › Production › Create new release › upload the `.aab` › paste the notes › send for review.
5. Fill in the "Build" and "Sent" lines below.

## Planned

- Add microphone permission for voice notes and voice typing in the phone app.
## 1.1.3
## 1.1.3
- Added Bulk Payouts & Auto-TDS (194J 10% / 194C 2% / 0%) with bank-ready NEFT CSV export and batch UTR mark-paid in Brand Payments
- Added Creator Growth OS (`/studio/suite`) matching the Creator module UI
- Added off-platform WhatsApp Smart Contract & Draft Approval links (`/c-approve/[token]`) for Creators
- Added Fair Rate, Usage-Rights & Net Take-Home calculator for Creators
- Added private Brand CRM & payment memory for Creators
- Added Creator Viral Upsell & YouTube Shorts / Raw UGC post tracker
- Added CA-ready Form 26AS TDS & GST Tax Pack CSV and 1-click Creator Proof Report PDF
- Added Bio Link "Work With Me" Budget Gate to filter low-budget inquiries
- Added 8-palette Color Theme configurator (`MoodPicker`) to the Brand side on mobile and desktop
- Synced Brand-side creator engagement rates with Creator profile 30-day Insights and fixed mobile input, pool layout, and build check issues

## 1.1.2
- Added No-login founder / client approval links
- Added Public "Apply to Collab" brand funnel
- Added Creator CRM & negotiation memory
- Added 1-click Campaign Wrap-Up Report
- Added Bank-ready Bulk NEFT + TDS Pack
- Added Live post watchdog & viral alerts
- Added Pre-campaign ROI & budget simulator
- Added YouTube Shorts & UGC-only tracking
## 1.1.1
- 1-tap smart contracts & ASCI checklist
- Timestamped draft comments & brief checklist
## 1.0.9
- Redesigned My Page collab cards to 3-column Instagram profile grid layout
- Added Creator Bio Storefront (0%-fee UPI checkout), Creator Wrapped Story cards, 60-second onboarding, Zero-Login Brand CTAs, Shareable Roster Pitch Decks, and Open Briefs Matchmaking
- Fixed status-bar header alignment and multi-deliverable post linking bug

## 1.0.8

- Fixed keyboard and drawer resizing when adding a collab on Android.
- Kept the drawer title and Next button visible while typing.
- Stabilized the home screen behind the Add a collab drawer.
- Enabled optimized resource shrinking to reduce the Android app's footprint.

## 1.0.7

- Improved scrolling and navigation smoothness.
- Improved keyboard stability when adding collabs.
- Made the Add a collab drawer and message box larger.
- Refreshed collab cards on My Page.
- Faster startup for returning users.

## 1.0.6

Build 19 · sent for review 4 Nov 2026

- A smaller app that uses less memory.
- Fills the screen properly on Android 15 and newer.

## 1.0.5

Build 18 · published 4 Nov 2026

- The new Miracle icon on your home screen and app drawer (it also follows your themed icons on Android 13 and up).

## 1.0.4

Build 17 · sent for review 4 Nov 2026 · published 4 Nov 2026

- The app fills the whole screen on every phone, and the clock and battery icons match the page, light or dark.
- A smaller, quicker app.

## 1.0.3

Build 15 · sent for review 4 Nov 2026 · published 4 Nov 2026

- Share a brand's WhatsApp message to Miracle: it opens in Add collab, already read.

## 1.0.2

- The app answers your touch: a light vibration on taps and a buzz when money or a yes from a brand comes in (turn it off in Settings).

## 1.0.1

- No scrollbar on the side of the screen: pages scroll like a native app.

## 1.0.0

Build 8 · sent for review 24 Oct 2026

- First release of Miracle.
