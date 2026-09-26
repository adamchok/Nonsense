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
  migrateGuestLinkIn,
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

test('host cannot attach guest history to anyone without an accepted link', async () => {
  const noLink = nextGuest();
  const id1 = await seedGuestSession(noLink);
  await assertFails(migrationBatch(dbAs(env, HOST), id1, noLink).commit());
  await assertFails(
    setDoc(doc(dbAs(env, HOST), 'sessions', id1, 'results', TARGET), {
      totalBuyIn: 100,
      cashOut: 250.5,
      profit: 150.5,
      settledAt: SETTLED_AT,
      playerName: 'Bryan Real',
      migratedFrom: noLink,
    })
  );

  const pending = nextGuest();
  const id2 = await seedGuestSession(pending);
  await seedLink(pending, 'pending', { [id2]: 150.5 });
  await assertFails(migrationBatch(dbAs(env, HOST), id2, pending).commit());
});

test('host cannot change numbers, names, keys or the target while migrating', async () => {
  const guest = nextGuest();
  const id = await seedGuestSession(guest);
  await seedLink(guest, 'accepted', { [id]: 150.5 });
  const host = dbAs(env, HOST);
  await assertFails(migrationBatch(host, id, guest, { profit: 999 }).commit());
  await assertFails(migrationBatch(host, id, guest, { totalBuyIn: 0 }).commit());
  await assertFails(migrationBatch(host, id, guest, { settledAt: Timestamp.now() }).commit());
  await assertFails(migrationBatch(host, id, guest, { playerName: 'Someone' }).commit());
  await assertFails(migrationBatch(host, id, guest, { note: 'x' }).commit());
  await assertFails(migrationBatch(host, id, guest, { migratedFrom: OTHER_PLAYER }).commit());
  await assertFails(
    setDoc(doc(host, 'sessions', id, 'results', STRANGER), {
      totalBuyIn: 100,
      cashOut: 250.5,
      profit: 150.5,
      settledAt: SETTLED_AT,
      playerName: 'Bryan Real',
      migratedFrom: guest,
    })
  );
  await assertFails(
    setDoc(doc(host, 'sessions', id, 'early_cashouts', TARGET), {
      amount: 9999,
      cashedOutAt: CASHED_OUT_AT,
      playerName: 'Bryan Real',
      migratedFrom: guest,
    })
  );
});

test('buy-in update is guarded by an accepted link and cannot touch the amount', async () => {
  const noLink = nextGuest();
  const id1 = await seedGuestSession(noLink);
  const host = dbAs(env, HOST);
  await assertFails(
    updateDoc(doc(host, 'sessions', id1, 'buy_ins', 'b0'), { playerId: TARGET, playerName: 'Bryan Real' })
  );

  const guest = nextGuest();
  const id2 = await seedGuestSession(guest);
  await seedLink(guest, 'accepted', { [id2]: 150.5 });
  await assertFails(
    updateDoc(doc(host, 'sessions', id2, 'buy_ins', 'b0'), { playerId: TARGET, playerName: 'Bryan Real', amount: 1 })
  );
  await assertFails(
    updateDoc(doc(host, 'sessions', id2, 'buy_ins', 'b0'), { playerId: STRANGER, playerName: 'Bryan Real' })
  );
  await assertFails(
    updateDoc(doc(host, 'sessions', id2, 'buy_ins', 'other'), { playerId: TARGET, playerName: 'Bryan Real' })
  );
  await assertFails(
    updateDoc(doc(dbAs(env, TARGET), 'sessions', id2, 'buy_ins', 'b0'), { playerId: TARGET, playerName: 'Bryan Real' })
  );
  await assertSucceeds(
    updateDoc(doc(host, 'sessions', id2, 'buy_ins', 'b0'), { playerId: TARGET, playerName: 'Bryan Real' })
  );
});

