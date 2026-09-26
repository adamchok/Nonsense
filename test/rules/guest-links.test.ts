import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

import {
  acceptGuestLinkIn,
  declineGuestLinkIn,
  guestLinkId,
  parseGuestLink,
  requestGuestLinkIn,
  summarizeGuestIn,
  type GuestLink,
} from '../../lib/guest-link-store.ts';
import {
  HOST,
  OTHER_PLAYER,
  PLAYER,
  STRANGER,
  createRulesEnv,
  dbAs,
  nextSessionId,
  seedDoc,
  seedSession,
} from './helpers.ts';

let env: RulesTestEnvironment;

const TARGET = PLAYER;
const SETTLED_AT = Timestamp.fromDate(new Date('2026-01-02T03:04:05Z'));
const CASHED_OUT_AT = Timestamp.fromDate(new Date('2026-01-02T01:00:00Z'));

before(async () => {
  env = await createRulesEnv();
  await env.clearFirestore();
  await seedDoc(env, `players/${HOST}`, { name: 'Host', anonymousUid: HOST });
  await seedDoc(env, `players/${TARGET}`, { name: 'Bryan Real', anonymousUid: TARGET, avatarEmoji: '🦊' });
  await seedDoc(env, `players/${OTHER_PLAYER}`, { name: 'Other', anonymousUid: OTHER_PLAYER });
  await seedDoc(env, `players/${HOST}/friends/${TARGET}`, { name: 'Bryan Real' });
});

after(async () => {
  await env.cleanup();
});

let guestCounter = 0;
const nextGuest = () => {
  guestCounter += 1;
  return `guest_${guestCounter}`;
};
const sid = () => nextSessionId('guest-links');

function linkFor(
  guestId: string,
  status: GuestLink['status'] = 'pending',
  sessions: Record<string, number> = {}
): GuestLink {
  const values = Object.values(sessions);
  return {
    id: guestLinkId(HOST, guestId),
    ownerId: HOST,
    ownerName: 'Host',
    guestId,
    guestName: 'Bryan',
    targetId: TARGET,
    targetName: 'Bryan Real',
    status,
    sessionCount: values.length,
    net: values.reduce((a, b) => a + b, 0),
    sessions,
  };
}

function linkDoc(link: GuestLink, extra: Record<string, unknown> = {}) {
  const { id: _id, ...rest } = link;
  return { ...rest, createdAt: serverTimestamp(), ...extra };
}

async function seedLink(
  guestId: string,
  status: GuestLink['status'],
  sessions: Record<string, number> = {}
): Promise<GuestLink> {
  const link = linkFor(guestId, status, sessions);
  const { id: _id, ...rest } = link;
  await seedDoc(env, `guest_links/${link.id}`, { ...rest, createdAt: new Date() });
  return link;
}

async function seedGuestSession(guestId: string, opts: { hostId?: string; buyIns?: number; status?: 'active' | 'finished' } = {}) {
  const id = sid();
  const { hostId = HOST, buyIns = 2, status = 'finished' } = opts;
  await seedSession(env, id, { status, participantIds: [HOST, guestId, OTHER_PLAYER] });
  if (hostId !== HOST) await seedDoc(env, `sessions/${id}`, { hostId, status, participantIds: [hostId, guestId] });
  await seedDoc(env, `sessions/${id}/results/${guestId}`, {
    playerName: 'Bryan',
    totalBuyIn: 100,
    cashOut: 250.5,
    profit: 150.5,
    settledAt: SETTLED_AT,
  });
  await seedDoc(env, `sessions/${id}/results/${OTHER_PLAYER}`, {
    playerName: 'Other',
    totalBuyIn: 100,
    cashOut: 0,
    profit: -100,
    settledAt: SETTLED_AT,
  });
  await seedDoc(env, `sessions/${id}/early_cashouts/${guestId}`, {
    playerName: 'Bryan',
    amount: 250.5,
    cashedOutAt: CASHED_OUT_AT,
  });
  for (let i = 0; i < buyIns; i += 1) {
    await seedDoc(env, `sessions/${id}/buy_ins/b${i}`, {
      playerId: guestId,
      playerName: 'Bryan',
      amount: 50,
      createdAt: new Date(),
    });
  }
  await seedDoc(env, `sessions/${id}/buy_ins/other`, {
    playerId: OTHER_PLAYER,
    playerName: 'Other',
    amount: 100,
    createdAt: new Date(),
  });
  return id;
}

