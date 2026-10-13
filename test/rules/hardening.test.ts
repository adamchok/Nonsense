import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

import { HOST, STRANGER, createRulesEnv, dbAs, nextSessionId, seedDoc, seedSession } from './helpers.ts';

const OWNER = 'r2-owner';
const FRIEND = 'r2-friend';
const VICTIM = 'r2-victim';
const MEMBER = 'r2-member';
const GUEST = 'guest_r2';

let env: RulesTestEnvironment;

before(async () => {
  env = await createRulesEnv();
  await env.clearFirestore();
  for (const [uid, name] of [
    [HOST, 'Host'],
    [OWNER, 'Owner'],
    [FRIEND, 'Friend'],
    [VICTIM, 'Victim'],
    [MEMBER, 'Member'],
    [STRANGER, 'Stranger'],
  ]) {
    await seedDoc(env, `players/${uid}`, { name, anonymousUid: uid });
  }
  await seedDoc(env, `players/${HOST}/friends/${FRIEND}`, { name: 'Friend' });
  await seedDoc(env, `players/${OWNER}/friends/${FRIEND}`, { name: 'Friend' });
});

after(async () => {
  await env.cleanup();
});

let groupCounter = 0;
const gid = () => `r2-group-${++groupCounter}`;
const sid = () => nextSessionId('r2');

function membership(ownerId: string, role: 'owner' | 'member', extra: Record<string, unknown> = {}) {
  return { name: 'Poker', memberCount: 2, ownerId, role, ...extra };
}

async function seedGroup(groupId: string, ownerId: string, members: string[], extra: Record<string, unknown> = {}) {
  await seedDoc(env, `groups/${groupId}`, { name: 'Poker', ownerId, memberCount: members.length, ...extra });
  await seedDoc(env, `players/${ownerId}/group_memberships/${groupId}`, membership(ownerId, 'owner'));
  for (const m of members) {
    await seedDoc(env, `groups/${groupId}/members/${m}`, { name: m, isRegistered: true });
    if (m !== ownerId) await seedDoc(env, `players/${m}/group_memberships/${groupId}`, membership(ownerId, 'member'));
  }
}

function syncBatch(db: Firestore, groupId: string, ownerId: string, ids: string[], memberCount: number) {
  const batch = writeBatch(db);
  for (const pid of ids) {
    batch.set(
      doc(db, 'players', pid, 'group_memberships', groupId),
      { name: 'Poker', memberCount, ownerId, role: pid === ownerId ? 'owner' : 'member' },
      { merge: true }
    );
  }
  return batch;
}

function sessionCreateBatch(db: Firestore, hostId: string, sessionId: string, groupId?: string) {
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
    ...(groupId ? { groupId } : {}),
  });
  batch.set(
    doc(db, 'sessions', sessionId, 'session_participants', hostId),
    { playerId: hostId, playerName: hostId, joinedAt: serverTimestamp() },
    { merge: true }
  );
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

test('a member cannot rewrite their own membership doc', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, MEMBER]);
  const ref = doc(dbAs(env, MEMBER), 'players', MEMBER, 'group_memberships', groupId);
  await assertFails(updateDoc(ref, { pad: 'x'.repeat(1000) }));
  await assertFails(updateDoc(ref, { memberCount: 'many' }));
  await assertFails(updateDoc(ref, { joinedAt: 'yesterday' }));
  await assertFails(updateDoc(ref, { name: 'Renamed' }));
  await assertSucceeds(deleteDoc(ref));
});

test('owner sync updates a membership doc that carries legacy junk in untouched fields', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, MEMBER]);
  await seedDoc(
    env,
    `players/${MEMBER}/group_memberships/${groupId}`,
    membership(OWNER, 'member', { pad: 'x'.repeat(100), joinedAt: 'legacy', memberCount: 'two' })
  );
  const db = dbAs(env, OWNER);
  await assertSucceeds(syncBatch(db, groupId, OWNER, [OWNER, MEMBER], 2).commit());
  const ref = doc(db, 'players', MEMBER, 'group_memberships', groupId);
  await assertSucceeds(updateDoc(ref, { name: 'Renamed' }));
  await assertFails(updateDoc(ref, { name: '' }));
  await assertFails(updateDoc(ref, { role: 'owner' }));
  await assertFails(updateDoc(ref, { ownerId: MEMBER }));
  await assertFails(updateDoc(ref, { memberCount: -1 }));
  await assertFails(updateDoc(ref, { pad: 'y' }));
});

