import { after, before, test } from 'node:test';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

import { HOST, STRANGER, createRulesEnv, dbAs, nextSessionId, seedDoc, seedSession } from './helpers.ts';

const FRIEND = 'friend-uid';
const VICTIM = 'victim-uid';
const OWNER = 'owner-uid';
const CO_MEMBER = 'co-member-uid';
const GUEST = 'guest_bob';

let env: RulesTestEnvironment;

before(async () => {
  env = await createRulesEnv();
  await env.clearFirestore();
  for (const [uid, name] of [
    [HOST, 'Host'],
    [FRIEND, 'Friend'],
    [VICTIM, 'Victim'],
    [OWNER, 'Owner'],
    [CO_MEMBER, 'Co Member'],
    [STRANGER, 'Stranger'],
  ]) {
    await seedDoc(env, `players/${uid}`, { name, anonymousUid: uid });
  }
  await seedDoc(env, `players/${HOST}/friends/${FRIEND}`, { name: 'Friend' });
  await seedDoc(env, `players/${FRIEND}/friends/${HOST}`, { name: 'Host' });
  await seedDoc(env, `players/${OWNER}/friends/${FRIEND}`, { name: 'Friend' });
  await seedDoc(env, `players/${OWNER}/friends/${HOST}`, { name: 'Host' });
  await seedDoc(env, `players/${OWNER}/friends/${CO_MEMBER}`, { name: 'Co Member' });
});

after(async () => {
  await env.cleanup();
});

const sid = () => nextSessionId('consent');

function sessionCreateBatch(db: Firestore, sessionId: string, extra: Record<string, unknown> = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'sessions', sessionId), {
    hostId: HOST,
    date: serverTimestamp(),
    location: 'Home',
    status: 'active',
    smallBlind: 1,
    bigBlind: 2,
    amountUnit: 'cash',
    dollarsPerChip: null,
    participantIds: [HOST],
    ...extra,
  });
  batch.set(
    doc(db, 'sessions', sessionId, 'session_participants', HOST),
    { playerId: HOST, playerName: 'Host', joinedAt: serverTimestamp() },
    { merge: true }
  );
  return batch;
}

function addPlayerBatch(db: Firestore, sessionId: string, playerId: string, playerName = playerId) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'sessions', sessionId, 'buy_ins')), {
    playerId,
    playerName,
    amount: 50,
    createdAt: serverTimestamp(),
  });
  batch.set(
    doc(db, 'sessions', sessionId, 'session_participants', playerId),
    { playerId, playerName, joinedAt: serverTimestamp() },
    { merge: true }
  );
  batch.update(doc(db, 'sessions', sessionId), { participantIds: arrayUnion(playerId) });
  return batch;
}

async function createdSession(extra: Record<string, unknown> = {}): Promise<string> {
  const id = sid();
  await assertSucceeds(sessionCreateBatch(dbAs(env, HOST), id, extra).commit());
  return id;
}

test('createSession shape: host-only participantIds, then friends and guests are added one per write', async () => {
  const id = await createdSession();
  const db = dbAs(env, HOST);
  await assertSucceeds(addPlayerBatch(db, id, FRIEND, 'Friend').commit());
  await assertSucceeds(addPlayerBatch(db, id, GUEST, 'Bob').commit());
  await assertSucceeds(addPlayerBatch(db, id, FRIEND, 'Friend').commit());
});

test('a session cannot be created already naming other players, registered or not', async () => {
  const db = dbAs(env, HOST);
  await assertFails(sessionCreateBatch(db, sid(), { participantIds: [HOST, VICTIM] }).commit());
  await assertFails(sessionCreateBatch(db, sid(), { participantIds: [HOST, FRIEND] }).commit());
  await assertFails(sessionCreateBatch(db, sid(), { participantIds: [HOST, GUEST] }).commit());
  await assertFails(sessionCreateBatch(db, sid(), { participantIds: [] }).commit());
});

test('a stranger host cannot add a registered user who is not their friend', async () => {
  const id = sid();
  const db = dbAs(env, STRANGER);
  const batch = writeBatch(db);
  batch.set(doc(db, 'sessions', id), { hostId: STRANGER, status: 'active', date: serverTimestamp(), participantIds: [STRANGER] });
  await assertSucceeds(batch.commit());
  await assertFails(addPlayerBatch(db, id, VICTIM).commit());
  await assertFails(updateDoc(doc(db, 'sessions', id), { participantIds: arrayUnion(VICTIM) }));
  await assertFails(
    setDoc(doc(db, 'sessions', id, 'session_participants', VICTIM), {
      playerId: VICTIM,
      playerName: 'Victim',
      joinedAt: serverTimestamp(),
    })
  );
});

