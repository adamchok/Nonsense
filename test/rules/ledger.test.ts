import { after, before, test } from 'node:test';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

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

before(async () => {
  env = await createRulesEnv();
  await env.clearFirestore();
});

after(async () => {
  await env.cleanup();
});

const sid = () => nextSessionId('ledger');

function addBuyInBatch(db: Firestore, sessionId: string, playerId: string, amount: unknown) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'sessions', sessionId, 'buy_ins')), {
    playerId,
    playerName: playerId,
    amount,
    createdAt: serverTimestamp(),
  });
  batch.set(
    doc(db, 'sessions', sessionId, 'session_participants', playerId),
    { playerId, playerName: playerId, joinedAt: serverTimestamp() },
    { merge: true }
  );
  batch.update(doc(db, 'sessions', sessionId), { participantIds: arrayUnion(playerId) });
  batch.delete(doc(db, 'sessions', sessionId, 'early_cashouts', playerId));
  return batch;
}

test('host can add a buy-in for a new player (full addBuyIn batch)', async () => {
  const id = sid();
  await seedSession(env, id, { participantIds: [HOST] });
  await assertSucceeds(addBuyInBatch(dbAs(env, HOST), id, PLAYER, 50).commit());
});

test('host re-entry buy-in clears an existing early cash-out in the same batch', async () => {
  const id = sid();
  await seedSession(env, id);
  await seedDoc(env, `sessions/${id}/early_cashouts/${PLAYER}`, {
    playerName: PLAYER,
    amount: 20,
  });
  await assertSucceeds(addBuyInBatch(dbAs(env, HOST), id, PLAYER, 50).commit());
});

test('a non-host participant cannot add a buy-in', async () => {
  const id = sid();
  await seedSession(env, id);
  await assertFails(addBuyInBatch(dbAs(env, PLAYER), id, PLAYER, 50).commit());
  await assertFails(
    setDoc(doc(collection(dbAs(env, PLAYER), 'sessions', id, 'buy_ins')), {
      playerId: PLAYER,
      playerName: PLAYER,
      amount: 50,
    })
  );
});

test('a stranger cannot add a buy-in', async () => {
  const id = sid();
  await seedSession(env, id);
  await assertFails(addBuyInBatch(dbAs(env, STRANGER), id, STRANGER, 50).commit());
});

test('buy-in amounts must be positive numbers in range', async () => {
  const id = sid();
  await seedSession(env, id);
  for (const amount of [0, -10, '50', 1e9]) {
    await assertFails(addBuyInBatch(dbAs(env, HOST), id, PLAYER, amount).commit());
  }
});

test('no buy-ins on a finished session, including riding along in the settle batch', async () => {
  const finished = sid();
  await seedSession(env, finished, { status: 'finished' });
  await assertFails(addBuyInBatch(dbAs(env, HOST), finished, PLAYER, 50).commit());

  const active = sid();
  await seedSession(env, active);
  const db = dbAs(env, HOST);
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'sessions', active, 'buy_ins')), {
    playerId: PLAYER,
    playerName: PLAYER,
    amount: 50,
  });
  batch.update(doc(db, 'sessions', active), { status: 'finished' });
  await assertFails(batch.commit());
});

test('buy-ins cannot be edited in place, even by the host', async () => {
  const id = sid();
  await seedSession(env, id);
  await seedDoc(env, `sessions/${id}/buy_ins/b1`, {
    playerId: PLAYER,
    playerName: PLAYER,
    amount: 50,
  });
  await assertFails(updateDoc(doc(dbAs(env, HOST), 'sessions', id, 'buy_ins', 'b1'), { amount: 5 }));
});

test('participants can read the buy-in ledger; a stranger cannot', async () => {
  const id = sid();
  await seedSession(env, id);
  await seedDoc(env, `sessions/${id}/buy_ins/b1`, {
    playerId: PLAYER,
    playerName: PLAYER,
    amount: 50,
  });
  await assertSucceeds(getDocs(collection(dbAs(env, OTHER_PLAYER), 'sessions', id, 'buy_ins')));
  await assertFails(getDocs(collection(dbAs(env, STRANGER), 'sessions', id, 'buy_ins')));
});

test('host can record an early cash-out; a participant cannot', async () => {
  const id = sid();
  await seedSession(env, id);
  const payload = { playerName: PLAYER, amount: 30, cashedOutAt: serverTimestamp() };
  await assertSucceeds(
    setDoc(doc(dbAs(env, HOST), 'sessions', id, 'early_cashouts', PLAYER), payload)
  );
  await assertFails(
    setDoc(doc(dbAs(env, PLAYER), 'sessions', id, 'early_cashouts', PLAYER), {
      ...payload,
      amount: 3000,
    })
  );
});

test('early cash-outs are rejected on a finished session or with a negative amount', async () => {
  const finished = sid();
  await seedSession(env, finished, { status: 'finished' });
  await assertFails(
    setDoc(doc(dbAs(env, HOST), 'sessions', finished, 'early_cashouts', PLAYER), {
      playerName: PLAYER,
      amount: 30,
    })
  );

  const active = sid();
  await seedSession(env, active);
  await assertFails(
    setDoc(doc(dbAs(env, HOST), 'sessions', active, 'early_cashouts', PLAYER), {
      playerName: PLAYER,
      amount: -1,
    })
  );
});

test('a stranger cannot join a session by writing a participant row or participantIds', async () => {
  const id = sid();
  await seedSession(env, id);
  const db = dbAs(env, STRANGER);
  await assertFails(
    setDoc(doc(db, 'sessions', id, 'session_participants', STRANGER), {
      playerId: STRANGER,
      playerName: STRANGER,
    })
  );
  await assertFails(updateDoc(doc(db, 'sessions', id), { participantIds: arrayUnion(STRANGER) }));
});

test('a legacy participant (row only, no participantIds) can still read the ledger', async () => {
  const id = sid();
  await seedSession(env, id, { participantIds: null });
  await assertSucceeds(getDocs(collection(dbAs(env, PLAYER), 'sessions', id, 'buy_ins')));
  await assertFails(getDocs(collection(dbAs(env, STRANGER), 'sessions', id, 'buy_ins')));
});
