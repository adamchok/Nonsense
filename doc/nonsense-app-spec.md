# Nonsense — Poker Session Tracker

## Project overview

Nonsense is a mobile app for tracking home poker sessions. It lets a host manage buy-ins for all players at the table in real time, tracks each player's cumulative winnings and losses across sessions, and gives everyone at the table a live view from their own phone.

The name reflects the spirit of the game — chaotic, fun, and among friends.

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile framework | React Native (Expo SDK) |
| Language | TypeScript |
| Styling | NativeWind (Tailwind CSS for RN) |
| Backend / DB | Firebase (Spark free tier) |
| Database | Firestore (NoSQL) |
| Auth | Firebase Authentication — anonymous |
| State management | Zustand |
| Data fetching | React Query + Firestore real-time listeners |

### Why this stack
- Expo allows a single codebase for iOS and Android
- Firebase Spark plan is permanently free, no credit card required, no inactivity pause
- Firestore real-time listeners sync buy-ins across all players' phones instantly
- Anonymous auth means zero friction — players open the app, enter a display name, and they're in. No sign-up, no passwords, no OTP

---

## Core features (MVP)

### 1. Session management
- Host creates a new session (date, optional location/name)
- Session has a shareable code or link so players can join from their phone
- Session states: `active`, `finished`
- Host can close/end a session and lock it

### 2. Player buy-in tracker
- Host adds players to a session by name or from a saved player list
- Host records buy-ins per player (supports multiple rebuys)
- Each buy-in entry logs: amount (MYR), timestamp
- Total buy-in per player is calculated automatically
- All players at the table see the buy-in list update in real time

### 3. Session cash-out
- When session ends, host enters each player's final chip count / cash-out amount
- App calculates profit/loss per player: `cash_out - total_buy_ins`
- Settlement summary shown at end of session (who owes who)

### 4. Player history
- Each player has a profile showing all past sessions
- Stats shown: total sessions played, total bought in, total cashed out, net profit/loss
- Host (me) can see aggregate stats across all sessions

### 5. My winnings dashboard
- Personal screen showing my own performance over time
- Session-by-session breakdown
- Running net profit/loss chart

---

## Firestore data model

### Collection: `players`
```
players/{playerId}
  - name: string (display name chosen on first launch)
  - anonymousUid: string (Firebase anonymous auth UID)
  - createdAt: timestamp
```

### Collection: `sessions`
```
sessions/{sessionId}
  - hostId: string (playerId of host)
  - date: timestamp
  - location: string (optional)
  - label: string (optional, e.g. "Friday Night")
  - status: "active" | "finished"
  - createdAt: timestamp
  - finishedAt: timestamp (optional)
```

### Subcollection: `sessions/{sessionId}/buy_ins`
```
buy_ins/{buyInId}
  - playerId: string
  - playerName: string (denormalized for display)
  - amount: number
  - timestamp: timestamp
```

### Subcollection: `sessions/{sessionId}/results`
```
results/{playerId}
  - playerId: string
  - playerName: string
  - totalBuyIn: number (sum of all buy_ins for this player)
  - cashOut: number
  - profit: number (cashOut - totalBuyIn)
  - settledAt: timestamp
```

### Firestore security rules (summary)
- Any authenticated user can read an active session they are a participant of
- Only the host can write buy-ins and results
- Players can read their own history

---

## App screens

### 1. Onboarding
- App silently signs the user in anonymously via Firebase on first launch
- Single screen: display name entry ("What should we call you?")
- Name saved to Firestore and stored locally
- No email, no phone, no password — done in one tap

### 2. Home screen
- "Start new session" button (prominent)
- List of recent sessions with date, location, my result
- Quick stats: total sessions, net profit/loss

### 3. New session screen
- Fields: optional label, optional location
- Confirm and create → navigates to active session screen

### 4. Active session screen (main table view)
- Session label and date at top
- Player list showing: name, total buy-in, number of rebuys
- "Add buy-in" button per player row
- "Add player" button to add new participants mid-session
- Real-time — updates for all players watching
- "End session" button (host only) → navigates to cash-out screen

### 5. Add buy-in bottom sheet
- Player name (pre-filled or selectable)
- Amount input (numeric, MYR)
- Confirm button

### 6. Cash-out screen
- List of all players with their total buy-in shown
- Input field for each player's cash-out amount
- Live profit/loss preview updates as host enters values
- "Confirm and finish" button
- Settlement summary: who owes who and how much

### 7. Session summary screen
- Final results table: player, bought in, cashed out, profit/loss
- Colour-coded rows (green profit, red loss)
- Share button (screenshot or text summary)

### 8. Player history screen
- My own session history list
- Net result per session (colour coded)
- Running total at top

### 9. Settings screen
- Edit display name
- Sign out

---

## UI/UX design direction

### Aesthetic
- Dark theme by default — suits a dimly lit poker table environment
- Minimal, focused UI — no clutter, big tap targets for use mid-game
- Green felt accent colour (`#2D6A4F` or similar) as the primary brand colour
- White and light gray text on dark backgrounds
- Card-style list items with subtle borders

### Typography
- Single sans-serif font (Inter or System default)
- Large, readable numbers for amounts — poker is about the numbers
- Compact player rows to fit 6–10 players on one screen

### Interaction patterns
- Bottom sheets for add buy-in, add player actions (not full screen navigations)
- Swipe to delete a buy-in entry (host only)
- Haptic feedback on buy-in confirmation
- Pull-to-refresh on session screen as a fallback (real-time listener is primary)
- Toast notifications when a new buy-in is added by host (visible to all players)

### Accessibility
- Minimum tap target size 44px
- Sufficient colour contrast on all text
- No colour-only indicators (profit/loss uses colour + sign prefix)

---

## Project structure

```
nonsense/
├── app/                        # Expo Router screens
│   ├── (auth)/
│   │   └── name.tsx            # Display name entry (first launch only)
│   ├── (tabs)/
│   │   ├── index.tsx           # Home
│   │   ├── history.tsx         # My winnings
│   │   └── settings.tsx
│   ├── session/
│   │   ├── new.tsx             # New session
│   │   ├── [id].tsx            # Active session
│   │   ├── cashout/[id].tsx    # Cash-out screen
│   │   └── summary/[id].tsx    # Session summary
├── components/
│   ├── PlayerRow.tsx
│   ├── BuyInSheet.tsx
│   ├── AddPlayerSheet.tsx
│   └── SettlementCard.tsx
├── lib/
│   ├── firebase.ts             # Firebase init
│   ├── firestore.ts            # DB query helpers
│   └── auth.ts                 # Auth helpers
├── stores/
│   └── sessionStore.ts         # Zustand session state
├── hooks/
│   ├── useSession.ts           # Real-time session listener
│   └── usePlayerHistory.ts
└── types/
    └── index.ts                # Shared TypeScript types
```

---

## Firebase setup instructions

1. Create a Firebase project at console.firebase.google.com (Spark / free plan)
2. Enable Firestore in Native mode
3. Enable Firebase Authentication → Anonymous provider
4. Add Android and iOS apps to the Firebase project
5. Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
6. Install: `npx expo install @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore`
7. Configure Expo with the Firebase native plugin in `app.json`

---

## Out of scope for MVP

- Player-to-player payments / integrations (e.g. DuitNow, PayNow)
- In-app chat
- Hand history or poker statistics
- Tournament / blind structure tracking
- Push notifications
- Web version
- Public leaderboards

---

## Future ideas (post-MVP)

- Recurring game groups with standing player lists
- Blind schedule timer integrated into session screen
- Export session to PDF or CSV
- Player invite via WhatsApp share link
- Multi-currency support
