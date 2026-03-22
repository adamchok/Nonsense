# Nonsense

Nonsense is an Expo + Firebase mobile app for tracking poker sessions, buy-ins, and end-of-session settlement.

## Current foundation

- Anonymous Firebase Authentication wired at app startup
- Onboarding flow for display name (`app/(auth)/name.tsx`)
- Session creation flow (`app/session/new.tsx`)
- Active session and cash-out route scaffolding (`app/session/*`)
- Home tab with recent host sessions and quick stats

## Run locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`
3. Fill all `EXPO_PUBLIC_FIREBASE_*` keys in `.env`
4. Start app: `npx expo start`

## Reference docs

- Product spec: `doc/nonsense-app-spec.md`