test('participantIds may grow by only one new id per write', async () => {
  const id = await createdSession();
  const ref = doc(dbAs(env, HOST), 'sessions', id);
  await assertFails(updateDoc(ref, { participantIds: arrayUnion(FRIEND, GUEST) }));
  await assertFails(updateDoc(ref, { participantIds: [HOST, GUEST, FRIEND] }));
  await assertFails(updateDoc(ref, { participantIds: [FRIEND, HOST] }));
  await assertSucceeds(updateDoc(ref, { participantIds: arrayUnion(FRIEND) }));
});

test('a group session lets the host add co-members of a group they belong to', async () => {
  const groupId = 'g-shared';
  await seedDoc(env, `groups/${groupId}`, { name: 'G', ownerId: OWNER, memberCount: 2 });
  await seedDoc(env, `groups/${groupId}/members/${HOST}`, { name: 'Host', isRegistered: true });
  await seedDoc(env, `groups/${groupId}/members/${CO_MEMBER}`, { name: 'Co Member', isRegistered: true });
  await seedDoc(env, `players/${HOST}/group_memberships/${groupId}`, {
    name: 'G',
    memberCount: 2,
    ownerId: OWNER,
    role: 'member',
  });
  await seedDoc(env, `players/${CO_MEMBER}/group_memberships/${groupId}`, {
    name: 'G',
    memberCount: 2,
    ownerId: OWNER,
    role: 'member',
  });
  const db = dbAs(env, HOST);
  await assertFails(addPlayerBatch(db, await createdSession(), CO_MEMBER).commit());
  const id = await createdSession({ groupId });
  await assertSucceeds(addPlayerBatch(db, id, CO_MEMBER, 'Co Member').commit());
  await assertFails(addPlayerBatch(db, id, VICTIM).commit());
  await assertFails(sessionCreateBatch(db, sid(), { groupId: 'g-not-mine' }).commit());
});

test('session create rejects unknown fields, long locations and non-string locations', async () => {
  const db = dbAs(env, HOST);
  await assertFails(sessionCreateBatch(db, sid(), { pad: 'x' }).commit());
  await assertFails(sessionCreateBatch(db, sid(), { playerResults: {} }).commit());
  await assertFails(sessionCreateBatch(db, sid(), { location: 'x'.repeat(101) }).commit());
  await assertFails(sessionCreateBatch(db, sid(), { location: { toString: 1 } }).commit());
  await assertSucceeds(sessionCreateBatch(db, sid(), { location: 'x'.repeat(100) }).commit());
});

test('session update is limited to app fields and bounded values', async () => {
  const id = await createdSession();
  const ref = doc(dbAs(env, HOST), 'sessions', id);
  await assertFails(updateDoc(ref, { pad: 'x' }));
  await assertFails(updateDoc(ref, { groupId: 'g-shared' }));
  await assertFails(updateDoc(ref, { location: 'x'.repeat(101) }));
  await assertFails(updateDoc(ref, { location: 7 }));
  await assertSucceeds(updateDoc(ref, { location: 'Club' }));
  await assertSucceeds(updateDoc(ref, { location: null }));
});

test('participantIds and playerResults are capped at 50 entries', async () => {
  const id = sid();
  const ids = [HOST, ...Array.from({ length: 49 }, (_, i) => `guest_${i}`)];
  await seedSession(env, id, { participantIds: ids });
  const db = dbAs(env, HOST);
  await assertFails(addPlayerBatch(db, id, 'guest_extra').commit());
  const tooMany = Object.fromEntries(
    [...ids, 'guest_extra'].map((p) => [p, { playerName: p, totalBuyIn: 0, cashOut: 0, profit: 0 }])
  );
  await assertFails(updateDoc(doc(db, 'sessions', id), { playerResults: tooMany }));
});

function settleBatch(db: Firestore, sessionId: string, playerIds: string[]) {
  const batch = writeBatch(db);
  const playerResults: Record<string, unknown> = {};
  for (const p of playerIds) {
    const entry = { playerName: p, totalBuyIn: 50, cashOut: 50, profit: 0 };
    playerResults[p] = entry;
    batch.set(doc(db, 'sessions', sessionId, 'results', p), { ...entry, settledAt: serverTimestamp() });
  }
  batch.update(doc(db, 'sessions', sessionId), {
    status: 'finished',
    finishedAt: serverTimestamp(),
    playerResults,
  });
  return batch;
}

