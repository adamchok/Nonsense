import { after, before, test } from 'node:test';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

import { HOST, STRANGER, createRulesEnv, dbAs, nextSessionId, seedDoc } from './helpers.ts';

const OWNER = 'r3-owner';
const FRIEND = 'r3-friend';
const VICTIM = 'r3-victim';

let env: RulesTestEnvironment;

before(async () => {
  env = await createRulesEnv();
  await env.clearFirestore();
  for (const [uid, name] of [
    [HOST, 'Host'],
    [OWNER, 'Owner'],
    [FRIEND, 'Friend'],
    [VICTIM, 'Victim'],
    [STRANGER, 'Stranger'],
  ]) {
    await seedDoc(env, `players/${uid}`, { name, anonymousUid: uid });
  }
  await seedDoc(env, `players/${OWNER}/friends/${VICTIM}`, { name: 'Victim' });
  await seedDoc(env, `players/${OWNER}/friends/${FRIEND}`, { name: 'Friend' });
  await seedDoc(env, `players/${HOST}/friends/${FRIEND}`, { name: 'Friend' });
});

after(async () => {
  await env.cleanup();
});

let groupCounter = 0;
const gid = () => `r3-group-${++groupCounter}`;
const sid = () => nextSessionId('r3');

function membership(ownerId: string, role: 'owner' | 'member') {
  return { name: 'Poker', memberCount: 1, ownerId, role };
}

async function seedGroup(groupId: string, ownerId: string, members: string[]) {
  await seedDoc(env, `groups/${groupId}`, { name: 'Poker', ownerId, memberCount: members.length });
  for (const m of members) {
    await seedDoc(env, `groups/${groupId}/members/${m}`, { name: m, isRegistered: true });
    await seedDoc(env, `players/${m}/group_memberships/${groupId}`, membership(ownerId, m === ownerId ? 'owner' : 'member'));
  }
}

function startGroupSession(db: Firestore, hostId: string, sessionId: string, groupId: string) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'sessions', sessionId), {
    hostId,
    date: serverTimestamp(),
    location: null,
    status: 'active',
    smallBlind: null,
    bigBlind: null,
    amountUnit: 'cash',
    dollarsPerChip: null,
    participantIds: [hostId],
    groupId,
  });
  batch.set(doc(db, 'sessions', sessionId, 'session_participants', hostId), {
    playerId: hostId,
    playerName: hostId,
    joinedAt: serverTimestamp(),
  });
  return batch;
}

function addPlayerBatch(db: Firestore, sessionId: string, playerId: string) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'sessions', sessionId, 'buy_ins')), {
    playerId,
    playerName: playerId,
    amount: 20,
    createdAt: serverTimestamp(),
  });
  batch.set(
    doc(db, 'sessions', sessionId, 'session_participants', playerId),
    { playerId, playerName: playerId, joinedAt: serverTimestamp() },
    { merge: true }
  );
  batch.update(doc(db, 'sessions', sessionId), { participantIds: arrayUnion(playerId) });
  return batch;
}

test('a new owner of a reused group id cannot rewrite or read through a stale membership', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, VICTIM]);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await deleteDoc(doc(ctx.firestore() as unknown as Firestore, 'groups', groupId));
  });
  const sdb = dbAs(env, STRANGER);
  await assertSucceeds(setDoc(doc(sdb, 'groups', groupId), { name: 'Mine', ownerId: STRANGER, memberCount: 0 }));
  const stale = doc(sdb, 'players', VICTIM, 'group_memberships', groupId);
  await assertFails(updateDoc(stale, { ownerId: STRANGER, name: 'Click evil.example' }));
  await assertFails(updateDoc(stale, { name: 'Click evil.example' }));
  await assertFails(setDoc(stale, membership(STRANGER, 'member'), { merge: true }));
  await assertFails(getDoc(doc(dbAs(env, VICTIM), 'groups', groupId)));
});

test('the group owner keeps updating its mirrors but can never move ownerId', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, VICTIM]);
  const odb = dbAs(env, OWNER);
  const mirror = doc(odb, 'players', VICTIM, 'group_memberships', groupId);
  await assertSucceeds(setDoc(mirror, { ...membership(OWNER, 'member'), name: 'Renamed', memberCount: 2 }, { merge: true }));
  await assertFails(updateDoc(mirror, { ownerId: VICTIM }));
  await assertSucceeds(getDoc(doc(dbAs(env, VICTIM), 'groups', groupId)));
});

test('a member whose members doc is gone no longer consents to group sessions', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, HOST, VICTIM]);
  const vdb = dbAs(env, VICTIM);
  await assertSucceeds(
    runTransaction(vdb, async (tx) => {
      await tx.get(doc(vdb, 'groups', groupId));
      tx.delete(doc(vdb, 'groups', groupId, 'members', VICTIM));
      tx.update(doc(vdb, 'groups', groupId), { memberCount: increment(-1) });
    })
  );
  const hdb = dbAs(env, HOST);
  const id = sid();
  await assertSucceeds(startGroupSession(hdb, HOST, id, groupId).commit());
  await assertSucceeds(addPlayerBatch(hdb, id, OWNER).commit());
  await assertFails(addPlayerBatch(hdb, id, VICTIM).commit());
});

