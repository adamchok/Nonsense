# Nonsense

**Nonsense** is a production-style mobile app for home poker tracking, built with Expo + React Native + Firebase.
It handles the full session lifecycle: creating games, tracking buy-ins, cashing out, and surfacing per-player results with long-term personal analytics.

## Why this project stands out

- **Real-world product scope**: Not a toy CRUD app; includes sessions, friends, groups, locations, stats, and profile management.
- **Thoughtful data modeling**: Firestore collections support live updates, session summaries, and historical analytics.
- **Performance-minded UX**: Incremental history pagination and batched aggregation for large datasets.
- **Mobile-first experience**: Native-feeling navigation, haptics, theme support, QR-powered sharing, and practical flows for live game nights.
- **End-to-end ownership**: App screens, state/data layer, Firestore rules/indexes, and deployment-ready configuration.

## Core features

### Session management

- Create new poker sessions with optional saved locations.
- Track live participants and buy-ins during active games.
- Run a dedicated cash-out flow and store final results.
- View read-only session summaries for easy recap and auditability.

### Social layer

- Send and receive friend requests.
- Search/sort friends and manage group membership.
- Leaderboards across friends and within groups.
- Share and connect via QR code.

### Personal analytics

- Session history with filters (location, date range, buy-in range, profit range).
- Multi-key sorting (date/time, buy-in, profit, duration).
- Pagination with pull-to-refresh for responsive history browsing.
- Full-history statistics including P/L, win rate, hourly rate, and participation/hosting trends.

### User experience

- Tab-based information architecture with dedicated session stack flows.
- Light / dark / system theme support.
- Profile customization (display name + avatar emoji).
- Saved locations for faster repeat session setup.

## Tech stack

| Layer | Technologies |
|---|---|
| Mobile app | [Expo](https://expo.dev/) SDK 54, [Expo Router](https://docs.expo.dev/router/introduction/) |
| UI | React Native 0.81, React 19, TypeScript |
| Backend | Firebase Authentication (anonymous), Firestore |
| Native integrations | Camera, sharing, clipboard, haptics, QR generation/scanning |
| Tooling | ESLint, TypeScript, Expo lint tooling |

## Architecture snapshot

```text
app/         Route-driven screens (tabs, auth, session, group, locations, qr)
lib/         Firebase + Firestore helpers, auth/theme providers, utilities
components/  Shared UI building blocks
types/       Shared TypeScript contracts
firestore.rules
firestore.indexes.json
```

## Quick start

### Prerequisites

- Node.js LTS
- Firebase project with:
  - Authentication (Anonymous enabled)
  - Firestore database
- Optional: Firebase CLI for deploying rules/indexes

### Local setup

```bash
npm install
```

1. Copy `.env.example` to `.env`
2. Fill in all `EXPO_PUBLIC_FIREBASE_*` variables
3. Start the app:

```bash
npm start
```

Then run on Expo Go, iOS simulator, Android emulator, or web.

## Available scripts

| Command | Purpose |
|---|---|
| `npm start` | Start Expo dev server |
| `npm run android` | Launch Android target |
| `npm run ios` | Launch iOS target |
| `npm run web` | Launch web target |
| `npm run lint` | Run lint checks |

## Firestore setup notes

- Security rules are in `firestore.rules`.
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
- Expanded visualization layer (profit trends, moving averages, session heatmaps).

## Notes

Product and data model draft lives in [`doc/nonsense-app-spec.md`](doc/nonsense-app-spec.md). When details differ, this repository's source code is the source of truth.
