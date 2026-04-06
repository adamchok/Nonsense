# Nonsense App Spec (Current)

## Product overview

Nonsense is a cross-platform poker session tracker for friendly home games.
The app covers the full lifecycle:

- create and run live sessions
- track buy-ins, re-entries, and early cash-outs
- finalize results and settlement
- review personal history, filters, and lifetime statistics
- manage a social graph (friends + groups) for recurring tables

Primary audience: casual-to-serious home poker groups that need clean records without account friction.

---

## Current implementation status

### Shipping now

- Anonymous sign-in and profile setup (name + avatar emoji).
- Session lifecycle:
  - create session with optional location and optional blinds
  - real-time buy-in ledger
  - optional early cash-out tracking per player
  - cash-out + finalize results
  - read-only summary view
- History tab:
  - pagination (`HISTORY_TAB_PAGE_SIZE`)
  - filters (location, date range, buy-in range, profit range)
  - sort controls (date/time, buy-in, profit, duration; asc/desc)
- Friends:
  - ref-code friend discovery
  - incoming/outgoing requests
  - friend list management
  - friend leaderboard
- Groups:
  - create, rename, delete
  - owner/member roles
  - member management and group leaderboard
- Settings:
  - theme preference (system/light/dark)
  - locations manager
  - statistics modal (full-history aggregation)
  - QR code screen (share + scan flows)

### Not implemented yet

- Push notifications
- Payment integrations
- Export to CSV/PDF
- Advanced trend charts / graphs

---

## Tech stack (actual)

| Layer | Technology |
|---|---|
| App framework | Expo SDK 54 + Expo Router |
| UI | React Native 0.81 + React 19 + TypeScript |
| Backend | Firebase (Auth + Firestore) |
| Auth | Anonymous Firebase Authentication with RN persistence (`AsyncStorage`) |
| Data layer | Firestore SDK reads/writes + real-time listeners (`onSnapshot`) |
| Navigation | File-based routing with Expo Router |
| Tooling | ESLint (Expo config), TypeScript |

Notes:

- NativeWind, Zustand, and React Query are **not** part of the current architecture.
- Firebase is initialized through `lib/firebase.ts` using Expo public env variables.

---

## Core user flows

### 1) Onboarding

1. User opens app.
2. App authenticates anonymously.
3. User sets display name on first run.
4. Profile is upserted under `players/{uid}` with a generated 6-char ref code.

### 2) Session lifecycle

1. Host creates session (`status = active`) with optional location + blinds.
2. Buy-ins are recorded under `sessions/{id}/buy_ins`.
3. Participants are tracked under `sessions/{id}/session_participants`.
4. Early cash-outs (if any) are tracked under `sessions/{id}/early_cashouts`.
5. Cash-out screen computes final totals and writes `sessions/{id}/results`.
6. Session is finalized (`status = finished`, `finishedAt` set).
7. Summary screen renders persisted results.

### 3) Social loop

1. Player adds friend using ref code.
2. Request accepted/declined through request docs.
3. Friends can create groups and manage recurring members.
4. Leaderboards aggregate historical profits from stored session results.

### 4) Analytics loop

1. History tab fetches finished sessions by pages.
2. Client filters and sorts currently loaded entries.
3. Settings > Statistics computes full-history aggregates by paging all finished sessions and checking `results/{playerId}` presence.

---

## Firestore data model (current)

### `players/{playerId}`

Core player profile:

- `name`
- `anonymousUid`
- `refCode`
- `avatarEmoji`
- `createdAt`

Subcollections:

- `friends/{friendId}` (denormalized friend display data)
- `friend_requests/{senderId}` (incoming requests)
- `friend_requests_sent/{receiverId}` (outgoing requests)
- `saved_locations/{locationId}` (max 10)
- `group_memberships/{groupId}` (per-user index for groups)

### `refCodes/{code}`

- maps 6-char ref code -> `playerId`

### `sessions/{sessionId}`

- `hostId`
- `date`
- `location` (nullable)
- `status` (`active` | `finished`)
- `smallBlind` (nullable)
- `bigBlind` (nullable)
- `finishedAt` (when closed)

Subcollections:

- `buy_ins/{buyInId}`
  - `playerId`, `playerName`, `amount`, `createdAt`
- `early_cashouts/{playerId}`
  - `playerName`, `amount`, `cashedOutAt`
- `results/{playerId}`
  - `playerName`, `totalBuyIn`, `cashOut`, `profit`, `settledAt`
- `session_participants/{playerId}`
  - `playerId`, `playerName`, `joinedAt`

### `groups/{groupId}`

- `name`
- `ownerId`
- `memberCount`
- `createdAt`

Subcollection:

- `members/{memberId}`
  - `name`
  - `isRegistered`
  - `avatarEmoji`

The app also maintains denormalized `players/{uid}/group_memberships/{groupId}` docs for cheap "my groups" queries.

---

## Screen map (routes)

### Auth

- `app/(auth)/name.tsx` - display-name setup/edit

### Tabs

- `app/(tabs)/index.tsx` - home
- `app/(tabs)/history.tsx` - my winnings history
- `app/(tabs)/friends.tsx` - friends/groups/leaderboards
- `app/(tabs)/settings.tsx` - profile/theme/stats

### Session stack

- `app/session/new.tsx` - create session
- `app/session/[id].tsx` - active session live tracker
- `app/session/cashout/[id].tsx` - finalize payouts
- `app/session/summary/[id].tsx` - read-only recap

### Supporting routes

- `app/group/new.tsx`
- `app/group/[id]/members.tsx`
- `app/locations/index.tsx`
- `app/qr-code.tsx`

---

## Key constraints and limits

- Saved locations: max 10 per player.
- Groups owned by one player: max 10.
- Group member count is tracked and denormalized.
- History tab is page-based; totals on that screen reflect loaded pages unless more are fetched.
- Statistics modal intentionally computes full history in batches for completeness.

---

## Security and data integrity notes

- Firestore rules and indexes are versioned in:
  - `firestore.rules`
  - `firestore.indexes.json`
- Composite indexes are required for finished-session history queries by status/date/documentId.
- Profile updates (name/avatar) trigger best-effort denormalization across friend and group surfaces.

---

## Repository layout (high level)

```text
app/           Expo Router screens and navigation structure
components/    Shared UI components
constants/     Static app constants (e.g. avatar options)
hooks/         Small platform/theme hooks
lib/           Firebase init, Firestore services, theme/auth utilities
types/         Shared TypeScript types
doc/           Product/documentation files
```

---

## Roadmap (next likely increments)

1. Push notifications for friend requests/session events.
2. Better analytics UX (charts/trends).
3. Optional exports (CSV/PDF/session share formats).
4. Potential backend offload (Cloud Functions) for heavier aggregates.