test('settleSession batch passes for participants; playerResults cannot credit outsiders', async () => {
  const id = await createdSession();
  const db = dbAs(env, HOST);
  await assertSucceeds(addPlayerBatch(db, id, FRIEND, 'Friend').commit());
  await assertSucceeds(addPlayerBatch(db, id, GUEST, 'Bob').commit());
  await assertFails(settleBatch(db, id, [HOST, FRIEND, VICTIM]).commit());
  await assertSucceeds(settleBatch(db, id, [HOST, FRIEND, GUEST]).commit());
  await assertSucceeds(updateDoc(doc(db, 'sessions', id), { playerResults: {} }));
});

test('host can still edit a session whose existing participant has no profile', async () => {
  const id = sid();
  await seedSession(env, id, { status: 'finished', participantIds: [HOST, VICTIM, 'deleted-uid'] });
  await seedDoc(env, `sessions/${id}`, {
    hostId: HOST,
    status: 'finished',
    participantIds: [HOST, VICTIM, 'deleted-uid'],
    playerResults: { 'deleted-uid': { playerName: 'Deleted player', totalBuyIn: 1, cashOut: 0, profit: -1 } },
  });
  await assertSucceeds(updateDoc(doc(dbAs(env, HOST), 'sessions', id), { location: 'Home' }));
});

test('removePlayerBuyIns batch removes the player from the session in one write', async () => {
  const id = await createdSession();
  const db = dbAs(env, HOST);
  await assertSucceeds(addPlayerBatch(db, id, FRIEND, 'Friend').commit());
  await seedDoc(env, `sessions/${id}/early_cashouts/${FRIEND}`, { playerName: 'Friend', amount: 10 });
  await seedDoc(env, `sessions/${id}/buy_ins/extra`, { playerId: FRIEND, playerName: 'Friend', amount: 5 });
  const batch = writeBatch(db);
  batch.delete(doc(db, 'sessions', id, 'buy_ins', 'extra'));
  batch.update(doc(db, 'sessions', id), { participantIds: arrayRemove(FRIEND) });
  batch.delete(doc(db, 'sessions', id, 'session_participants', FRIEND));
  batch.delete(doc(db, 'sessions', id, 'early_cashouts', FRIEND));
  await assertSucceeds(batch.commit());

  const noBuyIns = writeBatch(db);
  noBuyIns.update(doc(db, 'sessions', id), { participantIds: arrayRemove(GUEST) });
  noBuyIns.delete(doc(db, 'sessions', id, 'session_participants', GUEST));
  noBuyIns.delete(doc(db, 'sessions', id, 'early_cashouts', GUEST));
  await assertSucceeds(noBuyIns.commit());
});

test('session subcollection docs have a fixed shape and bounded player names', async () => {
  const id = await createdSession();
  const db = dbAs(env, HOST);
  await assertFails(addPlayerBatch(db, id, GUEST, 'x'.repeat(65)).commit());
  await assertFails(
    setDoc(doc(collection(db, 'sessions', id, 'buy_ins')), {
      playerId: HOST,
      playerName: 'Host',
      amount: 5,
      pad: 'x',
    })
  );
  await assertFails(
    setDoc(doc(db, 'sessions', id, 'early_cashouts', HOST), { playerName: 'x'.repeat(65), amount: 1 })
  );
  await assertFails(
    setDoc(doc(db, 'sessions', id, 'results', HOST), {
      playerName: 'Host',
      totalBuyIn: 1,
      cashOut: 1,
      profit: 0,
      pad: 'x',
    })
  );
  await assertFails(
    setDoc(doc(db, 'sessions', id, 'session_participants', HOST), {
      playerId: HOST,
      playerName: 'Host',
      pad: 'x',
    })
  );
  await assertSucceeds(
    setDoc(doc(db, 'sessions', id, 'early_cashouts', HOST), {
      playerName: 'Host',
      amount: 1,
      cashedOutAt: serverTimestamp(),
    })
  );
});