test('the owner cannot recreate a mirror for a registered member who is no longer a friend', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER]);
  await seedDoc(env, `groups/${groupId}/members/${STRANGER}`, { name: 'Stranger', isRegistered: true });
  await seedDoc(env, `groups/${groupId}/members/${FRIEND}`, { name: 'Friend', isRegistered: true });
  const odb = dbAs(env, OWNER);
  await assertFails(setDoc(doc(odb, 'players', STRANGER, 'group_memberships', groupId), membership(OWNER, 'member')));
  await assertSucceeds(setDoc(doc(odb, 'players', FRIEND, 'group_memberships', groupId), membership(OWNER, 'member')));
});

test('owner sync still updates mirrors written by the admin migration for a non-friend', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, STRANGER]);
  const odb = dbAs(env, OWNER);
  await assertSucceeds(
    setDoc(doc(odb, 'players', STRANGER, 'group_memberships', groupId), { ...membership(OWNER, 'member'), memberCount: 2 }, { merge: true })
  );
  await assertSucceeds(deleteDoc(doc(odb, 'players', STRANGER, 'group_memberships', groupId)));
});

test('player profiles only hold the fields the app writes', async () => {
  const uid = 'r3-profile';
  const db = dbAs(env, uid);
  const ref = doc(db, 'players', uid);
  await seedDoc(env, 'refCodes/R3ABCD', { playerId: uid });
  await assertFails(setDoc(ref, { name: 'A', anonymousUid: uid, pad: 'x'.repeat(1000) }));
  await assertFails(setDoc(ref, { name: 'A', anonymousUid: uid, termsVersion: 7 }));
  await assertSucceeds(
    setDoc(ref, {
      name: 'A',
      anonymousUid: uid,
      refCode: 'R3ABCD',
      createdAt: serverTimestamp(),
      termsVersion: '2026-10-13',
      termsAcceptedAt: serverTimestamp(),
    })
  );
  await assertFails(updateDoc(ref, { isAdmin: true }));
  await assertFails(setDoc(ref, { name: 'A', anonymousUid: uid, pad: 'x' }, { merge: true }));
  await assertFails(updateDoc(ref, { createdAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { termsAcceptedAt: 'yesterday' }));
  await assertSucceeds(setDoc(ref, { name: 'B', anonymousUid: uid, termsVersion: '2026-11-01', termsAcceptedAt: serverTimestamp() }, { merge: true }));
  await assertSucceeds(updateDoc(ref, { avatarEmoji: '🦊' }));
});

test('a legacy profile with unknown fields can still update the allowed fields', async () => {
  const uid = 'r3-legacy-profile';
  await seedDoc(env, `players/${uid}`, { name: 'Old', anonymousUid: uid, email: 'old@example.com', legacyFlag: true });
  await seedDoc(env, 'refCodes/R3LGCY', { playerId: uid });
  const ref = doc(dbAs(env, uid), 'players', uid);
  await assertSucceeds(setDoc(ref, { name: 'New', anonymousUid: uid }, { merge: true }));
  await assertSucceeds(updateDoc(ref, { refCode: 'R3LGCY' }));
  await assertSucceeds(updateDoc(ref, { avatarEmoji: null }));
  await assertFails(updateDoc(ref, { legacyFlag: false }));
});

test('a legacy session over the 50 cap can be edited and finished but not grown', async () => {
  const id = sid();
  const ids = [HOST, ...Array.from({ length: 59 }, (_, i) => `guest_big_${i}`)];
  await seedDoc(env, `sessions/${id}`, {
    hostId: HOST,
    status: 'active',
    location: null,
    smallBlind: null,
    bigBlind: null,
    participantIds: ids,
  });
  const db = dbAs(env, HOST);
  const ref = doc(db, 'sessions', id);
  await assertSucceeds(updateDoc(ref, { location: 'Club' }));
  await assertSucceeds(updateDoc(ref, { smallBlind: 1, bigBlind: 2 }));
  await assertFails(addPlayerBatch(db, id, FRIEND).commit());
  await assertSucceeds(updateDoc(ref, { participantIds: arrayRemove('guest_big_0') }));
  const entry = { playerName: 'x', totalBuyIn: 1, cashOut: 1, profit: 0 };
  const settled = [HOST, ...ids.slice(2, 51)];
  await assertFails(updateDoc(ref, { playerResults: Object.fromEntries([...settled, ids[51]].map((p) => [p, entry])) }));
  await assertSucceeds(updateDoc(ref, { playerResults: Object.fromEntries(settled.map((p) => [p, entry])) }));
  await assertSucceeds(updateDoc(ref, { status: 'finished', finishedAt: serverTimestamp() }));
});
