import { after, before, test } from 'node:test';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

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

const sid = () => nextSessionId('sessions');

test('host can create a session with participant rows and initial buy-ins in one batch', async () => {
  const db = dbAs(env, HOST);
  const sessionRef = doc(collection(db, 'sessions'));
  const batch = writeBatch(db);
  batch.set(sessionRef, {
    hostId: HOST,
    date: serverTimestamp(),
    location: null,
    status: 'active',
    smallBlind: 1,
    bigBlind: 2,
    amountUnit: 'cash',
    dollarsPerChip: null,
    participantIds: [HOST, PLAYER],
  });
  for (const uid of [HOST, PLAYER]) {
    batch.set(
      doc(db, 'sessions', sessionRef.id, 'session_participants', uid),
      { playerId: uid, playerName: uid, joinedAt: serverTimestamp() },
      { merge: true }
    );
  }
  batch.set(doc(collection(db, 'sessions', sessionRef.id, 'buy_ins')), {
    playerId: PLAYER,
    playerName: 'Player',
    amount: 50,
    createdAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
});

test('cannot create a session hosted by someone else', async () => {
  const db = dbAs(env, STRANGER);
  await assertFails(
    setDoc(doc(db, 'sessions', sid()), {
      hostId: HOST,
      status: 'active',
      participantIds: [HOST],
    })
  );
});

test('session create rejects invalid blinds and chip rates', async () => {
  const db = dbAs(env, HOST);
  await assertFails(
    setDoc(doc(db, 'sessions', sid()), {
      hostId: HOST,
      status: 'active',
      smallBlind: 5,
      bigBlind: 2,
      participantIds: [HOST],
    })
  );
  await assertFails(
    setDoc(doc(db, 'sessions', sid()), {
      hostId: HOST,
      status: 'active',
      amountUnit: 'chips',
      dollarsPerChip: 0,
      participantIds: [HOST],
    })
  );
});

test('host and participants can read a session; a stranger cannot', async () => {
  const id = sid();
  await seedSession(env, id);
  await assertSucceeds(getDoc(doc(dbAs(env, HOST), 'sessions', id)));
  await assertSucceeds(getDoc(doc(dbAs(env, PLAYER), 'sessions', id)));
  await assertFails(getDoc(doc(dbAs(env, STRANGER), 'sessions', id)));
});

test('host can update blinds and location; a participant cannot', async () => {
  const id = sid();
  await seedSession(env, id);
  await assertSucceeds(
    updateDoc(doc(dbAs(env, HOST), 'sessions', id), { smallBlind: 1, bigBlind: 2 })
  );
  await assertSucceeds(updateDoc(doc(dbAs(env, HOST), 'sessions', id), { location: 'Home' }));
  await assertFails(updateDoc(doc(dbAs(env, PLAYER), 'sessions', id), { location: 'Mine' }));
});

test('host cannot hand the session to another host', async () => {
  const id = sid();
  await seedSession(env, id);
  await assertFails(updateDoc(doc(dbAs(env, HOST), 'sessions', id), { hostId: PLAYER }));
});

test('a finished session cannot be reopened', async () => {
  const id = sid();
  await seedSession(env, id, { status: 'finished' });
  await assertFails(updateDoc(doc(dbAs(env, HOST), 'sessions', id), { status: 'active' }));
});

function settleBatch(db: ReturnType<typeof dbAs>, sessionId: string) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'sessions', sessionId, 'results', PLAYER), {
    playerName: 'Player',
    totalBuyIn: 5000,
    cashOut: 8000,
    profit: 3000,
    settledAt: serverTimestamp(),
  });
  batch.set(doc(db, 'sessions', sessionId, 'results', OTHER_PLAYER), {
    playerName: 'Other',
    totalBuyIn: 5000,
    cashOut: 2000,
    profit: -3000,
    settledAt: serverTimestamp(),
  });
  batch.update(doc(db, 'sessions', sessionId), {
    status: 'finished',
    finishedAt: serverTimestamp(),
  });
  return batch;
}

test('host can write results and finish the session in one batch', async () => {
  const id = sid();
  await seedSession(env, id);
  await assertSucceeds(settleBatch(dbAs(env, HOST), id).commit());
});