test('an accepted link does not let the host migrate sessions hosted by someone else or still active', async () => {
  const guest = nextGuest();
  const other = await seedGuestSession(guest, { hostId: STRANGER });
  const active = await seedGuestSession(guest, { status: 'active' });
  await seedLink(guest, 'accepted', { [other]: 150.5, [active]: 150.5 });
  await assertFails(migrationBatch(dbAs(env, HOST), other, guest).commit());
  await assertFails(
    updateDoc(doc(dbAs(env, HOST), 'sessions', active, 'buy_ins', 'b0'), { playerId: TARGET, playerName: 'Bryan Real' })
  );
  await assertFails(
    setDoc(doc(dbAs(env, HOST), 'sessions', active, 'early_cashouts', TARGET), {
      amount: -5,
      cashedOutAt: CASHED_OUT_AT,
      playerName: 'Bryan Real',
      migratedFrom: guest,
    })
  );
});

test('host can run the full per-session migration batch once the link is accepted', async () => {
  const guest = nextGuest();
  const id = await seedGuestSession(guest);
  await seedLink(guest, 'accepted', { [id]: 150.5 });
  await assertSucceeds(migrationBatch(dbAs(env, HOST), id, guest).commit());
});

test('host cannot migrate a finished session that is not in the frozen consent map', async () => {
  const guest = nextGuest();
  const consented = await seedGuestSession(guest);
  const later = await seedGuestSession(guest);
  await seedLink(guest, 'accepted', { [consented]: 150.5 });
  const host = dbAs(env, HOST);
  await assertFails(migrationBatch(host, later, guest).commit());
  await assertFails(
    updateDoc(doc(host, 'sessions', later, 'buy_ins', 'b0'), { playerId: TARGET, playerName: 'Bryan Real' })
  );
  await assertFails(
    setDoc(doc(host, 'sessions', later, 'early_cashouts', TARGET), {
      amount: 250.5,
      cashedOutAt: CASHED_OUT_AT,
      playerName: 'Bryan Real',
      migratedFrom: guest,
    })
  );
  await assertSucceeds(migrationBatch(host, consented, guest).commit());
});