test('per-member sync creates a dozen memberships for friends and none for a former friend', async () => {
  const groupId = gid();
  const members = Array.from({ length: 12 }, (_, i) => `r2-bulk-${i}`);
  await seedDoc(env, `groups/${groupId}`, { name: 'Poker', ownerId: OWNER, memberCount: 13 });
  await seedDoc(env, `players/${OWNER}/group_memberships/${groupId}`, membership(OWNER, 'owner'));
  for (const m of members) {
    await seedDoc(env, `players/${m}`, { name: m, anonymousUid: m });
    await seedDoc(env, `players/${OWNER}/friends/${m}`, { name: m });
    await seedDoc(env, `groups/${groupId}/members/${m}`, { name: m, isRegistered: true });
  }
  await seedDoc(env, `groups/${groupId}/members/${VICTIM}`, { name: 'Victim', isRegistered: true });
  const db = dbAs(env, OWNER);
  const outcomes = await Promise.allSettled(
    [OWNER, ...members].map((pid) => syncBatch(db, groupId, OWNER, [pid], 13).commit())
  );
  assert.deepEqual(outcomes.filter((o) => o.status === 'rejected'), []);
  await assertFails(syncBatch(db, groupId, OWNER, [VICTIM], 13).commit());
});

test('membership create needs a registered members doc, which may be written in the same batch', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER]);
  await seedDoc(env, `groups/${groupId}/members/guest_dave`, { name: 'Dave', isRegistered: false });
  const db = dbAs(env, OWNER);
  await assertFails(syncBatch(db, groupId, OWNER, [VICTIM], 1).commit());
  await assertFails(syncBatch(db, groupId, OWNER, ['guest_dave'], 1).commit());
  await assertFails(syncBatch(dbAs(env, STRANGER), groupId, OWNER, [FRIEND], 1).commit());

  const batch = syncBatch(db, groupId, OWNER, [FRIEND], 1);
  batch.set(doc(db, 'groups', groupId, 'members', FRIEND), { name: 'Friend', isRegistered: true, avatarEmoji: null });
  await assertSucceeds(batch.commit());
});

test('group session adds need the player own membership of that group', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, HOST, MEMBER]);
  await seedDoc(env, `groups/${groupId}/members/${VICTIM}`, { name: 'Victim', isRegistered: true });
  const db = dbAs(env, HOST);
  const id = sid();
  await assertSucceeds(sessionCreateBatch(db, HOST, id, groupId).commit());
  await assertSucceeds(addPlayerBatch(db, id, MEMBER).commit());
  await assertSucceeds(addPlayerBatch(db, id, OWNER).commit());
  await assertSucceeds(addPlayerBatch(db, id, GUEST).commit());
  await assertFails(addPlayerBatch(db, id, VICTIM).commit());
});

test('a host removed from the group can no longer add its members to a group session', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, HOST, MEMBER, VICTIM]);
  const db = dbAs(env, HOST);
  const id = sid();
  await assertSucceeds(sessionCreateBatch(db, HOST, id, groupId).commit());
  await assertSucceeds(addPlayerBatch(db, id, MEMBER).commit());
  await env.withSecurityRulesDisabled(async (ctx) => {
    const adb = ctx.firestore() as unknown as Firestore;
    await deleteDoc(doc(adb, 'groups', groupId, 'members', HOST));
    await deleteDoc(doc(adb, 'players', HOST, 'group_memberships', groupId));
  });
  await assertFails(addPlayerBatch(db, id, VICTIM).commit());
});