async function createGroupAs(uid: string, groupId: string, db = dbAs(env, uid)) {
  await assertSucceeds(
    setDoc(doc(db, 'groups', groupId), { name: 'Poker', ownerId: uid, memberCount: 0, createdAt: serverTimestamp() })
  );
  await assertSucceeds(
    setDoc(doc(db, 'players', uid, 'group_memberships', groupId), {
      name: 'Poker',
      memberCount: 0,
      ownerId: uid,
      role: 'owner',
      groupCreatedAt: serverTimestamp(),
    })
  );
}

let groupCounter = 0;
const gid = () => `consent-group-${++groupCounter}`;

async function addMemberTx(db: Firestore, groupId: string, memberId: string, data: Record<string, unknown>) {
  const groupRef = doc(db, 'groups', groupId);
  const memberRef = doc(db, 'groups', groupId, 'members', memberId);
  await runTransaction(db, async (tx) => {
    await tx.get(groupRef);
    const existing = await tx.get(memberRef);
    tx.set(memberRef, data);
    if (!existing.exists()) tx.update(groupRef, { memberCount: increment(1) });
  });
}

function syncMembershipsBatch(db: Firestore, groupId: string, ownerId: string, ids: string[], memberCount: number) {
  const batch = writeBatch(db);
  for (const pid of ids) {
    batch.set(
      doc(db, 'players', pid, 'group_memberships', groupId),
      { name: 'Poker', memberCount, ownerId, role: pid === ownerId ? 'owner' : 'member', groupCreatedAt: new Date() },
      { merge: true }
    );
  }
  return batch;
}

test('createGroup shape passes; groups create rejects extra fields, long names and preset counts', async () => {
  const db = dbAs(env, OWNER);
  await createGroupAs(OWNER, gid());
  await assertFails(setDoc(doc(db, 'groups', gid()), { name: 'G', ownerId: OWNER, memberCount: 0, pad: 'x' }));
  await assertFails(setDoc(doc(db, 'groups', gid()), { name: 'x'.repeat(65), ownerId: OWNER, memberCount: 0 }));
  await assertFails(setDoc(doc(db, 'groups', gid()), { name: 'G', ownerId: OWNER, memberCount: 99 }));
  await assertFails(setDoc(doc(db, 'groups', gid()), { name: 'G', ownerId: VICTIM, memberCount: 0 }));
});

test('group owner cannot reassign ownerId or write unknown fields; rename still works', async () => {
  const groupId = gid();
  await createGroupAs(OWNER, groupId);
  const ref = doc(dbAs(env, OWNER), 'groups', groupId);
  await assertFails(updateDoc(ref, { ownerId: VICTIM }));
  await assertFails(updateDoc(ref, { pad: 'x' }));
  await assertFails(updateDoc(ref, { name: '' }));
  await assertSucceeds(updateDoc(ref, { name: 'Renamed' }));
});

test('addGroupMember: friends, self and guests can be added; registered strangers cannot', async () => {
  const groupId = gid();
  await createGroupAs(OWNER, groupId);
  const db = dbAs(env, OWNER);
  await assertSucceeds(addMemberTx(db, groupId, FRIEND, { name: 'Friend', isRegistered: true, avatarEmoji: null }));
  await assertSucceeds(addMemberTx(db, groupId, OWNER, { name: 'Owner', isRegistered: true, avatarEmoji: '🦊' }));
  await assertSucceeds(addMemberTx(db, groupId, 'dave', { name: 'Dave', isRegistered: false, avatarEmoji: null }));
  await assertSucceeds(syncMembershipsBatch(db, groupId, OWNER, [OWNER, FRIEND], 3).commit());

  await assertFails(addMemberTx(db, groupId, VICTIM, { name: 'Victim', isRegistered: true, avatarEmoji: null }));
  await assertFails(addMemberTx(db, groupId, VICTIM, { name: 'Victim', isRegistered: false, avatarEmoji: null }));
  await assertFails(addMemberTx(db, groupId, 'erin', { name: 'Erin', isRegistered: false, pad: 'x' }));
  await assertFails(addMemberTx(db, groupId, 'erin', { name: 'x'.repeat(65), isRegistered: false }));
  await assertFails(updateDoc(doc(db, 'groups', groupId, 'members', 'dave'), { isRegistered: true }));
});

