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

## 1.0.3 (planned)

- Voice notes and voice typing work in the app (it now asks for the microphone).

## 1.0.2

- The app answers your touch: a light vibration on taps and a buzz when money or a yes from a brand comes in (turn it off in Settings).

## 1.0.1

- No scrollbar on the side of the screen: pages scroll like a native app.

## 1.0.0

Build 8 · sent for review 24 Oct 2026

- First release of Miracle.
