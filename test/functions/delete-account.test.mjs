import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

import {
  DELETED_PLAYER_NAME,
  DELETION_FAILURES,
  HostingLiveSessionError,
  deleteAccountData,
} from '../../functions/delete-account.js';
import { migrateGuestLink } from '../../functions/migrate.js';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { deleteApp, initializeApp } = require('firebase-admin/app');
const { FieldPath, Query, getFirestore } = require('firebase-admin/firestore');

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

const summary = (p) => ({ playerName: p.name, totalBuyIn: 50, cashOut: 50 + p.profit, profit: p.profit });

async function seedSession(id, { hostId, status = 'finished', players, legacy = false }) {
  const ref = db.doc(`sessions/${id}`);
  await ref.set({
    hostId,
    status,
    date: new Date(),
    participantIds: players.map((p) => p.id),
    ...(legacy ? {} : { playerResults: Object.fromEntries(players.map((p) => [p.id, summary(p)])) }),
  });
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
  await seedSession('legacy', { hostId: FRIEND, players: [sam, alex], legacy: true });
}

const exists = async (path) => (await db.doc(path).get()).exists;

function capturingLogger() {
  const errors = [];
  return { errors, info: () => {}, warn: () => {}, error: (...args) => errors.push(args) };
}

function withHooks(target, hooks) {
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'batch' && hooks.batch) return () => hooks.batch(t.batch());
      if (prop === 'collection' && hooks.collection) return (name) => hooks.collection(name, t.collection(name));
      const value = t[prop];
      return typeof value === 'function' ? value.bind(t) : value;
    },
  });
}

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
    const playerResults = (await db.doc(`sessions/${id}`).get()).get('playerResults');
    assert.deepEqual(playerResults[USER], { playerName: DELETED_PLAYER_NAME, totalBuyIn: 50, cashOut: 80, profit: 30 });
    assert.equal(playerResults[FRIEND].playerName, 'Sam');
  }

  const legacy = await db.doc('sessions/legacy').get();
  assert.equal(legacy.get('playerResults'), undefined, 'sessions without the map do not gain one');
  assert.ok((await namesIn('legacy')).includes(DELETED_PLAYER_NAME));
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

const STRANGER = 'stranger-uid';
const ENTITY_LIMIT = 1_048_576;

const PADDED_LOCATION_LENGTH = ENTITY_LIMIT - 193;

async function seedPaddedSession(id) {
  const ref = db.doc(`sessions/${id}`);
  await ref.set({
    hostId: STRANGER,
    status: 'active',
    participantIds: [STRANGER, USER],
    playerResults: { [USER]: { profit: 0 } },
    location: 'x'.repeat(PADDED_LOCATION_LENGTH),
  });
  await assert.rejects(
    ref.update(new FieldPath('playerResults', USER, 'playerName'), DELETED_PLAYER_NAME),
    'premise: naming the user in playerResults must overflow the document'
  );
  await ref.collection('results').doc(USER).set({ playerName: 'Alex', profit: 0 });
  await ref.collection('session_participants').doc(USER).set({ playerId: USER, playerName: 'Alex' });
  await ref.collection('buy_ins').doc('b1').set({ playerId: USER, playerName: 'Alex', amount: 50 });
  await ref.collection('buy_ins').doc('b2').set({ playerId: STRANGER, playerName: 'Mal', amount: 50 });
}

