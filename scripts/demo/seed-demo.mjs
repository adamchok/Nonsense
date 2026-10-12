// Seeds the local Firebase emulators (project demo-nonsense) with demo data for the landing-page recordings.
// Usage: start `npx firebase emulators:start --only auth,firestore --project demo-nonsense`, then `node scripts/demo/seed-demo.mjs`.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const PROJECT_ID = 'demo-nonsense';
const FIRESTORE_HOST = '127.0.0.1:8080';
const AUTH_HOST = '127.0.0.1:9099';
export const DEMO_PASSWORD = 'demo-password-123';
export const DEMO_EMAIL = 'alex@demo.test';
export const LIVE_SESSION_ID = 'demo-live';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;

const PLAYERS = [
  { key: 'alex', name: 'Alex', emoji: '😎', refCode: 'ALEX42' },
  { key: 'jordan', name: 'Jordan', emoji: '🐻', refCode: 'JRDN77' },
  { key: 'priya', name: 'Priya', emoji: '🦈', refCode: 'PRYA35' },
  { key: 'sam', name: 'Sam', emoji: '🦁', refCode: 'SAMX88' },
  { key: 'chris', name: 'Chris', emoji: '🐸', refCode: 'CHRS29' },
];

const LOCATIONS = ["Jordan's place", "Priya's flat", 'The garage'];
const ALEX_PROFITS = [85, -40, 132.5, -65, 210, -18, 47, 95, -120, 163, 58, -34];
const OTHER_SPLITS = [
  [0.75, -0.2, 0.45],
  [0.2, 0.5, 0.3],
  [0.9, -0.35, 0.45],
  [0.35, 0.35, 0.3],
];
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const roundCents = (n) => Math.round(n * 100) / 100;
const buyInFor = (profit) => (profit >= 0 ? 100 : Math.max(100, Math.ceil(-profit / 100) * 100));

