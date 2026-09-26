# Nonsense App Spec (Current)

## Product overview

Nonsense is a cross-platform poker session tracker for friendly home games, available on Android and on the web (https://nonsense.adamchok.xyz).
The app covers the full lifecycle:

- create and run live sessions
- track buy-ins, re-entries, and early cash-outs
- finalize results and settlement
- review personal history, charts, filters, and lifetime statistics
- manage a social graph (friends + groups) for recurring tables

Primary audience: casual-to-serious home poker groups that need clean records that follow them across devices.

---

## Current implementation status

### Shipping now

- Required sign-in (Google, or email + password) and profile setup (name + avatar emoji).
  - Legacy anonymous accounts must secure their account (link Google or email/password in place, keeping the same uid and data).
  - Email sign-up sends a verification email; password reset via email.
  - Settings shows the signed-in method and email, with Sign out.
- Session lifecycle:
  - create session with optional location and optional blinds; preset buy-in amounts; Cash/Chips toggle
  - real-time buy-in ledger
  - optional early cash-out tracking per player
  - cash-out + finalize results, with settle-up suggestions (who pays whom)
  - read-only summary view with sharing
- History tab:
  - profit-over-time chart with Line / Bars toggle; tapping a point or bar opens that session
  - pagination (`HISTORY_TAB_PAGE_SIZE`)
  - filters bottom sheet (date range picker with presets, location, buy-in range, profit range)
  - sort controls (date/time, buy-in, profit, duration; asc/desc)
- Friends:
  - ref-code friend discovery
  - incoming/outgoing requests
  - friend list management
  - friend leaderboard
- Groups:
  - create (from a modal), rename, delete
  - owner/member roles
  - member management and group leaderboard
- Settings:
  - account (sign-in method, Sign out), display name + avatar
  - theme preference (system/light/dark)
  - locations manager
  - statistics sheet (full-history aggregation)
  - QR code screen (share + scan flows)
- UI system:
  - "Midnight gold" colour scheme, Phosphor SVG icons, Reanimated motion
  - bottom sheets for forms, confirmations and statistics on phones (< 600px wide); centred dialogs otherwise
  - blurred modal backdrops (`expo-blur` on native, CSS `backdrop-filter` on web)
  - inline field validation instead of pop-up alerts
  - skeleton loading states

### Not implemented yet

- Push notifications
- Payment integrations
- Export to CSV/PDF
- Advanced analytics (moving averages, heatmaps)

---

## Tech stack (actual)

| Layer | Technology |
|---|---|
| App framework | Expo SDK 54 + Expo Router |
| UI | React Native 0.81 + React 19 + TypeScript, Reanimated, Phosphor icons, react-native-gifted-charts, expo-blur |
| Backend | Firebase (Auth + Firestore) |
| Auth | Firebase Authentication: Google (native Google Sign-In on Android, popup on web) and Email/Password; RN persistence (`AsyncStorage`). Anonymous provider only for legacy accounts. |
| Data layer | Firestore SDK reads/writes + real-time listeners (`onSnapshot`) |
| Navigation | File-based routing with Expo Router; signed-in routes behind `Stack.Protected` |
| Hosting | EAS Build/Update (Android, fingerprint runtime policy), Cloudflare Pages (web) |
| Tooling | ESLint (Expo config), TypeScript, `node:test`, Firebase emulators |

Notes:

- NativeWind, Zustand, and React Query are **not** part of the current architecture.
- Firebase is initialized through `lib/firebase.ts` using Expo public env variables (optionally pointed at local emulators with `EXPO_PUBLIC_USE_EMULATOR=1`).

---

## Core user flows

### 1) Onboarding and sign-in

1. User opens app; `app/index.tsx` routes on auth state.
2. Signed out → Welcome (`app/(auth)/welcome.tsx`): Continue with Google, or email sign in / create account.
   - Passwords: 8–50 characters with uppercase, lowercase, number and symbol (mirrors the Firebase password policy, which enforces it server-side). Firebase stores and hashes passwords; the app never stores them.
   - Create account sends a verification email.
   - Forgot password sends a reset email and always shows a neutral "If an account exists…" message.
3. Legacy anonymous user → Secure your account (`app/(auth)/secure.tsx`):
   - linking Google or email/password upgrades the same uid in place, so all data is kept;
   - if that Google account already has a profile, the user can sign in to it instead (guest data stays on the old guest profile).
4. Signed in without a profile → display-name setup (`app/(auth)/name.tsx`).
5. Profile is upserted under `players/{uid}` with a generated 6-char ref code.
6. Signed in with a profile → tabs. All app routes are guarded by `Stack.Protected` (signed in and not anonymous) in `app/_layout.tsx`.
7. Sign out from Settings returns to Welcome.

### 2) Session lifecycle

1. Host creates session (`status = active`) with optional location + blinds.
2. Buy-ins are recorded under `sessions/{id}/buy_ins`.
3. Participants are tracked under `sessions/{id}/session_participants`.
4. Early cash-outs (if any) are tracked under `sessions/{id}/early_cashouts`.
5. Cash-out screen computes final totals and writes `sessions/{id}/results`.
6. Session is finalized (`status = finished`, `finishedAt` set).
7. Summary screen renders persisted results and settle-up transfers.

### 3) Social loop

1. Player adds friend using ref code.
2. Request accepted/declined through request docs.
3. Friends can create groups and manage recurring members.
4. Leaderboards aggregate historical profits from stored session results.

### 4) Analytics loop

1. History tab fetches finished sessions by pages.
2. Client filters and sorts currently loaded entries (filter logic in `lib/history-filters.ts`); the profit chart plots the filtered sessions.
3. Settings > Statistics computes full-history aggregates by paging all finished sessions and checking `results/{playerId}` presence.

---

## Firestore data model (current)

### `players/{playerId}`

Core player profile:

- `name`
- `anonymousUid` (the owner uid; name is historical, from anonymous-only auth, and required by the rules)
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

### Entry and auth

- `app/index.tsx` - redirects to Welcome, Secure your account, name setup, or tabs based on auth state
- `app/(auth)/welcome.tsx` - sign in / create account (Google or email + password)
- `app/(auth)/secure.tsx` - Secure your account (legacy anonymous users)
- `app/(auth)/name.tsx` - display-name setup

### Tabs

- `app/(tabs)/index.tsx` - home
- `app/(tabs)/history.tsx` - my winnings history + profit chart
- `app/(tabs)/friends.tsx` - friends/groups/leaderboards
- `app/(tabs)/settings.tsx` - account/profile/theme/stats

### Session stack

- `app/session/new.tsx` - create session
- `app/session/[id].tsx` - active session live tracker
- `app/session/cashout/[id].tsx` - finalize payouts
- `app/session/summary/[id].tsx` - read-only recap

### Supporting routes

- `app/group/[id]/members.tsx` (groups are created from a modal, `components/new-group-modal.tsx`)
- `app/locations/index.tsx`
- `app/qr-code.tsx`

---

## Key constraints and limits

- Passwords: 8–50 characters, with uppercase, lowercase, number and symbol.
- Saved locations: max 10 per player.
- Groups owned by one player: max 10.
- Group member count is tracked and denormalized.
- History tab is page-based; totals on that screen reflect loaded pages unless more are fetched.
- Statistics sheet intentionally computes full history in batches for completeness.

---

## Security and data integrity notes

- Firestore rules and indexes are versioned in:
  - `firestore.rules`
  - `firestore.indexes.json`
- Rules are keyed on the signed-in uid and were unchanged by the move to required sign-in: linking a sign-in to a legacy anonymous account keeps its uid.
- Rules are tested against the Firestore emulator (`npm run test:rules`); email sign-up/sign-in and account linking are tested against the Auth emulator (`npm run test:auth`).
- Required Firebase Console auth settings (providers, email enumeration protection, password policy enforcement, authorized domains, email templates) are listed in the README.
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
test/          Unit (lib), Firestore rules and auth emulator tests
doc/           Product/documentation files
```

---

## Roadmap (next likely increments)

1. Push notifications for friend requests/session events.
2. Deeper analytics (moving averages, heatmaps).
3. Optional exports (CSV/PDF/session share formats).
4. Potential backend offload (Cloud Functions) for heavier aggregates.