test('a reused group id does not carry consent from the previous owner group', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, VICTIM]);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await deleteDoc(doc(ctx.firestore() as unknown as Firestore, 'groups', groupId));
  });
  const sdb = dbAs(env, STRANGER);
  await assertSucceeds(setDoc(doc(sdb, 'groups', groupId), { name: 'Mine', ownerId: STRANGER, memberCount: 0 }));
  await assertSucceeds(
    setDoc(doc(sdb, 'players', STRANGER, 'group_memberships', groupId), membership(STRANGER, 'owner'))
  );
  const id = sid();
  await assertSucceeds(sessionCreateBatch(sdb, STRANGER, id, groupId).commit());
  await assertFails(addPlayerBatch(sdb, id, VICTIM).commit());
});

test('leave and remove still work when memberCount drifted to 0; a member cannot push it below 0', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, MEMBER, FRIEND], { memberCount: 0 });
  const mdb = dbAs(env, MEMBER);
  const groupRef = doc(mdb, 'groups', groupId);
  await assertFails(
    runTransaction(mdb, async (tx) => {
      await tx.get(groupRef);
      tx.delete(doc(mdb, 'groups', groupId, 'members', MEMBER));
      tx.update(groupRef, { memberCount: increment(-1) });
    })
  );
  await assertSucceeds(
    runTransaction(mdb, async (tx) => {
      await tx.get(groupRef);
      tx.delete(doc(mdb, 'groups', groupId, 'members', MEMBER));
      tx.update(groupRef, { memberCount: 0 });
    })
  );
  await assertSucceeds(deleteDoc(doc(mdb, 'players', MEMBER, 'group_memberships', groupId)));

  const odb = dbAs(env, OWNER);
  await assertSucceeds(
    runTransaction(odb, async (tx) => {
      await tx.get(doc(odb, 'groups', groupId));
      tx.delete(doc(odb, 'groups', groupId, 'members', FRIEND));
      tx.delete(doc(odb, 'players', FRIEND, 'group_memberships', groupId));
    })
  );
  await assertFails(updateDoc(doc(odb, 'groups', groupId), { memberCount: -1 }));
});

test('a legacy group without memberCount can be renamed', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER]);
  await seedDoc(env, `groups/${groupId}`, { name: 'Poker', ownerId: OWNER });
  const ref = doc(dbAs(env, OWNER), 'groups', groupId);
  await assertSucceeds(updateDoc(ref, { name: 'Renamed' }));
  await assertFails(updateDoc(ref, { memberCount: 501 }));
});

function requestPair(db: Firestore, from: string, to: string) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'players', to, 'friend_requests', from), { name: from === VICTIM ? 'Victim' : 'Member', avatarEmoji: null, createdAt: serverTimestamp() });
  batch.set(doc(db, 'players', from, 'friend_requests_sent', to), { name: 'x', avatarEmoji: null, createdAt: serverTimestamp() });
  return batch;
}

function clearPair(db: Firestore, a: string, b: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'players', a, 'friend_requests', b));
  batch.delete(doc(db, 'players', b, 'friend_requests_sent', a));
  batch.delete(doc(db, 'players', a, 'friend_requests_sent', b));
  batch.delete(doc(db, 'players', b, 'friend_requests', a));
  return batch;
}

function acceptBatch(db: Firestore, me: string, friend: string, friendDoc: Record<string, unknown>) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'players', me, 'friend_requests', friend));
  batch.delete(doc(db, 'players', friend, 'friend_requests_sent', me));
  batch.delete(doc(db, 'players', me, 'friend_requests_sent', friend));
  batch.delete(doc(db, 'players', friend, 'friend_requests', me));
  batch.set(doc(db, 'players', me, 'friends', friend), { name: 'Victim', avatarEmoji: null, addedAt: serverTimestamp() });
  batch.set(doc(db, 'players', friend, 'friends', me), friendDoc);
  return batch;
}

