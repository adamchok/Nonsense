# Nonsense

**Nonsense** is a production-style mobile app for home poker tracking, built with Expo + React Native + Firebase.
It handles the full session lifecycle: creating games, tracking buy-ins, cashing out, and surfacing per-player results with long-term personal analytics.

## Why this project stands out

- **Real-world product scope**: Not a toy CRUD app; includes accounts, sessions, friends, groups, locations, stats, and profile management.
- **Thoughtful data modeling**: Firestore collections support live updates, session summaries, and historical analytics.
- **Performance-minded UX**: Incremental history pagination and batched aggregation for large datasets.
- **Mobile-first experience**: Native-feeling navigation, bottom sheets on phones, haptics, theme support, QR-powered sharing, and practical flows for live game nights.
- **End-to-end ownership**: App screens, state/data layer, Firestore rules/indexes, emulator-backed tests, and deployment-ready configuration (EAS for Android, Cloudflare Pages for web).

## Core features

### Accounts

- Sign-in is required: **Continue with Google**, or **email + password** (sign in or create account).
- Passwords follow the Firebase password policy: 8–50 characters with an uppercase letter, a lowercase letter, a number and a symbol. The form shows the rules live and validates inline.
- A verification email is sent after email sign-up. "Forgot password?" sends a reset link and always shows a neutral message ("If an account exists for …"), so it doesn't reveal which emails are registered.
- Firebase Authentication stores and hashes passwords; the app never stores them.
- Legacy anonymous (guest) accounts are routed to **Secure your account**, which links Google or email/password to the same uid in place, so all data is kept. Signing in to a *different* existing account instead leaves the guest data on the old guest profile.
- Settings shows how you're signed in (Google or email, plus the address) and has **Sign out**.

### Session management

- Create new poker sessions with optional saved locations.
- Preset buy-in amounts (100/200/300/500/1000) and a Cash/Chips toggle on New Session.
- Track live participants and buy-ins during active games.
- Run a dedicated cash-out flow and store final results.
- Settle-up suggestions (who pays whom) and read-only session summaries with sharing, for easy recap and auditability.

### Social layer

- Send and receive friend requests.
- Search/sort friends and manage group membership.
- Leaderboards across friends and within groups.
- Share and connect via QR code.

### Personal analytics