async function clearEmulators() {
  const urls = [
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
  ];
  for (const url of urls) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to clear ${url}: ${res.status}`);
  }
}

async function createUsers(auth) {
  const ids = {};
  for (const p of PLAYERS) {
    const user = await auth.createUser({
      email: `${p.key}@demo.test`,
      password: DEMO_PASSWORD,
      displayName: p.name,
      emailVerified: true,
    });
    ids[p.key] = user.uid;
  }
  return ids;
}

function writeProfiles(batch, db, ids, now) {
  for (const p of PLAYERS) {
    const uid = ids[p.key];
    batch.set(db.doc(`players/${uid}`), {
      name: p.name,
      anonymousUid: uid,
      refCode: p.refCode,
      avatarEmoji: p.emoji,
      createdAt: ts(now - 120 * DAY),
    });
    batch.set(db.doc(`refCodes/${p.refCode}`), { playerId: uid });
  }
  for (const a of PLAYERS) {
    for (const b of PLAYERS) {
      if (a.key === b.key) continue;
      batch.set(db.doc(`players/${ids[a.key]}/friends/${ids[b.key]}`), {
        name: b.name,
        avatarEmoji: b.emoji,
        addedAt: ts(now - 110 * DAY),
      });
    }
  }
  for (const name of LOCATIONS) {
    batch.set(db.collection(`players/${ids.alex}/saved_locations`).doc(), {
      name,
      createdAt: ts(now - 100 * DAY),
    });
  }
}

function writeGroup(batch, db, ids, now) {
  const groupRef = db.collection('groups').doc();
  const members = PLAYERS.filter((p) => p.key !== 'alex');
  const createdAt = ts(now - 105 * DAY);
  batch.set(groupRef, { name: 'Friday Night', ownerId: ids.alex, memberCount: members.length, createdAt });
  for (const m of members) {
    batch.set(groupRef.collection('members').doc(ids[m.key]), {
      name: m.name,
      isRegistered: true,
      avatarEmoji: m.emoji,
    });
  }
  for (const p of PLAYERS) {
    batch.set(db.doc(`players/${ids[p.key]}/group_memberships/${groupRef.id}`), {
      name: 'Friday Night',
      memberCount: members.length,
      ownerId: ids.alex,
      role: p.key === 'alex' ? 'owner' : 'member',
      groupCreatedAt: createdAt,
    });
  }
}

function sessionTable(index) {
  const alexProfit = ALEX_PROFITS[index];
  const others = PLAYERS.filter((p) => p.key !== 'alex').filter((_, i) => i !== index % 4);
  const split = OTHER_SPLITS[index % OTHER_SPLITS.length];
  const profits = others.map((_, i) => roundCents(-alexProfit * split[i]));
  const swing = [35, -35, 0][index % 3];
  profits[1] = roundCents(profits[1] + swing);
  profits[2] = roundCents(profits[2] - swing);
  profits[0] = roundCents(profits[0] - alexProfit - profits.reduce((a, b) => a + b, 0));
  const samIndex = others.findIndex((p) => p.key === 'sam');
  if (samIndex >= 0) {
    const donor = samIndex === 0 ? 1 : 0;
    profits[samIndex] = roundCents(profits[samIndex] + 40);
    profits[donor] = roundCents(profits[donor] - 40);
  }
  return [{ p: PLAYERS[0], profit: alexProfit }, ...others.map((p, i) => ({ p, profit: profits[i] }))];
}

function writeFinishedSession(batch, db, ids, index, now) {
  const table = sessionTable(index);
  const start = now - (ALEX_PROFITS.length - index) * 7 * DAY - 4 * DAY + 20 * HOUR;
  const finish = start + (4 * 60 + ((index * 17) % 50)) * MINUTE;
  const ref = db.collection('sessions').doc();
  batch.set(ref, {
    hostId: ids.alex,
    date: ts(start),
    location: LOCATIONS[index % LOCATIONS.length],
    status: 'finished',
    smallBlind: 1,
    bigBlind: 2,
    amountUnit: 'cash',
    dollarsPerChip: null,
    participantIds: table.map((t) => ids[t.p.key]),
    finishedAt: ts(finish),
  });
  table.forEach(({ p, profit }, i) => {
    const uid = ids[p.key];
    const totalBuyIn = buyInFor(profit);
    const joinedAt = ts(start + i * MINUTE);
    batch.set(ref.collection('session_participants').doc(uid), { playerId: uid, playerName: p.name, joinedAt });
    batch.set(ref.collection('buy_ins').doc(), { playerId: uid, playerName: p.name, amount: totalBuyIn, createdAt: joinedAt });
    batch.set(ref.collection('results').doc(uid), {
      playerName: p.name,
      totalBuyIn,
      cashOut: roundCents(totalBuyIn + profit),
      profit,
      settledAt: ts(finish),
    });
  });
}

function writeLiveSession(batch, db, ids, now) {
  const start = now - 2 * HOUR - 14 * MINUTE;
  const ref = db.collection('sessions').doc(LIVE_SESSION_ID);
  batch.set(ref, {
    hostId: ids.alex,
    date: ts(start),
    location: "Jordan's place",
    status: 'active',
    smallBlind: 1,
    bigBlind: 2,
    amountUnit: 'cash',
    dollarsPerChip: null,
    participantIds: PLAYERS.map((p) => ids[p.key]),
  });
  const buyIns = { alex: 200, jordan: 100, priya: 100, sam: 200, chris: 200 };
  PLAYERS.forEach((p, i) => {
    const uid = ids[p.key];
    const at = ts(start + i * 90_000);
    batch.set(ref.collection('session_participants').doc(uid), { playerId: uid, playerName: p.name, joinedAt: at });
    batch.set(ref.collection('buy_ins').doc(), { playerId: uid, playerName: p.name, amount: buyIns[p.key], createdAt: at });
  });
}

export async function seed() {
  await clearEmulators();
  const app = admin.initializeApp({ projectId: PROJECT_ID }, `seed-${Date.now()}`);
  try {
    const db = app.firestore();
    const ids = await createUsers(app.auth());
    const now = Date.now();
    const batch = db.batch();
    writeProfiles(batch, db, ids, now);
    writeGroup(batch, db, ids, now);
    ALEX_PROFITS.forEach((_, i) => writeFinishedSession(batch, db, ids, i, now));
    writeLiveSession(batch, db, ids, now);
    await batch.commit();
    return { alexUid: ids.alex, liveSessionId: LIVE_SESSION_ID, email: DEMO_EMAIL };
  } finally {
    await app.delete();
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  seed()
    .then((out) => console.log(JSON.stringify(out)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
