import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

import { DELETED_PLAYER_NAME, HostingLiveSessionError, deleteAccountData } from '../../functions/delete-account.js';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { deleteApp, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'demo-nonsense-del';
const USER = 'user-uid';
const FRIEND = 'friend-uid';
const REQUESTER = 'requester-uid';
const GUEST = 'guest-local-id';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

let app;
let db;

async function clearEmulator() {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  assert.ok(res.ok, `could not clear emulator: ${res.status}`);
}

async function seedSession(id, { hostId, status = 'finished', players }) {
  const ref = db.doc(`sessions/${id}`);
  await ref.set({ hostId, status, date: new Date(), participantIds: players.map((p) => p.id) });
  for (const p of players) {
    await ref.collection('session_participants').doc(p.id).set({ playerId: p.id, playerName: p.name });
    await ref.collection('buy_ins').add({ playerId: p.id, playerName: p.name, amount: 50 });
    await ref.collection('results').doc(p.id).set({ playerName: p.name, totalBuyIn: 50, cashOut: 50 + p.profit, profit: p.profit });
  }
}

async function seedWorld() {
  await clearEmulator();
  await db.doc(`players/${USER}`).set({ name: 'Alex', anonymousUid: USER, refCode: 'ALEX01' });
  await db.doc(`players/${FRIEND}`).set({ name: 'Sam', anonymousUid: FRIEND });
  await db.doc(`players/${REQUESTER}`).set({ name: 'Riley', anonymousUid: REQUESTER });
  await db.doc('refCodes/ALEX01').set({ playerId: USER });
  await db.doc(`players/${USER}/saved_locations/loc1`).set({ name: "Alex's place" });

  await db.doc(`players/${USER}/friends/${FRIEND}`).set({ name: 'Sam' });
  await db.doc(`players/${FRIEND}/friends/${USER}`).set({ name: 'Alex' });
  await db.doc(`players/${USER}/friend_requests/${REQUESTER}`).set({ name: 'Riley' });
  await db.doc(`players/${REQUESTER}/friend_requests_sent/${USER}`).set({});
  await db.doc(`players/${USER}/friend_requests_sent/${FRIEND}`).set({});
  await db.doc(`players/${FRIEND}/friend_requests/${USER}`).set({ name: 'Alex' });

  // A group Alex owns (deleted) and one Alex only belongs to (membership removed).
  await db.doc('groups/owned').set({ ownerId: USER, name: 'Alex night', memberCount: 2 });
  await db.doc(`groups/owned/members/${USER}`).set({ name: 'Alex', isRegistered: true });
  await db.doc(`groups/owned/members/${FRIEND}`).set({ name: 'Sam', isRegistered: true });
  await db.doc(`players/${USER}/group_memberships/owned`).set({ role: 'owner' });
  await db.doc(`players/${FRIEND}/group_memberships/owned`).set({ role: 'member' });
  await db.doc('groups/joined').set({ ownerId: FRIEND, name: 'Sam night', memberCount: 2 });
  await db.doc(`groups/joined/members/${FRIEND}`).set({ name: 'Sam', isRegistered: true });
  await db.doc(`groups/joined/members/${USER}`).set({ name: 'Alex', isRegistered: true });
  await db.doc(`players/${USER}/group_memberships/joined`).set({ role: 'member' });

  await db.doc(`guest_links/${USER}_g1`).set({ ownerId: USER, targetId: FRIEND, status: 'pending' });

  const alex = { id: USER, name: 'Alex', profit: 30 };
  const sam = { id: FRIEND, name: 'Sam', profit: -30 };
  const guest = { id: GUEST, name: 'Guest Gus', profit: -30 };
  await seedSession('solo', { hostId: USER, players: [alex, guest] });
  await seedSession('shared', { hostId: USER, players: [alex, sam] });
  await seedSession('joined', { hostId: FRIEND, players: [sam, alex] });
}

const exists = async (path) => (await db.doc(path).get()).exists;

async function namesIn(sessionId) {
  const ref = db.doc(`sessions/${sessionId}`);
  const [results, participants, buyIns] = await Promise.all([
    ref.collection('results').get(),
    ref.collection('session_participants').get(),
    ref.collection('buy_ins').get(),
  ]);
  return [...results.docs, ...participants.docs, ...buyIns.docs].map((d) => d.get('playerName'));
}

before(() => {
  app = initializeApp({ projectId: PROJECT_ID }, 'delete-account-test');
  db = getFirestore(app);
});

after(async () => {
  await deleteApp(app);
});

test('deletes the profile, friendships, requests, groups, links and ref code', async () => {
  await seedWorld();
  await deleteAccountData(db, USER);

  for (const path of [
    `players/${USER}`,
    `players/${USER}/saved_locations/loc1`,
    `players/${USER}/friends/${FRIEND}`,
    `players/${FRIEND}/friends/${USER}`,
    `players/${REQUESTER}/friend_requests_sent/${USER}`,
    `players/${FRIEND}/friend_requests/${USER}`,
    'groups/owned',
    `groups/owned/members/${FRIEND}`,
    `players/${FRIEND}/group_memberships/owned`,
    `groups/joined/members/${USER}`,
    `guest_links/${USER}_g1`,
    'refCodes/ALEX01',
  ]) {
    assert.equal(await exists(path), false, `${path} should be gone`);
  }
  assert.equal(await exists(`players/${FRIEND}`), true, 'other players stay');
  assert.equal((await db.doc('groups/joined').get()).get('memberCount'), 1);
});

test('deletes sessions only the user and guests played, anonymises shared ones', async () => {
  await seedWorld();
  await deleteAccountData(db, USER);

  assert.equal(await exists('sessions/solo'), false);
  assert.equal(await exists(`sessions/solo/results/${GUEST}`), false);

  for (const id of ['shared', 'joined']) {
    assert.equal(await exists(`sessions/${id}`), true, `${id} is kept for the other players`);
    const names = await namesIn(id);
    assert.ok(!names.includes('Alex'), `${id} no longer names the user`);
    assert.ok(names.includes(DELETED_PLAYER_NAME));
    assert.ok(names.includes('Sam'), 'other players keep their names');
    const result = await db.doc(`sessions/${id}/results/${USER}`).get();
    assert.equal(result.get('profit'), 30, 'amounts are unchanged');
  }
});

test('refuses while the user hosts a live session and deletes nothing', async () => {
  await seedWorld();
  await db.doc('sessions/live').set({ hostId: USER, status: 'active', participantIds: [USER, FRIEND] });

  await assert.rejects(deleteAccountData(db, USER), HostingLiveSessionError);
  assert.equal(await exists(`players/${USER}`), true);
  assert.equal(await exists(`players/${FRIEND}/friends/${USER}`), true);
  assert.ok((await namesIn('shared')).includes('Alex'));
});

test('running again after it finished is harmless', async () => {
  await seedWorld();
  await deleteAccountData(db, USER);
  await deleteAccountData(db, USER);
  assert.equal(await exists(`players/${USER}`), false);
});