- Profit-over-time chart on History ([react-native-gifted-charts](https://www.npmjs.com/package/react-native-gifted-charts)) with a **Line / Bars** toggle; tap a point or bar to open that session. The line and fill turn red below $0.
- History filters in a bottom sheet: date range picker with presets (Any time, Last 30 days, Last 3 months, This year), location, buy-in range and profit range.
- Multi-key sorting (date/time, buy-in, profit, duration).
- Pagination with pull-to-refresh for responsive history browsing.
- Full-history statistics sheet including P/L, win rate, hourly rate, and participation/hosting trends.

### User experience

- Tab-based information architecture with dedicated session stack flows.
- "Midnight gold" colour scheme with light / dark / system theme support, and Phosphor SVG icons.
- On phones (under 600px wide) forms, confirmations and statistics open as bottom sheets that close on tap outside; plain notices stay centred dialogs.
- Modal backdrops are blurred (`expo-blur` on iOS/Android, CSS `backdrop-filter` on web).
- Inline field errors under each input instead of pop-up alerts.
- Skeleton loading placeholders across Home, History, friends/groups/leaderboards, the live session, summary, cash-out and statistics.
- Reanimated motion for tabs, lists, menus and the live session.
- Profile customization (display name + avatar emoji).
- Saved locations for faster repeat session setup.

## Tech stack

| Layer | Technologies |
|---|---|
| Mobile app | [Expo](https://expo.dev/) SDK 54, [Expo Router](https://docs.expo.dev/router/introduction/) |
| UI | React Native 0.81, React 19, TypeScript, Reanimated, Phosphor icons, react-native-gifted-charts, expo-blur |
| Backend | Firebase Authentication (Google, email/password), Firestore |
| Native integrations | Camera, sharing, clipboard, haptics, QR generation/scanning, Google Sign-In |
| Hosting | EAS Build/Update (Android), Cloudflare Pages (web) |
| Tooling | ESLint, TypeScript, `node:test`, Firebase emulators |

## Architecture snapshot

```text
app/         Route-driven screens (tabs, auth, session, group, locations, qr)
lib/         Firebase + Firestore helpers, auth/theme providers, utilities
components/  Shared UI building blocks
types/       Shared TypeScript contracts
test/        Unit (lib), Firestore rules and auth emulator tests
firestore.rules
firestore.indexes.json
```

## Quick start

### Prerequisites

- Node.js LTS
- Firebase project with Authentication and a Firestore database, configured as in [Firebase Console setup](#firebase-console-setup)
- Firebase CLI for emulators and deploying rules/indexes (`firebase-tools` is a dev dependency, so `npx firebase` works)

### Local setup

```bash
npm install
```

1. Copy `.env.example` to `.env`
2. Fill in all `EXPO_PUBLIC_FIREBASE_*` variables, plus `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` for native Google sign-in (see the comments in `.env.example`)
3. Start the app:

```bash
npm start
```

Then run on a development build, iOS simulator, Android emulator, or web.

### Local web against the Firebase emulators

`.claude/launch.json` has a `web-emulator` configuration that runs the web app against local Auth + Firestore emulators (project `demo-nonsense`), so you can create throwaway accounts without touching production. It is equivalent to:

```bash
EXPO_PUBLIC_USE_EMULATOR=1 EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-nonsense \
  npx firebase emulators:exec --only auth,firestore --project demo-nonsense "npx expo start --web --port 8081"
```

`EXPO_PUBLIC_EMULATOR_HOST` overrides the emulator host (default `127.0.0.1`; Android emulator `10.0.2.2`).

## Available scripts

| Command | Purpose |
|---|---|
| `npm start` | Start Expo dev server |
| `npm run android` | Launch Android target |
| `npm run ios` | Launch iOS target |
| `npm run web` | Launch web target |
| `npm run lint` | Run lint checks |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Unit tests (`test/lib`) |
| `npm run test:rules` | Firestore security rules tests (Firestore emulator) |
| `npm run test:auth` | Email sign-up/sign-in and account-linking tests (Auth + Firestore emulators) |
| `npm run build:preview` / `build:production` | EAS Android build |
| `npm run update:preview` / `update:production` | EAS OTA update (Android) |
| `npm run deploy:web` | Export and deploy the web build to Cloudflare Pages |

## Testing

- `npm test` runs unit tests with Node's built-in test runner (`node --test`); no emulators needed.
- `npm run test:rules` and `npm run test:auth` wrap their tests in `firebase emulators:exec` with the `demo-nonsense` project, so they never touch production. They run serially (`--test-concurrency=1`).

## Releasing

Versions follow `MAJOR.MINOR.PATCH`, kept in sync in `app.json` (`expo.version`) and `package.json`.

| Change | Bump | Ship with |
|---|---|---|
| JS/UI-only fix | PATCH, in the update message only (don't edit `app.json`: `version` is part of the fingerprint, so bumping it would stop the update reaching installed builds) | `npm run update:preview` (OTA) |
| New feature, or any native change (new native module, `app.json` plugin/permission) | MINOR | new EAS build |
| Breaking data/rules change | MAJOR | new EAS build |

- `runtimeVersion` uses the **fingerprint** policy: EAS derives it from the native project, so an OTA update only reaches binaries it is compatible with. You never set it by hand. `fingerprint.config.js` keeps `package.json` scripts out of the fingerprint.
- **A new EAS build is needed before OTA updates reach phones again**: adding `expo-blur` and `expo-linear-gradient` (a peer dependency of react-native-gifted-charts) changed the native fingerprint, so older builds won't receive new updates. `@react-native-community/datetimepicker` is no longer used by the app and is a removal candidate; removing it also changes the fingerprint, so do it alongside a native build.
- Android `versionCode` is managed remotely by EAS (`appVersionSource: remote`) and auto-increments on every preview/production build.
- Tag each build's commit: `git tag v1.1.0 && git push --tags`.

Channels map 1:1 to branches of the same name: `development`, `preview` (APK builds on your phone), `production`. Updates are Android-only.

```bash
# native release (bump MINOR in app.json + package.json first)
npm run build:preview
# OTA fix (leave app.json alone; the message carries the patch version)
npm run update:preview -- "v1.1.1: <what changed>"
```

## Web deploy

The web build is hosted on Cloudflare Pages (project `nonsense`, production branch `master`) at https://nonsense.adamchok.xyz. Deploys are manual (no Git integration, production only):

```bash
npm run deploy:web
```

`scripts/fix-web-assets.js` runs after export because `wrangler pages deploy` skips `node_modules` directories, where Expo puts some bundled assets. `public/_redirects` maps dynamic routes (`/session/:id`, ...) to their pre-rendered pages. New hosting domains must be added to Firebase Auth → Authorized domains for Google sign-in.

## Firebase Console setup

Authentication → Sign-in method:

- **Email/Password**: enabled.
- **Google**: enabled. Its Web SDK client ID goes in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; add the signing keys' SHA-1 to the Android app.
- **Anonymous**: keep enabled until legacy guest accounts have migrated through *Secure your account*. New users can't start as guests any more.

Authentication → Settings:

- **Email enumeration protection**: enabled (pairs with the app's neutral password-reset message).
- **Password policy**: 8–50 characters; require uppercase, lowercase, numeric and special characters; **Require enforcement** on. Keep it in sync with `PASSWORD_RULES` in `lib/auth-errors.ts`.
- **Authorized domains**: include `nonsense.adamchok.xyz` (and `localhost` for local web).

Authentication → Templates: review the **Password reset** and **Email address verification** emails, and set the project's public-facing name (Project settings) so they come from "Nonsense".

## Firestore setup notes

- Security rules are in `firestore.rules`. Access is keyed on the signed-in uid; the `players/{uid}.anonymousUid` field is just the owner uid (the name is historical, from the anonymous-only days).
- Required composite indexes are in `firestore.indexes.json`.

Deploy indexes:

```bash
firebase deploy --only firestore:indexes
```

If Firestore logs an "index required" URL, open it or add the recommended index fields to `firestore.indexes.json`.

## Behavioral details

- History and stats include finished sessions where the current user has a result document.
- History uses incremental loading; totals reflect currently loaded pages until more pages are fetched.
- Statistics computes full-history aggregates in batches for more complete long-range metrics.

## Future improvements

- Push notifications for session events and friend requests.
- Better anti-cheat/tamper checks around result finalization.
- Optional cloud functions for heavier analytics workloads.
- Expanded visualization layer (moving averages, session heatmaps).

## Notes

Product and data model draft lives in [`doc/nonsense-app-spec.md`](doc/nonsense-app-spec.md). When details differ, this repository's source code is the source of truth.