test('group_memberships cannot be forced onto a non-friend or spoofed', async () => {
  const groupId = gid();
  await createGroupAs(STRANGER, groupId);
  const db = dbAs(env, STRANGER);
  const forced = doc(db, 'players', VICTIM, 'group_memberships', groupId);
  await assertFails(
    setDoc(forced, { name: 'G', memberCount: 1, ownerId: STRANGER, role: 'member', groupCreatedAt: serverTimestamp() })
  );
  await assertFails(setDoc(doc(db, 'groups', groupId, 'members', VICTIM), { name: 'Victim', isRegistered: true }));

  const ownerGroup = gid();
  await createGroupAs(OWNER, ownerGroup);
  const odb = dbAs(env, OWNER);
  await assertSucceeds(addMemberTx(odb, ownerGroup, FRIEND, { name: 'Friend', isRegistered: true, avatarEmoji: null }));
  const friendDoc = doc(odb, 'players', FRIEND, 'group_memberships', ownerGroup);
  await assertFails(setDoc(friendDoc, { name: 'G', memberCount: 1, ownerId: OWNER, role: 'owner' }));
  await assertFails(setDoc(friendDoc, { name: 'G', memberCount: 1, ownerId: FRIEND, role: 'member' }));
  await assertFails(setDoc(friendDoc, { name: 'G', memberCount: 1, ownerId: OWNER, role: 'member', pad: 'x' }));
  await assertFails(
    setDoc(doc(odb, 'players', CO_MEMBER, 'group_memberships', ownerGroup), {
      name: 'G',
      memberCount: 1,
      ownerId: OWNER,
      role: 'member',
    })
  );
  await assertSucceeds(setDoc(friendDoc, { name: 'G', memberCount: 1, ownerId: OWNER, role: 'member' }));
  await assertFails(updateDoc(friendDoc, { role: 'owner' }));
  await assertFails(updateDoc(friendDoc, { pad: 'x' }));
});

test('owner sync still updates a legacy membership doc that carries joinedAt', async () => {
  const groupId = gid();
  await createGroupAs(OWNER, groupId);
  await seedDoc(env, `groups/${groupId}/members/${FRIEND}`, { name: 'Friend', isRegistered: true });
  await seedDoc(env, `players/${FRIEND}/group_memberships/${groupId}`, {
    name: 'Poker',
    memberCount: 1,
    ownerId: OWNER,
    role: 'member',
    joinedAt: new Date(),
  });
  await assertSucceeds(syncMembershipsBatch(dbAs(env, OWNER), groupId, OWNER, [OWNER, FRIEND], 1).commit());
});

test('leaveGroup transaction passes; a member cannot decrement memberCount without leaving', async () => {
  const groupId = gid();
  await createGroupAs(OWNER, groupId);
  const odb = dbAs(env, OWNER);
  await assertSucceeds(addMemberTx(odb, groupId, FRIEND, { name: 'Friend', isRegistered: true, avatarEmoji: null }));
  await assertSucceeds(addMemberTx(odb, groupId, 'dave', { name: 'Dave', isRegistered: false, avatarEmoji: null }));
  await assertSucceeds(syncMembershipsBatch(odb, groupId, OWNER, [OWNER, FRIEND], 2).commit());

  const fdb = dbAs(env, FRIEND);
  const groupRef = doc(fdb, 'groups', groupId);
  await assertFails(updateDoc(groupRef, { memberCount: increment(-1) }));
  await assertSucceeds(
    runTransaction(fdb, async (tx) => {
      await tx.get(groupRef);
      tx.delete(doc(fdb, 'groups', groupId, 'members', FRIEND));
      tx.update(groupRef, { memberCount: increment(-1) });
    })
  );
  await assertSucceeds(deleteDoc(doc(fdb, 'players', FRIEND, 'group_memberships', groupId)));
  await assertFails(updateDoc(groupRef, { memberCount: increment(-1) }));
});

test('removeGroupMember transaction deletes member and membership and decrements the count', async () => {
  const groupId = gid();
  await createGroupAs(OWNER, groupId);
  const db = dbAs(env, OWNER);
  await assertSucceeds(addMemberTx(db, groupId, FRIEND, { name: 'Friend', isRegistered: true, avatarEmoji: null }));
  await assertSucceeds(syncMembershipsBatch(db, groupId, OWNER, [OWNER, FRIEND], 1).commit());
  const groupRef = doc(db, 'groups', groupId);
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      const g = await tx.get(groupRef);
      tx.delete(doc(db, 'groups', groupId, 'members', FRIEND));
      tx.delete(doc(db, 'players', FRIEND, 'group_memberships', groupId));
      tx.update(groupRef, { memberCount: Number(g.data()?.memberCount ?? 0) - 1 });
    })
  );
});