function migrationBatch(db: Firestore, sessionId: string, guestId: string, overrides: Record<string, unknown> = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'sessions', sessionId, 'results', TARGET), {
    totalBuyIn: 100,
    cashOut: 250.5,
    profit: 150.5,
    settledAt: SETTLED_AT,
    playerName: 'Bryan Real',
    migratedFrom: guestId,
    ...overrides,
  });
  batch.delete(doc(db, 'sessions', sessionId, 'results', guestId));
  batch.set(doc(db, 'sessions', sessionId, 'early_cashouts', TARGET), {
    amount: 250.5,
    cashedOutAt: CASHED_OUT_AT,
    playerName: 'Bryan Real',
    migratedFrom: guestId,
  });
  batch.delete(doc(db, 'sessions', sessionId, 'early_cashouts', guestId));
  batch.update(doc(db, 'sessions', sessionId, 'buy_ins', 'b0'), { playerId: TARGET, playerName: 'Bryan Real' });
  batch.update(doc(db, 'sessions', sessionId, 'buy_ins', 'b1'), { playerId: TARGET, playerName: 'Bryan Real' });
  batch.set(doc(db, 'sessions', sessionId, 'session_participants', TARGET), {
    playerId: TARGET,
    playerName: 'Bryan Real',
    joinedAt: new Date(),
  });
  batch.delete(doc(db, 'sessions', sessionId, 'session_participants', guestId));
  batch.update(doc(db, 'sessions', sessionId), { participantIds: [HOST, TARGET, OTHER_PLAYER] });
  return batch;
}

test('owner can request a link for a friend and a non-player guest id; summary is computed', async () => {
  const guest = nextGuest();
  await seedGuestSession(guest);
  await seedGuestSession(guest, { status: 'active' });
  const db = dbAs(env, HOST);
  assert.deepEqual(await summarizeGuestIn(db, HOST, guest), { sessionCount: 1, net: 150.5 });
  await assertSucceeds(
    requestGuestLinkIn(db, {
      ownerId: HOST,
      ownerName: 'Host',
      guestId: guest,
      guestName: 'Bryan',
      targetId: TARGET,
      targetName: 'Bryan Real',
    })
  );
  const snap = await getDoc(doc(db, 'guest_links', guestLinkId(HOST, guest)));
  assert.equal(snap.data()?.status, 'pending');
  assert.equal(snap.data()?.sessionCount, 1);
  assert.equal(snap.data()?.net, 150.5);
  assert.deepEqual(Object.values(snap.data()?.sessions), [150.5]);
});

test('link create is rejected for non-friends, real players, strangers, forged ids and pre-accepted links', async () => {
  const guest = nextGuest();
  const host = dbAs(env, HOST);
  const base = linkFor(guest);
  await assertFails(setDoc(doc(host, 'guest_links', base.id), linkDoc({ ...base, targetId: STRANGER })));
  await assertFails(
    setDoc(doc(host, 'guest_links', guestLinkId(HOST, OTHER_PLAYER)), linkDoc({ ...base, guestId: OTHER_PLAYER }))
  );
  await assertFails(setDoc(doc(host, 'guest_links', base.id), linkDoc(base, { status: 'accepted' })));
  await assertFails(setDoc(doc(host, 'guest_links', `${HOST}_someone_else`), linkDoc(base)));
  await assertFails(setDoc(doc(host, 'guest_links', base.id), linkDoc(base, { extra: true })));
  await assertFails(setDoc(doc(host, 'guest_links', base.id), linkDoc(base, { sessionCount: 1.5 })));
  await assertFails(setDoc(doc(host, 'guest_links', base.id), linkDoc({ ...base, targetId: HOST })));
  await assertFails(setDoc(doc(dbAs(env, STRANGER), 'guest_links', base.id), linkDoc(base)));
  await assertFails(setDoc(doc(dbAs(env, TARGET), 'guest_links', base.id), linkDoc(base)));
  await assertSucceeds(setDoc(doc(host, 'guest_links', base.id), linkDoc(base)));
});

test('only the target can accept, and only status/acceptedAt may change', async () => {
  const link = await seedLink(nextGuest(), 'pending');
  await assertFails(acceptGuestLinkIn(dbAs(env, HOST), link));
  await assertFails(acceptGuestLinkIn(dbAs(env, STRANGER), link));
  await assertFails(
    updateDoc(doc(dbAs(env, TARGET), 'guest_links', link.id), {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
      net: 999,
    })
  );
  await assertSucceeds(acceptGuestLinkIn(dbAs(env, TARGET), link));
  await assertFails(
    updateDoc(doc(dbAs(env, TARGET), 'guest_links', link.id), { status: 'pending', acceptedAt: serverTimestamp() })
  );
});