test('host cannot migrate a result whose profit differs from the frozen value, even if the live doc matches', async () => {
  const guest = nextGuest();
  const id = await seedGuestSession(guest);
  await seedLink(guest, 'accepted', { [id]: 10 });
  const host = dbAs(env, HOST);
  await assertFails(migrationBatch(host, id, guest).commit());
  await seedDoc(env, `sessions/${id}/results/${guest}`, {
    playerName: 'Bryan',
    totalBuyIn: 100,
    cashOut: 999,
    profit: 899,
    settledAt: SETTLED_AT,
  });
  await assertFails(migrationBatch(host, id, guest, { cashOut: 999, profit: 899 }).commit());
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

test('migrateGuestLink moves sessions and groups end to end, and is idempotent', async () => {
  const guest = nextGuest();
  const host = dbAs(env, HOST);

  const big = await seedGuestSession(guest, { buyIns: 12 });
  const partial = await seedGuestSession(guest);
  await seedDoc(env, `sessions/${partial}/results/${TARGET}`, {
    totalBuyIn: 100,
    cashOut: 250.5,
    profit: 150.5,
    settledAt: SETTLED_AT,
    playerName: 'Bryan Real',
    migratedFrom: guest,
  });
  const active = await seedGuestSession(guest, { status: 'active' });
  const foreign = await seedGuestSession(guest, { hostId: STRANGER });
  const unconsented = await seedGuestSession(guest);

  await requestGuestLinkIn(host, {
    ownerId: HOST,
    ownerName: 'Host',
    guestId: guest,
    guestName: 'Bryan',
    targetId: TARGET,
    targetName: 'Bryan Real',
  });
  const requested = await getDoc(doc(host, 'guest_links', guestLinkId(HOST, guest)));
  const frozen = parseGuestLink(requested.id, requested.data() ?? {});
  assert.deepEqual(Object.keys(frozen.sessions).sort(), [big, partial, unconsented].sort());
  await acceptGuestLinkIn(dbAs(env, TARGET), frozen);
  const { [unconsented]: _dropped, ...kept } = frozen.sessions;
  await seedDoc(env, `guest_links/${frozen.id}`, {
    ...linkDoc(frozen),
    status: 'accepted',
    sessions: kept,
    sessionCount: 2,
    createdAt: new Date(),
  });
  const late = await seedGuestSession(guest);

  await seedDoc(env, 'groups/g-new', { name: 'Poker', ownerId: HOST, memberCount: 2, createdAt: new Date() });
  await seedDoc(env, `groups/g-new/members/${guest}`, { name: 'Bryan', isRegistered: false, avatarEmoji: null });
  await seedDoc(env, 'groups/g-new/members/x', { name: 'X', isRegistered: false, avatarEmoji: null });
  await seedDoc(env, 'groups/g-dup', { name: 'Dup', ownerId: HOST, memberCount: 2, createdAt: new Date() });
  await seedDoc(env, `groups/g-dup/members/${guest}`, { name: 'Bryan', isRegistered: false, avatarEmoji: null });
  await seedDoc(env, `groups/g-dup/members/${TARGET}`, { name: 'Bryan Real', isRegistered: true, avatarEmoji: null });

  const result = await migrateGuestLinkIn(host, linkFor(guest, 'accepted'));
  assert.equal(result.sessions, 2);
  assert.equal(result.groups, 2);

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    for (const id of [big, partial]) {
      const s = await getDoc(doc(db, 'sessions', id));
      assert.deepEqual(s.data()?.participantIds, [HOST, TARGET, OTHER_PLAYER]);
      const r = await getDoc(doc(db, 'sessions', id, 'results', TARGET));
      assert.equal(r.data()?.profit, 150.5);
      assert.equal(r.data()?.playerName, 'Bryan Real');
      assert.equal((await getDoc(doc(db, 'sessions', id, 'results', guest))).exists(), false);
      const ec = await getDoc(doc(db, 'sessions', id, 'early_cashouts', TARGET));
      assert.equal(ec.data()?.amount, 250.5);
      assert.equal((await getDoc(doc(db, 'sessions', id, 'early_cashouts', guest))).exists(), false);
      const sp = await getDoc(doc(db, 'sessions', id, 'session_participants', TARGET));
      assert.equal(sp.data()?.playerId, TARGET);
      assert.equal((await getDoc(doc(db, 'sessions', id, 'session_participants', guest))).exists(), false);
      const leftover = await getDocs(query(collection(db, 'sessions', id, 'buy_ins'), where('playerId', '==', guest)));
      assert.equal(leftover.size, 0);
    }
    const moved = await getDocs(query(collection(db, 'sessions', big, 'buy_ins'), where('playerId', '==', TARGET)));
    assert.equal(moved.size, 12);
    for (const id of [active, foreign, unconsented, late]) {
      const s = await getDoc(doc(db, 'sessions', id));
      assert.ok(s.data()?.participantIds.includes(guest));
    }
    const newMember = await getDoc(doc(db, 'groups/g-new/members', TARGET));
    assert.deepEqual(newMember.data(), { name: 'Bryan Real', isRegistered: true, avatarEmoji: '🦊' });
    assert.equal((await getDoc(doc(db, 'groups/g-new/members', guest))).exists(), false);
    assert.equal((await getDoc(doc(db, 'groups/g-new'))).data()?.memberCount, 2);
    assert.equal((await getDoc(doc(db, 'groups/g-dup'))).data()?.memberCount, 1);
    const membership = await getDoc(doc(db, 'players', TARGET, 'group_memberships', 'g-new'));
    assert.equal(membership.data()?.role, 'member');
    assert.equal(membership.data()?.ownerId, HOST);
    assert.equal((await getDoc(doc(db, 'guest_links', guestLinkId(HOST, guest)))).exists(), false);
  });

  assert.deepEqual(await migrateGuestLinkIn(host, linkFor(guest, 'accepted')), {
    sessions: 0,
    groups: 0,
    touchedGroupIds: [],
  });
});

test('migrateGuestLink refuses a pending link', async () => {
  const guest = nextGuest();
  const id = await seedGuestSession(guest);
  await seedLink(guest, 'pending', { [id]: 150.5 });
  await assert.rejects(migrateGuestLinkIn(dbAs(env, HOST), linkFor(guest)));
});