test('a participant cannot settle the session or write their own result', async () => {
  const id = sid();
  await seedSession(env, id);
  await assertFails(settleBatch(dbAs(env, PLAYER), id).commit());
  await assertFails(
    setDoc(doc(dbAs(env, PLAYER), 'sessions', id, 'results', PLAYER), {
      playerName: 'Player',
      totalBuyIn: 0,
      cashOut: 100000,
      profit: 100000,
    })
  );
});

test('results are immutable once the session is finished', async () => {
  const id = sid();
  await seedSession(env, id, { status: 'finished' });
  await assertFails(
    setDoc(doc(dbAs(env, HOST), 'sessions', id, 'results', PLAYER), {
      playerName: 'Player',
      totalBuyIn: 5000,
      cashOut: 9000,
      profit: 4000,
    })
  );
});

test('results reject non-numeric or out-of-range money fields', async () => {
  const id = sid();
  await seedSession(env, id);
  const ref = doc(dbAs(env, HOST), 'sessions', id, 'results', PLAYER);
  await assertFails(
    setDoc(ref, { playerName: 'Player', totalBuyIn: '50', cashOut: 0, profit: -50 })
  );
  await assertFails(
    setDoc(ref, { playerName: 'Player', totalBuyIn: -1, cashOut: 0, profit: 1 })
  );
  await assertFails(
    setDoc(ref, { playerName: 'Player', totalBuyIn: 0, cashOut: 1e9, profit: 1e9 })
  );
});

async function seedFinishedWithResult(sessionId: string, participantIds: string[] | null) {
  await seedSession(env, sessionId, { status: 'finished', participantIds });
  await seedDoc(env, `sessions/${sessionId}/results/${PLAYER}`, {
    playerName: 'Player',
    totalBuyIn: 5000,
    cashOut: 0,
    profit: -5000,
  });
}

test('a participant can leave: remove self, then delete own result and participant row', async () => {
  const id = sid();
  await seedFinishedWithResult(id, [HOST, PLAYER, OTHER_PLAYER]);
  const db = dbAs(env, PLAYER);

  await assertSucceeds(updateDoc(doc(db, 'sessions', id), { participantIds: arrayRemove(PLAYER) }));
  const batch = writeBatch(db);
  batch.delete(doc(db, 'sessions', id, 'results', PLAYER));
  batch.delete(doc(db, 'sessions', id, 'session_participants', PLAYER));
  await assertSucceeds(batch.commit());

  await assertFails(getDoc(doc(db, 'sessions', id)));
});

test('a participant cannot delete their result while still in the session', async () => {
  const id = sid();
  await seedFinishedWithResult(id, [HOST, PLAYER, OTHER_PLAYER]);
  await assertFails(deleteDoc(doc(dbAs(env, PLAYER), 'sessions', id, 'results', PLAYER)));
});

test("a participant cannot remove someone else or touch other fields while leaving", async () => {
  const id = sid();
  await seedSession(env, id);
  const ref = doc(dbAs(env, PLAYER), 'sessions', id);
  await assertFails(updateDoc(ref, { participantIds: arrayRemove(OTHER_PLAYER) }));
  await assertFails(updateDoc(ref, { participantIds: arrayRemove(PLAYER), location: 'x' }));
});

test('a player cannot delete a result written about someone else', async () => {
  const id = sid();
  await seedFinishedWithResult(id, [HOST, OTHER_PLAYER]);
  await assertFails(deleteDoc(doc(dbAs(env, OTHER_PLAYER), 'sessions', id, 'results', PLAYER)));
  await assertFails(deleteDoc(doc(dbAs(env, STRANGER), 'sessions', id, 'results', PLAYER)));
});

test(
  'a participant of a legacy session without participantIds can leave',
  async () => {
    const id = sid();
    await seedFinishedWithResult(id, null);
    const db = dbAs(env, PLAYER);
    await assertSucceeds(
      updateDoc(doc(db, 'sessions', id), { participantIds: arrayRemove(PLAYER) })
    );
  }
);

test('the host can delete a finished session with its results; other players cannot', async () => {
  const id = sid();
  await seedFinishedWithResult(id, [HOST, PLAYER]);

  await assertFails(deleteDoc(doc(dbAs(env, PLAYER), 'sessions', id)));
  const db = dbAs(env, HOST);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'sessions', id, 'results', PLAYER));
  batch.delete(doc(db, 'sessions', id));
  await assertSucceeds(batch.commit());
});
