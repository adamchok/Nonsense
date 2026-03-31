# Nonsense

Mobile app (Expo + React Native + Firebase) for tracking home poker sessions: buy-ins, cash-outs, per-player results, and personal stats over time.

## Tech stack

| Layer | Technology |
|--------|------------|
| App & routing | [Expo](https://expo.dev/) SDK ~54, [Expo Router](https://docs.expo.dev/router/introduction/) |
| UI | React Native 0.81, React 19, TypeScript |
| Backend | Firebase (Authentication — anonymous, Firestore) |
| Icons / extras | Expo Vector Icons, QR (sharing), camera, etc. |

## What’s in the app

### Tabs

- **Home** — Welcome, start a new session, quick stats, list of active sessions you’re in (host or participant).
- **History (“My Winnings”)** — Finished sessions you have a saved **result** for. Filter by location (searchable picker), date range, buy-in and profit ranges. Sort by date/time, buy-in, profit, or duration (asc/desc). **Pagination**: loads in pages (see `HISTORY_TAB_PAGE_SIZE` in `lib/firestore.ts`); use **Load more** for older sessions. Pull-to-refresh reloads the first page.
- **Friends** — Friend requests (in/out), friends list with search and sort (name / friends since), **Groups** (expand, members, per-group leaderboard modal, `memberCount` on group cards), **Leaderboard** tab across friends (sort + direction).
- **Settings** — Display name, avatar emoji, QR code, **Locations** (saved places), **Statistics** modal (full history aggregation: P/L, per hour, win rate, host vs participant counts, friends/groups/saved locations, etc.), light / dark / system theme.

### Session flows (stack screens)

- Create session (`session/new`) — optional saved locations.
- Live session (`session/[id]`) — buy-ins, participants, host tools.
- Cash-out (`session/cashout/[id]`) — settle the table.
- Summary (`session/summary/[id]`) — read-only recap.

### Other routes

- **QR code** — Share / scan friend codes.
- **Groups** — Create group (`group/new`), manage members (`group/[id]/members`).
- **Saved locations** (`locations/index`) — up to 10 named locations per player.

## Project layout (high level)

```
app/           Expo Router screens (tabs, session/*, group/*, locations, qr-code)
components/    Shared UI (e.g. tab haptics, icons)
lib/           Firebase, Firestore helpers, auth & theme context, formatting
types/         Shared TypeScript types
firestore.rules / firestore.indexes.json   Security rules & composite indexes
doc/           Product spec (may differ slightly from shipped stack)
```

## Prerequisites

- Node.js (LTS recommended)
- [Firebase](https://console.firebase.google.com/) project with **Authentication** (Anonymous) and **Firestore** enabled
- Optional: [Firebase CLI](https://firebase.google.com/docs/cli) for deploying rules and indexes

## Run locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`
3. Set all `EXPO_PUBLIC_FIREBASE_*` variables in `.env` (see `.env.example` for names)
4. Start the dev server: `npx expo start` (or `npm start`)

Then open in Expo Go, iOS simulator, Android emulator, or web as usual.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` / `npx expo start` | Dev server |
| `npm run android` | Start with Android |
| `npm run ios` | Start with iOS |
| `npm run web` | Start for web |
| `npm run lint` | ESLint (Expo config) |

## Firestore

- **Rules**: `firestore.rules` — deploy with Firebase CLI or console.
- **Indexes**: [`firestore.indexes.json`](firestore.indexes.json) includes composites needed for queries such as finished sessions ordered by `date` (used for **History** pagination and **Settings → Statistics** full history).

Deploy indexes (after linking your project):

```bash
firebase deploy --only firestore:indexes
```

If a screen logs a Firestore “index required” URL, open it to create the index, or add the suggested fields to `firestore.indexes.json` and redeploy.

## Data & limits (behavioral notes)

- **History** and **Statistics** only include finished sessions where your user has a document under `sessions/{id}/results/{yourPlayerId}`.
- History loads **incrementally**; summary totals and filters apply to **sessions loaded so far** until you load more.
- **Statistics** (Settings) walks **all** finished sessions in batches (`getFullSessionHistoryForPlayer`) for aggregate numbers.

## Reference

- Product / data model draft: [`doc/nonsense-app-spec.md`](doc/nonsense-app-spec.md) (stack details there may not match this repo 1:1 — trust `package.json` and `lib/` for what’s implemented).