test('a near 1 MiB stranger session naming the user does not block deletion', async () => {
  await seedWorld();
  await seedPaddedSession('padded');
  const logger = capturingLogger();

  await deleteAccountData(db, USER, logger);

  for (const path of [
    `players/${USER}`,
    `players/${FRIEND}/friends/${USER}`,
    `groups/joined/members/${USER}`,
    `guest_links/${USER}_g1`,
    'refCodes/ALEX01',
    `sessions/padded/results/${USER}`,
    `sessions/padded/session_participants/${USER}`,
    'sessions/padded/buy_ins/b1',
  ]) {
    assert.equal(await exists(path), false, `${path} should be gone`);
  }
  const padded = await db.doc('sessions/padded').get();
  assert.deepEqual(padded.get('participantIds'), [STRANGER]);
  assert.deepEqual(padded.get('playerResults'), {});
  assert.equal(await exists('sessions/padded/buy_ins/b2'), true, 'other players keep their buy-ins');
  assert.ok(logger.errors.some((c) => c[1]?.sessionId === 'padded'));
  assert.equal((await db.collection(DELETION_FAILURES).get()).size, 0, 'a successful detach is not a failure');

  for (const id of ['shared', 'joined']) {
    const playerResults = (await db.doc(`sessions/${id}`).get()).get('playerResults');
    assert.equal(playerResults[USER].playerName, DELETED_PLAYER_NAME, `${id} is still anonymised normally`);
    assert.ok(!(await namesIn(id)).includes('Alex'));
  }
});

const MANY_SESSIONS = 51;

test('many sessions are processed in bounded pages', async (t) => {
  await seedWorld();
  const writer = db.bulkWriter();
  for (let i = 0; i < MANY_SESSIONS; i += 1) {
    const ref = db.doc(`sessions/many_${String(i).padStart(3, '0')}`);
    writer.set(ref, {
      hostId: FRIEND,
      status: 'finished',
      participantIds: [FRIEND, USER],
      playerResults: { [FRIEND]: { playerName: 'Sam', profit: 0 }, [USER]: { playerName: 'Alex', profit: 0 } },
    });
    writer.set(ref.collection('results').doc(USER), { playerName: 'Alex', profit: 0 });
  }
  for (let i = 0; i < MANY_SESSIONS; i += 1) {
    writer.set(db.doc(`sessions/own_${String(i).padStart(3, '0')}`), {
      hostId: USER,
      status: 'finished',
      participantIds: [USER, GUEST],
    });
  }
  await writer.close();

  const original = Query.prototype.get;
  const sizes = [];
  t.mock.method(Query.prototype, 'get', async function (...args) {
    const snap = await original.apply(this, args);
    sizes.push(snap.size);
    return snap;
  });
  await deleteAccountData(db, USER);
  t.mock.restoreAll();

  assert.ok(Math.max(...sizes) <= 50, `largest query returned ${Math.max(...sizes)} documents`);
  const many = await db.collection('sessions').where('hostId', '==', FRIEND).get();
  const anonymised = many.docs.filter((d) => d.id.startsWith('many_'));
  assert.equal(anonymised.length, MANY_SESSIONS);
  for (const d of anonymised) assert.equal(d.get('playerResults')[USER].playerName, DELETED_PLAYER_NAME);
  const results = await db.getAll(...anonymised.map((d) => d.ref.collection('results').doc(USER)));
  for (const r of results) assert.equal(r.get('playerName'), DELETED_PLAYER_NAME);
  const hosted = await db.collection('sessions').where('hostId', '==', USER).get();
  assert.deepEqual(hosted.docs.map((d) => d.id), ['shared']);
});

test('a retry after the profile was already removed still clears the ref code', async () => {
  await seedWorld();
  await db.doc(`players/${USER}`).delete();
  await deleteAccountData(db, USER);
  assert.equal(await exists('refCodes/ALEX01'), false);
});

test('a host-planted Deleted player marker does not keep the real name in the session', async () => {
  await seedWorld();
  await db.doc('sessions/joined').update({ [`playerResults.${USER}.playerName`]: DELETED_PLAYER_NAME });

  await deleteAccountData(db, USER, capturingLogger());

  const names = await namesIn('joined');
  assert.ok(!names.includes('Alex'), 'results, buy-ins and participants are renamed too');
  assert.ok(names.includes(DELETED_PLAYER_NAME));
  assert.equal((await db.doc('sessions/joined').get()).get('playerResults')[USER].playerName, DELETED_PLAYER_NAME);
});