test('owner and target can read and query their links; a stranger cannot', async () => {
  const link = await seedLink(nextGuest(), 'pending');
  await assertSucceeds(getDoc(doc(dbAs(env, HOST), 'guest_links', link.id)));
  await assertSucceeds(getDoc(doc(dbAs(env, TARGET), 'guest_links', link.id)));
  await assertFails(getDoc(doc(dbAs(env, STRANGER), 'guest_links', link.id)));
  await assertSucceeds(getDocs(query(collection(dbAs(env, TARGET), 'guest_links'), where('targetId', '==', TARGET))));
  await assertSucceeds(getDocs(query(collection(dbAs(env, HOST), 'guest_links'), where('ownerId', '==', HOST))));
  await assertFails(getDocs(query(collection(dbAs(env, STRANGER), 'guest_links'), where('targetId', '==', TARGET))));
  await assertFails(getDocs(collection(dbAs(env, STRANGER), 'guest_links')));
});

test('target can decline, owner can cancel, a stranger cannot delete', async () => {
  const declined = await seedLink(nextGuest(), 'pending');
  await assertFails(deleteDoc(doc(dbAs(env, STRANGER), 'guest_links', declined.id)));
  await assertSucceeds(declineGuestLinkIn(dbAs(env, TARGET), declined));
  const cancelled = await seedLink(nextGuest(), 'accepted');
  await assertSucceeds(deleteDoc(doc(dbAs(env, HOST), 'guest_links', cancelled.id)));
});

test('link create requires sessionCount to match the frozen map, caps its size and restricts guest ids', async () => {
  const guest = nextGuest();
  const host = dbAs(env, HOST);
  const base = linkFor(guest, 'pending', { s1: 10, s2: -5 });
  await assertFails(setDoc(doc(host, 'guest_links', base.id), linkDoc({ ...base, sessionCount: 1 })));
  await assertFails(setDoc(doc(host, 'guest_links', base.id), linkDoc(base, { sessions: ['s1', 's2'] })));
  const { sessions: _s, ...noSessions } = linkDoc(base);
  await assertFails(setDoc(doc(host, 'guest_links', base.id), noSessions));
  const tooMany = Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`s${i}`, 1]));
  await assertFails(setDoc(doc(host, 'guest_links', base.id), linkDoc(linkFor(guest, 'pending', tooMany))));
  const longGuest = 'g'.repeat(65);
  await assertFails(setDoc(doc(host, 'guest_links', guestLinkId(HOST, longGuest)), linkDoc(linkFor(longGuest))));
  const reserved = '__x__';
  await assertFails(setDoc(doc(host, 'guest_links', guestLinkId(HOST, reserved)), linkDoc(linkFor(reserved))));
  const maxed = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`s${i}`, 1]));
  await assertSucceeds(setDoc(doc(host, 'guest_links', base.id), linkDoc(linkFor(guest, 'pending', maxed))));
  const unicodeGuest = 'josé_ñ';
  await assertSucceeds(
    setDoc(doc(host, 'guest_links', guestLinkId(HOST, unicodeGuest)), linkDoc(linkFor(unicodeGuest)))
  );
});

test('parsed links derive sessionCount and net from the frozen map, not the stored totals', () => {
  const link = parseGuestLink('x', {
    ownerId: HOST,
    guestId: 'g',
    targetId: TARGET,
    status: 'accepted',
    sessionCount: 99,
    net: 9999,
    sessions: { a: 10.1, b: -2.55, c: 'bad' },
  });
  assert.equal(link.sessionCount, 2);
  assert.equal(link.net, 7.55);
  assert.deepEqual(link.sessions, { a: 10.1, b: -2.55 });
  assert.equal(parseGuestLink('y', { sessions: null }).net, 0);
});