function sendRequestBatch(db: Firestore, from: string, fromName: string, to: string, toName: string) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'players', to, 'friend_requests', from), {
    name: fromName,
    avatarEmoji: null,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'players', from, 'friend_requests_sent', to), {
    name: toName,
    avatarEmoji: null,
    createdAt: serverTimestamp(),
  });
  return batch;
}

function acceptBatch(db: Firestore, me: string, meName: string, friend: string, friendName: string, consume = true) {
  const batch = writeBatch(db);
  if (consume) batch.delete(doc(db, 'players', me, 'friend_requests', friend));
  batch.delete(doc(db, 'players', friend, 'friend_requests_sent', me));
  batch.delete(doc(db, 'players', me, 'friend_requests_sent', friend));
  batch.delete(doc(db, 'players', friend, 'friend_requests', me));
  batch.set(doc(db, 'players', me, 'friends', friend), { name: friendName, avatarEmoji: null, addedAt: serverTimestamp() });
  batch.set(doc(db, 'players', friend, 'friends', me), { name: meName, avatarEmoji: null, addedAt: serverTimestamp() });
  return batch;
}

function removeFriendBatch(db: Firestore, me: string, friend: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'players', me, 'friends', friend));
  batch.delete(doc(db, 'players', friend, 'friends', me));
  batch.delete(doc(db, 'players', me, 'friend_requests', friend));
  batch.delete(doc(db, 'players', friend, 'friend_requests_sent', me));
  batch.delete(doc(db, 'players', me, 'friend_requests_sent', friend));
  batch.delete(doc(db, 'players', friend, 'friend_requests', me));
  return batch;
}

test('commitFriendAccept batch passes; accepting without consuming the request fails; no replay', async () => {
  const vdb = dbAs(env, VICTIM);
  const sdb = dbAs(env, STRANGER);
  await assertSucceeds(sendRequestBatch(vdb, VICTIM, 'Victim', STRANGER, 'Stranger').commit());
  await assertFails(acceptBatch(sdb, STRANGER, 'Stranger', VICTIM, 'Victim', false).commit());
  await assertSucceeds(acceptBatch(sdb, STRANGER, 'Stranger', VICTIM, 'Victim').commit());
  await assertSucceeds(removeFriendBatch(vdb, VICTIM, STRANGER).commit());
  await assertFails(
    setDoc(doc(sdb, 'players', VICTIM, 'friends', STRANGER), { name: 'Stranger', avatarEmoji: null })
  );
  await assertFails(
    setDoc(doc(sdb, 'players', STRANGER, 'friends', VICTIM), { name: 'Victim', avatarEmoji: null })
  );
});

test('friend request docs have a fixed shape and bounded names', async () => {
  const db = dbAs(env, CO_MEMBER);
  await assertFails(
    setDoc(doc(db, 'players', VICTIM, 'friend_requests', CO_MEMBER), { name: 'Co Member', pad: 'x'.repeat(1000) })
  );
  await assertFails(
    setDoc(doc(db, 'players', CO_MEMBER, 'friend_requests_sent', VICTIM), { name: 'x'.repeat(65) })
  );
  await assertFails(
    setDoc(doc(db, 'players', CO_MEMBER, 'friend_requests_sent', VICTIM), { name: 'Victim', pad: 1 })
  );
  await assertFails(
    setDoc(doc(db, 'players', VICTIM, 'friend_requests', CO_MEMBER), { name: 'Co Member', avatarEmoji: 'x'.repeat(33) })
  );
  await assertSucceeds(sendRequestBatch(db, CO_MEMBER, 'Co Member', VICTIM, 'Victim').commit());
});

test('referral codes must use the generator alphabet and length', async () => {
  const db = dbAs(env, FRIEND);
  await assertFails(setDoc(doc(db, 'refCodes', 'ABCDEI'), { playerId: FRIEND }));
  await assertFails(setDoc(doc(db, 'refCodes', 'ABC12'), { playerId: FRIEND }));
  await assertFails(setDoc(doc(db, 'refCodes', 'abcdef'), { playerId: FRIEND }));
  await assertFails(setDoc(doc(db, 'refCodes', 'ABCDEFG'), { playerId: FRIEND }));
  await assertSucceeds(setDoc(doc(db, 'refCodes', 'ABCD23'), { playerId: FRIEND }));
});