test('friend docs have a fixed shape on accept and only name and avatar can be propagated', async () => {
  const vdb = dbAs(env, VICTIM);
  const mdb = dbAs(env, MEMBER);
  await assertSucceeds(requestPair(vdb, VICTIM, MEMBER).commit());
  await assertFails(
    acceptBatch(mdb, MEMBER, VICTIM, { name: 'Member', avatarEmoji: null, addedAt: serverTimestamp(), pad: 'x'.repeat(1000) }).commit()
  );
  await assertFails(acceptBatch(mdb, MEMBER, VICTIM, { name: 'Member', avatarEmoji: null, addedAt: 'today' }).commit());
  await assertSucceeds(
    acceptBatch(mdb, MEMBER, VICTIM, { name: 'Member', avatarEmoji: null, addedAt: serverTimestamp() }).commit()
  );
  const theirCopy = doc(mdb, 'players', VICTIM, 'friends', MEMBER);
  await assertFails(updateDoc(theirCopy, { pad: 'x' }));
  await assertFails(updateDoc(theirCopy, { addedAt: 'later' }));
  await assertSucceeds(updateDoc(theirCopy, { name: 'Member', avatarEmoji: null }));
});

test('the receiver can only drop the sender outgoing doc while consuming the request', async () => {
  const vdb = dbAs(env, VICTIM);
  const sdb = dbAs(env, STRANGER);
  await assertSucceeds(requestPair(vdb, VICTIM, STRANGER).commit());
  await assertFails(deleteDoc(doc(sdb, 'players', VICTIM, 'friend_requests_sent', STRANGER)));
  await assertSucceeds(clearPair(sdb, VICTIM, STRANGER).commit());

  await assertSucceeds(requestPair(vdb, VICTIM, STRANGER).commit());
  await assertSucceeds(clearPair(vdb, VICTIM, STRANGER).commit());
});

test('profile avatars are bounded; a legacy long avatar does not block a rename', async () => {
  const uid = 'r2-avatar';
  const db = dbAs(env, uid);
  const ref = doc(db, 'players', uid);
  await assertFails(setDoc(ref, { name: 'A', anonymousUid: uid, avatarEmoji: 'x'.repeat(33) }));
  await assertSucceeds(setDoc(ref, { name: 'A', anonymousUid: uid, avatarEmoji: '🦊' }));
  await assertFails(updateDoc(ref, { avatarEmoji: 'x'.repeat(5000) }));
  await assertFails(updateDoc(ref, { avatarEmoji: 7 }));
  await assertSucceeds(updateDoc(ref, { avatarEmoji: null }));
  await seedDoc(env, `players/${uid}`, { name: 'A', anonymousUid: uid, avatarEmoji: 'x'.repeat(40) });
  await assertSucceeds(setDoc(ref, { name: 'B', anonymousUid: uid }, { merge: true }));
});

test('results, buy-ins and early cash-outs can only name session participants', async () => {
  const id = sid();
  await seedSession(env, id, { participantIds: [HOST, FRIEND] });
  const db = dbAs(env, HOST);
  const result = { playerName: 'Victim', totalBuyIn: 0, cashOut: 0, profit: 0, settledAt: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'sessions', id, 'results', VICTIM), result));
  await assertSucceeds(setDoc(doc(db, 'sessions', id, 'results', FRIEND), { ...result, playerName: 'Friend' }));
  await assertSucceeds(setDoc(doc(db, 'sessions', id, 'results', HOST), { ...result, playerName: 'Host' }));

  const buyIn = { playerId: VICTIM, playerName: 'Victim', amount: 5, createdAt: serverTimestamp() };
  await assertFails(setDoc(doc(collection(db, 'sessions', id, 'buy_ins')), buyIn));
  await assertSucceeds(setDoc(doc(collection(db, 'sessions', id, 'buy_ins')), { ...buyIn, playerId: FRIEND, playerName: 'Friend' }));

  const cashOut = { playerName: 'Victim', amount: 1, cashedOutAt: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'sessions', id, 'early_cashouts', VICTIM), cashOut));
  await assertSucceeds(setDoc(doc(db, 'sessions', id, 'early_cashouts', FRIEND), { ...cashOut, playerName: 'Friend' }));
});