test('a session that can be neither anonymised nor detached is recorded and deletion continues', async () => {
  await seedWorld();
  const failing = withHooks(db, {
    batch(batch) {
      let touchesSession = false;
      for (const op of ['set', 'update', 'delete']) {
        const original = batch[op].bind(batch);
        batch[op] = (ref, ...rest) => {
          if (ref.path.startsWith('sessions/')) touchesSession = true;
          return original(ref, ...rest);
        };
      }
      const commit = batch.commit.bind(batch);
      batch.commit = async () => {
        if (touchesSession) throw Object.assign(new Error('injected batch failure'), { code: 14 });
        return commit();
      };
      return batch;
    },
  });
  const logger = capturingLogger();

  await deleteAccountData(failing, USER, logger);

  assert.equal(await exists(`players/${USER}`), false, 'deletion still completes');
  const failures = await db.collection(DELETION_FAILURES).get();
  const recorded = failures.docs.map((d) => d.data());
  assert.deepEqual(recorded.map((f) => f.sessionId).sort(), ['joined', 'legacy', 'shared']);
  for (const f of recorded) {
    assert.equal(f.uid, USER);
    assert.equal(f.code, 14);
    assert.ok(f.at, 'records when it happened');
  }
  assert.ok(logger.errors.some((c) => c[0] === 'Session detach failed, skipping session'));
});

test('clients cannot read or write deletion failures', async () => {
  const appRequire = createRequire(new URL('../../package.json', import.meta.url));
  const { initializeTestEnvironment, assertFails } = appRequire('@firebase/rules-unit-testing');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const env = await initializeTestEnvironment({
    projectId: 'demo-nonsense-del-rules',
    firestore: { host, port: Number(port), rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.firestore().doc(`${DELETION_FAILURES}/f1`).set({ uid: USER, sessionId: 's', code: 14 })
    );
    const client = env.authenticatedContext(USER).firestore();
    await assertFails(client.doc(`${DELETION_FAILURES}/f1`).get());
    await assertFails(client.collection(DELETION_FAILURES).get());
    await assertFails(client.doc(`${DELETION_FAILURES}/f2`).set({ uid: USER }));
    await assertFails(client.doc(`${DELETION_FAILURES}/f1`).delete());
  } finally {
    await env.cleanup();
  }
});

test('leaving a group whose member count already drifted to zero does not make it negative', async () => {
  await seedWorld();
  await db.doc('groups/joined').update({ memberCount: 0 });

  await deleteAccountData(db, USER, capturingLogger());

  assert.equal(await exists(`groups/joined/members/${USER}`), false);
  assert.equal((await db.doc('groups/joined').get()).get('memberCount'), 0);
});

test('a guest link migration racing the deletion leaves no real name behind', async () => {
  await seedWorld();
  const guest = 'guest-race';
  await db.doc('sessions/race').set({
    hostId: FRIEND,
    status: 'finished',
    participantIds: [FRIEND, guest],
    playerResults: { [guest]: { playerName: 'G', profit: 5 } },
  });
  await db.doc(`sessions/race/results/${guest}`).set({ playerName: 'G', profit: 5 });
  await db.doc('guest_links/race').set({
    ownerId: FRIEND,
    guestId: guest,
    targetId: USER,
    targetName: 'Alex Realname',
    status: 'accepted',
    sessions: { race: 5 },
  });

  let migration = null;
  const racing = withHooks(db, {
    collection(name, ref) {
      if (name !== 'guest_links' || migration) return ref;
      migration = migrateGuestLink(db, 'race');
      return new Proxy(ref, {
        get(t, prop) {
          if (prop === 'where') {
            return (...args) => ({
              get: async () => {
                await migration;
                return t.where(...args).get();
              },
            });
          }
          const value = t[prop];
          return typeof value === 'function' ? value.bind(t) : value;
        },
      });
    },
  });

  await deleteAccountData(racing, USER, capturingLogger());
  await migration;

  const session = await db.doc('sessions/race').get();
  assert.ok(!JSON.stringify(session.data()).includes('Alex Realname'));
  const names = (await db.collection('sessions/race/results').get()).docs.map((d) => d.get('playerName'));
  assert.ok(!names.includes('Alex Realname'));
  assert.equal(await exists('guest_links/race'), false);
});