test('with an accepted link the host still cannot write guest history onto the target of a finished session', async () => {
  const guest = nextGuest();
  const id = await seedGuestSession(guest);
  await seedLink(guest, 'accepted', { [id]: 150.5 });
  const host = dbAs(env, HOST);
  await assertFails(migrationBatch(host, id, guest).commit());
  await assertFails(
    setDoc(doc(host, 'sessions', id, 'results', TARGET), {
      totalBuyIn: 100,
      cashOut: 250.5,
      profit: 150.5,
      settledAt: SETTLED_AT,
      playerName: 'Bryan Real',
      migratedFrom: guest,
    })
  );
  await assertFails(
    setDoc(doc(host, 'sessions', id, 'results', TARGET), {
      totalBuyIn: 100,
      cashOut: 250.5,
      profit: 150.5,
      playerName: 'Bryan Real',
    })
  );
  await assertFails(updateDoc(doc(host, 'sessions', id, 'results', guest), { playerName: 'Bryan Real' }));
  await assertFails(
    setDoc(doc(host, 'sessions', id, 'early_cashouts', TARGET), {
      amount: 250.5,
      cashedOutAt: CASHED_OUT_AT,
      playerName: 'Bryan Real',
      migratedFrom: guest,
    })
  );
});

test('buy-ins cannot be updated by anyone, even with an accepted link or on an active session', async () => {
  const guest = nextGuest();
  const finished = await seedGuestSession(guest);
  const active = await seedGuestSession(guest, { status: 'active' });
  await seedLink(guest, 'accepted', { [finished]: 150.5, [active]: 150.5 });
  for (const id of [finished, active]) {
    await assertFails(
      updateDoc(doc(dbAs(env, HOST), 'sessions', id, 'buy_ins', 'b0'), { playerId: TARGET, playerName: 'Bryan Real' })
    );
    await assertFails(
      updateDoc(doc(dbAs(env, TARGET), 'sessions', id, 'buy_ins', 'b0'), { playerId: TARGET, playerName: 'Bryan Real' })
    );
    await assertFails(updateDoc(doc(dbAs(env, HOST), 'sessions', id, 'buy_ins', 'b0'), { amount: 1 }));
  }
});

test('live results and early cash-outs still work on an active session', async () => {
  const id = sid();
  await seedSession(env, id, { status: 'active' });
  const host = dbAs(env, HOST);
  await assertSucceeds(
    setDoc(doc(host, 'sessions', id, 'results', PLAYER), { playerName: 'P', totalBuyIn: 100, cashOut: 50, profit: -50 })
  );
  await assertSucceeds(
    updateDoc(doc(host, 'sessions', id, 'results', PLAYER), { cashOut: 60, profit: -40 })
  );
  await assertSucceeds(setDoc(doc(host, 'sessions', id, 'early_cashouts', PLAYER), { playerName: 'P', amount: 60 }));
  await assertFails(setDoc(doc(dbAs(env, PLAYER), 'sessions', id, 'results', PLAYER), { playerName: 'P', totalBuyIn: 1, cashOut: 1, profit: 0 }));
});

test('clients cannot mark a link failed; a failed link stays readable and deletable by owner and target', async () => {
  const pending = await seedLink(nextGuest(), 'pending');
  await assertFails(updateDoc(doc(dbAs(env, TARGET), 'guest_links', pending.id), { status: 'failed' }));
  await assertFails(updateDoc(doc(dbAs(env, HOST), 'guest_links', pending.id), { status: 'failed' }));
  const accepted = await seedLink(nextGuest(), 'accepted');
  await assertFails(updateDoc(doc(dbAs(env, TARGET), 'guest_links', accepted.id), { status: 'failed' }));

  const failed = linkFor(nextGuest());
  const { id: _id, ...rest } = failed;
  await seedDoc(env, `guest_links/${failed.id}`, { ...rest, status: 'failed', createdAt: new Date(), failedAt: new Date() });
  const read = await assertSucceeds(getDoc(doc(dbAs(env, TARGET), 'guest_links', failed.id)));
  assert.equal(parseGuestLink(read.id, read.data() ?? {}).status, 'failed');
  await assertSucceeds(getDoc(doc(dbAs(env, HOST), 'guest_links', failed.id)));
  await assertFails(getDoc(doc(dbAs(env, STRANGER), 'guest_links', failed.id)));
  await assertFails(
    updateDoc(doc(dbAs(env, TARGET), 'guest_links', failed.id), { status: 'accepted', acceptedAt: serverTimestamp() })
  );
  await assertFails(deleteDoc(doc(dbAs(env, STRANGER), 'guest_links', failed.id)));
  await assertSucceeds(deleteDoc(doc(dbAs(env, HOST), 'guest_links', failed.id)));
});