test('clients cannot write migratedFrom on results or early cash-outs', async () => {
  const id = sid();
  await seedSession(env, id, { participantIds: [HOST, FRIEND] });
  const db = dbAs(env, HOST);
  await assertFails(
    setDoc(doc(db, 'sessions', id, 'results', FRIEND), {
      playerName: 'Friend',
      totalBuyIn: 0,
      cashOut: 0,
      profit: 0,
      migratedFrom: 'x'.repeat(1000),
    })
  );
  await assertFails(
    setDoc(doc(db, 'sessions', id, 'early_cashouts', FRIEND), { playerName: 'Friend', amount: 1, migratedFrom: 'guest_x' })
  );
});

function settleBatch(db: Firestore, sessionId: string, playerIds: string[]) {
  const batch = writeBatch(db);
  const playerResults: Record<string, unknown> = {};
  for (const p of playerIds) {
    const entry = { playerName: p, totalBuyIn: 10, cashOut: 10, profit: 0 };
    playerResults[p] = entry;
    batch.set(doc(db, 'sessions', sessionId, 'results', p), { ...entry, settledAt: serverTimestamp() });
  }
  batch.update(doc(db, 'sessions', sessionId), { status: 'finished', finishedAt: serverTimestamp(), playerResults });
  return batch;
}

test('legacy sessions without participantIds settle; the field cannot be dropped to get there', async () => {
  const legacy = sid();
  await seedSession(env, legacy, { participantIds: null });
  const db = dbAs(env, HOST);
  await assertSucceeds(settleBatch(db, legacy, [HOST, FRIEND, GUEST]).commit());

  const hostless = sid();
  await seedSession(env, hostless, { participantIds: [FRIEND, GUEST] });
  await assertSucceeds(settleBatch(db, hostless, [HOST, FRIEND, GUEST]).commit());

  const current = sid();
  await seedSession(env, current, { participantIds: [HOST, FRIEND] });
  await assertFails(updateDoc(doc(db, 'sessions', current), { participantIds: deleteField() }));
  await assertFails(settleBatch(db, current, [HOST, VICTIM]).commit());
});

test('only newly added playerResults keys must be participants', async () => {
  const id = sid();
  await seedSession(env, id, { status: 'finished', participantIds: [HOST, FRIEND] });
  const entry = { playerName: 'x', totalBuyIn: 1, cashOut: 1, profit: 0 };
  await seedDoc(env, `sessions/${id}`, {
    hostId: HOST,
    status: 'finished',
    participantIds: [HOST, FRIEND],
    playerResults: { [HOST]: entry, 'removed-player': entry },
  });
  const ref = doc(dbAs(env, HOST), 'sessions', id);
  await assertSucceeds(updateDoc(ref, { [`playerResults.${FRIEND}`]: entry }));
  await assertSucceeds(updateDoc(ref, { 'playerResults.removed-player': { ...entry, profit: 0 } }));
  await assertSucceeds(updateDoc(ref, { participantIds: arrayRemove(FRIEND) }));
  await assertFails(updateDoc(ref, { [`playerResults.${VICTIM}`]: entry }));
});

test('a stale membership cannot read the members of a deleted group', async () => {
  const groupId = gid();
  await seedGroup(groupId, OWNER, [OWNER, MEMBER]);
  const members = collection(dbAs(env, MEMBER), 'groups', groupId, 'members');
  await assertSucceeds(getDocs(members));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await deleteDoc(doc(ctx.firestore() as unknown as Firestore, 'groups', groupId));
  });
  await assertFails(getDocs(members));
});

test('a 50-player settle batch stays within the rules lookup budget', async () => {
  const id = sid();
  const ids = [HOST, ...Array.from({ length: 49 }, (_, i) => `guest_settle_${i}`)];
  await seedDoc(env, `sessions/${id}`, { hostId: HOST, status: 'active', participantIds: ids });
  await assertSucceeds(settleBatch(dbAs(env, HOST), id, ids).commit());
});
