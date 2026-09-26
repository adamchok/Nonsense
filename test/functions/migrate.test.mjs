import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

import { markGuestLinkFailed, migrateGuestLink, runGuestLinkMigration } from '../../functions/migrate.js';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { deleteApp, initializeApp } = require('firebase-admin/app');
const { Timestamp, getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'demo-nonsense-fn';
const OWNER = 'owner-uid';
const TARGET = 'target-uid';
const OTHER = 'other-uid';
const STRANGER = 'stranger-uid';
const SETTLED_AT = Timestamp.fromDate(new Date('2026-01-02T03:04:05Z'));
const CASHED_OUT_AT = Timestamp.fromDate(new Date('2026-01-02T01:00:00Z'));

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

let app;
let db;

const silentLogger = { info: () => {}, error: () => {} };

before(async () => {
  app = initializeApp({ projectId: PROJECT_ID }, 'migrate-test');
  db = getFirestore(app);
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  assert.ok(res.ok, `could not clear emulator: ${res.status}`);
  await db.doc(`players/${OWNER}`).set({ name: 'Owner', anonymousUid: OWNER });
  await db.doc(`players/${TARGET}`).set({ name: 'Bryan Real', anonymousUid: TARGET, avatarEmoji: '🦊' });
  await db.doc(`players/${OTHER}`).set({ name: 'Other', anonymousUid: OTHER });
});

after(async () => {
  await deleteApp(app);
});

let counter = 0;
const nextId = (prefix) => {
  counter += 1;
  return `${prefix}_${counter}`;
};

async function seedGuestSession(guestId, { hostId = OWNER, status = 'finished', buyIns = 2, profit = 150.5 } = {}) {
  const id = nextId('session');
  const ref = db.doc(`sessions/${id}`);
  await ref.set({ hostId, status, date: new Date(), participantIds: [hostId, guestId, OTHER] });
  for (const pid of [hostId, guestId, OTHER]) {
    await ref.collection('session_participants').doc(pid).set({ playerId: pid, playerName: pid, joinedAt: new Date() });
  }
  await ref.collection('results').doc(guestId).set({
    playerName: 'Bryan',
    totalBuyIn: 100,
    cashOut: 100 + profit,
    profit,
    settledAt: SETTLED_AT,
  });
  await ref.collection('results').doc(OTHER).set({
    playerName: 'Other',
    totalBuyIn: 100,
    cashOut: 0,
    profit: -100,
    settledAt: SETTLED_AT,
  });
  await ref.collection('early_cashouts').doc(guestId).set({ playerName: 'Bryan', amount: 250.5, cashedOutAt: CASHED_OUT_AT });
  for (let i = 0; i < buyIns; i += 1) {
    await ref.collection('buy_ins').doc(`b${i}`).set({ playerId: guestId, playerName: 'Bryan', amount: 50, createdAt: new Date() });
  }
  await ref.collection('buy_ins').doc('other').set({ playerId: OTHER, playerName: 'Other', amount: 100, createdAt: new Date() });
  return id;
}

async function seedLink(guestId, sessions, status = 'accepted', extra = {}) {
  const id = `${OWNER}_${guestId}`;
  const values = Object.values(sessions);
  await db.doc(`guest_links/${id}`).set({
    ownerId: OWNER,
    ownerName: 'Owner',
    guestId,
    guestName: 'Bryan',
    targetId: TARGET,
    targetName: 'Bryan Real',
    status,
    sessionCount: values.length,
    net: values.reduce((a, b) => a + b, 0),
    sessions,
    createdAt: new Date(),
    ...extra,
  });
  return id;
}

async function assertGuestUntouched(sessionId, guestId) {
  const ref = db.doc(`sessions/${sessionId}`);
  assert.ok((await ref.get()).get('participantIds').includes(guestId));
  assert.equal((await ref.collection('results').doc(guestId).get()).exists, true);
  assert.equal((await ref.collection('results').doc(TARGET).get()).exists, false);
  const buyIns = await ref.collection('buy_ins').where('playerId', '==', guestId).get();
  assert.ok(buyIns.size > 0);
}

async function assertMigrated(sessionId, guestId, { buyIns = 2, profit = 150.5 } = {}) {
  const ref = db.doc(`sessions/${sessionId}`);
  assert.deepEqual((await ref.get()).get('participantIds'), [OWNER, TARGET, OTHER]);
  const result = (await ref.collection('results').doc(TARGET).get()).data();
  assert.deepEqual(result, {
    playerName: 'Bryan Real',
    totalBuyIn: 100,
    cashOut: 100 + profit,
    profit,
    settledAt: SETTLED_AT,
    migratedFrom: guestId,
  });
  assert.equal((await ref.collection('results').doc(guestId).get()).exists, false);
  const cashOut = (await ref.collection('early_cashouts').doc(TARGET).get()).data();
  assert.equal(cashOut.amount, 250.5);
  assert.equal(cashOut.playerName, 'Bryan Real');
  assert.equal(cashOut.migratedFrom, guestId);
  assert.ok(cashOut.cashedOutAt.isEqual(CASHED_OUT_AT));
  assert.equal((await ref.collection('early_cashouts').doc(guestId).get()).exists, false);
  const participant = (await ref.collection('session_participants').doc(TARGET).get()).data();
  assert.equal(participant.playerId, TARGET);
  assert.equal(participant.playerName, 'Bryan Real');
  assert.equal((await ref.collection('session_participants').doc(guestId).get()).exists, false);
  assert.equal((await ref.collection('buy_ins').where('playerId', '==', guestId).get()).size, 0);
  const moved = await ref.collection('buy_ins').where('playerId', '==', TARGET).get();
  assert.equal(moved.size, buyIns);
  for (const b of moved.docs) {
    assert.equal(b.get('playerName'), 'Bryan Real');
    assert.equal(b.get('amount'), 50);
  }
  assert.equal((await ref.collection('buy_ins').doc('other').get()).get('playerId'), OTHER);
  assert.equal((await ref.collection('results').doc(OTHER).get()).get('profit'), -100);
}

test('migrates the frozen sessions and the owner groups, then deletes the link', async () => {
  const guest = nextId('guest');
  const first = await seedGuestSession(guest, { buyIns: 12 });
  const second = await seedGuestSession(guest, { profit: -40.25 });
  const linkId = await seedLink(guest, { [first]: 150.5, [second]: -40.25 });

  await db.doc('groups/g-new').set({ name: 'Poker', ownerId: OWNER, memberCount: 3, createdAt: SETTLED_AT });
  await db.doc(`groups/g-new/members/${OWNER}`).set({ name: 'Owner', isRegistered: true, avatarEmoji: null });
  await db.doc(`groups/g-new/members/${guest}`).set({ name: 'Bryan', isRegistered: false, avatarEmoji: null });
  await db.doc(`groups/g-new/members/${OTHER}`).set({ name: 'Other', isRegistered: true, avatarEmoji: null });
  await db.doc('groups/g-dup').set({ name: 'Dup', ownerId: OWNER, memberCount: 2, createdAt: SETTLED_AT });
  await db.doc(`groups/g-dup/members/${guest}`).set({ name: 'Bryan', isRegistered: false, avatarEmoji: null });
  await db.doc(`groups/g-dup/members/${TARGET}`).set({ name: 'Bryan Real', isRegistered: true, avatarEmoji: null });
  await db.doc('groups/g-foreign').set({ name: 'Theirs', ownerId: STRANGER, memberCount: 1 });
  await db.doc(`groups/g-foreign/members/${guest}`).set({ name: 'Bryan', isRegistered: false, avatarEmoji: null });

  const result = await migrateGuestLink(db, linkId);
  assert.deepEqual(result, { found: true, sessions: 2, skipped: 0, groups: 2 });

  await assertMigrated(first, guest, { buyIns: 12 });
  await assertMigrated(second, guest, { profit: -40.25 });

  const newMember = (await db.doc(`groups/g-new/members/${TARGET}`).get()).data();
  assert.deepEqual(newMember, { name: 'Bryan Real', isRegistered: true, avatarEmoji: '🦊' });
  assert.equal((await db.doc(`groups/g-new/members/${guest}`).get()).exists, false);
  assert.equal((await db.doc('groups/g-new').get()).get('memberCount'), 3);
  const membership = (await db.doc(`players/${TARGET}/group_memberships/g-new`).get()).data();
  assert.equal(membership.role, 'member');
  assert.equal(membership.ownerId, OWNER);
  assert.equal(membership.memberCount, 3);
  assert.equal(membership.name, 'Poker');
  assert.ok(membership.groupCreatedAt.isEqual(SETTLED_AT));
  assert.equal((await db.doc(`players/${OWNER}/group_memberships/g-new`).get()).get('role'), 'owner');
  assert.equal((await db.doc(`players/${OTHER}/group_memberships/g-new`).get()).get('role'), 'member');
  assert.equal((await db.doc(`players/${guest}/group_memberships/g-new`).get()).exists, false);

  assert.equal((await db.doc('groups/g-dup').get()).get('memberCount'), 1);
  assert.equal((await db.doc(`groups/g-dup/members/${guest}`).get()).exists, false);
  assert.equal((await db.doc(`players/${TARGET}/group_memberships/g-dup`).get()).get('memberCount'), 1);
  assert.equal((await db.doc(`groups/g-foreign/members/${guest}`).get()).exists, true);

  assert.equal((await db.doc(`guest_links/${linkId}`).get()).exists, false);
});

test('re-running is a no-op once the link is gone, and a second pass over an accepted link skips done sessions', async () => {
  const guest = nextId('guest');
  const id = await seedGuestSession(guest);
  const linkId = await seedLink(guest, { [id]: 150.5 });
  assert.deepEqual(await migrateGuestLink(db, linkId), { found: true, sessions: 1, skipped: 0, groups: 0 });
  assert.deepEqual(await migrateGuestLink(db, linkId), { found: false, sessions: 0, skipped: 0, groups: 0 });

  await seedLink(guest, { [id]: 150.5 });
  assert.deepEqual(await migrateGuestLink(db, linkId), { found: true, sessions: 0, skipped: 1, groups: 0 });
  await assertMigrated(id, guest);
});

test('copies do not overwrite target docs that already exist', async () => {
  const guest = nextId('guest');
  const id = await seedGuestSession(guest);
  await db.doc(`sessions/${id}/results/${TARGET}`).set({ playerName: 'Keep', profit: 1, migratedFrom: guest });
  const linkId = await seedLink(guest, { [id]: 150.5 });
  await migrateGuestLink(db, linkId);
  assert.equal((await db.doc(`sessions/${id}/results/${TARGET}`).get()).get('playerName'), 'Keep');
  assert.equal((await db.doc(`sessions/${id}/results/${guest}`).get()).exists, false);
  assert.deepEqual((await db.doc(`sessions/${id}`).get()).get('participantIds'), [OWNER, TARGET, OTHER]);
});

test('sessions outside the frozen map, with a different profit, hosted by others or active are left alone', async () => {
  const guest = nextId('guest');
  const consented = await seedGuestSession(guest);
  const later = await seedGuestSession(guest);
  const changed = await seedGuestSession(guest);
  const foreign = await seedGuestSession(guest, { hostId: STRANGER });
  const active = await seedGuestSession(guest, { status: 'active' });
  const missing = nextId('session');
  const withTarget = await seedGuestSession(guest);
  await db.doc(`sessions/${withTarget}`).update({ participantIds: [OWNER, guest, TARGET] });
  await db.doc(`sessions/${changed}/results/${guest}`).update({ profit: 999 });
  const linkId = await seedLink(guest, {
    [consented]: 150.5,
    [changed]: 150.5,
    [foreign]: 150.5,
    [active]: 150.5,
    [missing]: 150.5,
    [withTarget]: 150.5,
  });

  assert.deepEqual(await migrateGuestLink(db, linkId), { found: true, sessions: 1, skipped: 5, groups: 0 });
  await assertMigrated(consented, guest);
  for (const id of [later, changed, foreign, active]) await assertGuestUntouched(id, guest);
  assert.deepEqual((await db.doc(`sessions/${withTarget}`).get()).get('participantIds'), [OWNER, guest, TARGET]);
  assert.equal((await db.doc(`sessions/${missing}`).get()).exists, false);
});

test('a link that is not accepted is rejected and nothing moves', async () => {
  const guest = nextId('guest');
  const id = await seedGuestSession(guest);
  const linkId = await seedLink(guest, { [id]: 150.5 }, 'pending');
  await assert.rejects(migrateGuestLink(db, linkId), /not accepted/);
  await assertGuestUntouched(id, guest);
  assert.equal((await db.doc(`guest_links/${linkId}`).get()).get('status'), 'pending');
});

test('a failing migration marks the link failed and leaves the data alone', async () => {
  const guest = nextId('guest');
  const id = await seedGuestSession(guest);
  const linkId = await seedLink(guest, { [id]: 150.5 }, 'accepted', { targetId: guest });
  const errors = [];
  const result = await runGuestLinkMigration(db, linkId, { info: () => {}, error: (...a) => errors.push(a) });
  assert.equal(result, null);
  assert.equal(errors.length, 1);
  const link = await db.doc(`guest_links/${linkId}`).get();
  assert.equal(link.get('status'), 'failed');
  assert.ok(link.get('failedAt') instanceof Timestamp);
  await assertGuestUntouched(id, guest);
});

test('runGuestLinkMigration reports success and marking a missing link failed is harmless', async () => {
  const guest = nextId('guest');
  const id = await seedGuestSession(guest);
  const linkId = await seedLink(guest, { [id]: 150.5 });
  const result = await runGuestLinkMigration(db, linkId, silentLogger);
  assert.deepEqual(result, { found: true, sessions: 1, skipped: 0, groups: 0 });
  await markGuestLinkFailed(db, linkId);
  assert.equal((await db.doc(`guest_links/${linkId}`).get()).exists, false);
});
