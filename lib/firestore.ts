import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

import { getFirestoreDb } from '@/lib/firebase';
import type {
  BuyIn,
  EarlyCashOut,
  FriendRecord,
  PlayerProfile,
  SessionRecord,
  SessionResult,
} from '@/types';

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return new Date();
}

export async function getPlayerProfile(uid: string): Promise<PlayerProfile | null> {
  const ref = doc(getFirestoreDb(), 'players', uid);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: String(data.name ?? ''),
    anonymousUid: String(data.anonymousUid ?? uid),
    refCode: data.refCode ? String(data.refCode) : undefined,
  };
}

export async function upsertPlayerProfile(uid: string, name: string): Promise<PlayerProfile> {
  const db = getFirestoreDb();
  const ref = doc(db, 'players', uid);
  const snapshot = await getDoc(ref);

  let refCode: string | undefined;
  if (snapshot.exists()) {
    refCode = snapshot.data().refCode ? String(snapshot.data().refCode) : undefined;
    await setDoc(ref, { name, anonymousUid: uid }, { merge: true });
  } else {
    refCode = generateRefCode();
    await setDoc(ref, {
      name,
      anonymousUid: uid,
      refCode,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'refCodes', refCode), { playerId: uid });
  }

  return { id: uid, name, anonymousUid: uid, refCode };
}

function generateRefCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Ensure existing players get a refCode (back-fill). */
export async function ensureRefCode(uid: string): Promise<string> {
  const db = getFirestoreDb();
  const ref = doc(db, 'players', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Player not found');
  const data = snap.data();
  if (data.refCode) return String(data.refCode);

  const code = generateRefCode();
  await updateDoc(ref, { refCode: code });
  await setDoc(doc(db, 'refCodes', code), { playerId: uid });
  return code;
}

// ---------------------------------------------------------------------------
// Friends  (subcollection: players/{uid}/friends)
// ---------------------------------------------------------------------------

export async function lookupPlayerByRefCode(code: string): Promise<PlayerProfile | null> {
  const ref = doc(getFirestoreDb(), 'refCodes', code.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const playerId = String(snap.data().playerId);
  return getPlayerProfile(playerId);
}

export async function addFriend(myUid: string, friendProfile: PlayerProfile): Promise<void> {
  const db = getFirestoreDb();
  const myProfile = await getPlayerProfile(myUid);
  if (!myProfile) throw new Error('Your profile not found');

  const myFriendRef = doc(db, 'players', myUid, 'friends', friendProfile.id);
  const theirFriendRef = doc(db, 'players', friendProfile.id, 'friends', myUid);

  await setDoc(myFriendRef, {
    name: friendProfile.name,
    addedAt: serverTimestamp(),
  });
  await setDoc(theirFriendRef, {
    name: myProfile.name,
    addedAt: serverTimestamp(),
  });
}

export async function removeFriend(myUid: string, friendId: string): Promise<void> {
  const db = getFirestoreDb();
  await deleteDoc(doc(db, 'players', myUid, 'friends', friendId));
  await deleteDoc(doc(db, 'players', friendId, 'friends', myUid));
}

export function subscribeFriends(
  uid: string,
  onNext: (friends: FriendRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const colRef = collection(getFirestoreDb(), 'players', uid, 'friends');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const friends = snapshot.docs.map<FriendRecord>((d) => ({
        playerId: d.id,
        name: String(d.data().name ?? ''),
        addedAt: toDate(d.data().addedAt),
      }));
      onNext(friends.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError
  );
}

export async function getFriendLeaderboard(
  uid: string
): Promise<{ playerId: string; name: string; totalProfit: number }[]> {
  const db = getFirestoreDb();
  const friendsSnap = await getDocs(collection(db, 'players', uid, 'friends'));
  const friendIds = friendsSnap.docs.map((d) => d.id);
  const allIds = [uid, ...friendIds];

  const leaderboard: { playerId: string; name: string; totalProfit: number }[] = [];

  for (const pid of allIds) {
    const profile = await getPlayerProfile(pid);
    if (!profile) continue;

    const sessionsSnap = await getDocs(collection(db, 'sessions'));
    let totalProfit = 0;
    for (const sDoc of sessionsSnap.docs) {
      const resultRef = doc(db, 'sessions', sDoc.id, 'results', pid);
      const resultSnap = await getDoc(resultRef);
      if (resultSnap.exists()) {
        totalProfit += Number(resultSnap.data().profit ?? 0);
      }
    }
    leaderboard.push({ playerId: pid, name: profile.name, totalProfit });
  }

  return leaderboard.sort((a, b) => b.totalProfit - a.totalProfit);
}

export async function createSession(input: {
  hostId: string;
  label?: string;
  location?: string;
}): Promise<string> {
  const db = getFirestoreDb();
  const sessionsRef = collection(db, 'sessions');
  const sessionRef = doc(sessionsRef);

  await setDoc(sessionRef, {
    hostId: input.hostId,
    date: serverTimestamp(),
    label: input.label?.trim() || null,
    location: input.location?.trim() || null,
    status: 'active',
    createdAt: serverTimestamp(),
  });

  return sessionRef.id;
}

export async function getRecentSessionsForHost(hostId: string): Promise<SessionRecord[]> {
  const db = getFirestoreDb();
  const sessionsRef = collection(db, 'sessions');
  const sessionsQuery = query(sessionsRef, where('hostId', '==', hostId), limit(50));

  const snapshots = await getDocs(sessionsQuery);
  return snapshots.docs
    .map<SessionRecord>((snapshot) => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        hostId: String(data.hostId ?? ''),
        label: data.label ? String(data.label) : undefined,
        location: data.location ? String(data.location) : undefined,
        status: data.status === 'finished' ? 'finished' : 'active',
        date: toDate(data.date),
        createdAt: toDate(data.createdAt),
        finishedAt: data.finishedAt ? toDate(data.finishedAt) : undefined,
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export async function finishSession(sessionId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId);
  await updateDoc(ref, { status: 'finished', finishedAt: serverTimestamp() });
}

/** Session label for headers (e.g. summary screen). Returns undefined if missing or blank. */
export async function getSessionLabel(sessionId: string): Promise<string | undefined> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return undefined;
  const raw = snap.data().label;
  if (raw == null) return undefined;
  const s = String(raw).trim();
  return s.length > 0 ? s : undefined;
}

// ---------------------------------------------------------------------------
// Buy-ins  (subcollection: sessions/{id}/buy_ins)
// ---------------------------------------------------------------------------

export async function addBuyIn(
  sessionId: string,
  input: { playerId: string; playerName: string; amount: number }
): Promise<string> {
  const colRef = collection(getFirestoreDb(), 'sessions', sessionId, 'buy_ins');
  const docRef = await addDoc(colRef, {
    playerId: input.playerId,
    playerName: input.playerName,
    amount: input.amount,
    createdAt: serverTimestamp(),
  });
  /** New chips for this playerId = re-entry; clear early cash-out so ledger/UI stay consistent. */
  await removeEarlyCashOutIfExists(sessionId, input.playerId);
  return docRef.id;
}

/** Deletes all buy-in entries for this player (removes them from the session ledger). */
export async function removePlayerBuyIns(sessionId: string, playerId: string): Promise<void> {
  const db = getFirestoreDb();
  const q = query(
    collection(db, 'sessions', sessionId, 'buy_ins'),
    where('playerId', '==', playerId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 500) {
    const chunk = docs.slice(i, i + 500);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export function subscribeBuyIns(
  sessionId: string,
  onNext: (buyIns: BuyIn[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const colRef = collection(getFirestoreDb(), 'sessions', sessionId, 'buy_ins');
  const q = query(colRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const buyIns = snapshot.docs.map<BuyIn>((d) => {
        const data = d.data();
        return {
          id: d.id,
          sessionId,
          playerId: String(data.playerId ?? ''),
          playerName: String(data.playerName ?? ''),
          amount: Number(data.amount ?? 0),
          createdAt: toDate(data.createdAt),
        };
      });
      onNext(buyIns);
    },
    onError
  );
}

export async function getBuyIns(sessionId: string): Promise<BuyIn[]> {
  const colRef = collection(getFirestoreDb(), 'sessions', sessionId, 'buy_ins');
  const q = query(colRef, orderBy('createdAt', 'asc'));
  const snapshots = await getDocs(q);

  return snapshots.docs.map<BuyIn>((d) => {
    const data = d.data();
    return {
      id: d.id,
      sessionId,
      playerId: String(data.playerId ?? ''),
      playerName: String(data.playerName ?? ''),
      amount: Number(data.amount ?? 0),
      createdAt: toDate(data.createdAt),
    };
  });
}

// ---------------------------------------------------------------------------
// Early cash-outs  (subcollection: sessions/{id}/early_cashouts)
// ---------------------------------------------------------------------------

export async function saveEarlyCashOut(
  sessionId: string,
  input: { playerId: string; playerName: string; amount: number }
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId, 'early_cashouts', input.playerId);
  await setDoc(ref, {
    playerName: input.playerName,
    amount: input.amount,
    cashedOutAt: serverTimestamp(),
  });
}

export function subscribeEarlyCashOuts(
  sessionId: string,
  onNext: (cashOuts: EarlyCashOut[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const colRef = collection(getFirestoreDb(), 'sessions', sessionId, 'early_cashouts');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const cashOuts = snapshot.docs.map<EarlyCashOut>((d) => {
        const data = d.data();
        return {
          playerId: d.id,
          playerName: String(data.playerName ?? ''),
          amount: Number(data.amount ?? 0),
          cashedOutAt: toDate(data.cashedOutAt),
        };
      });
      onNext(cashOuts);
    },
    onError
  );
}

export async function getEarlyCashOuts(sessionId: string): Promise<EarlyCashOut[]> {
  const colRef = collection(getFirestoreDb(), 'sessions', sessionId, 'early_cashouts');
  const snapshots = await getDocs(colRef);
  return snapshots.docs.map<EarlyCashOut>((d) => {
    const data = d.data();
    return {
      playerId: d.id,
      playerName: String(data.playerName ?? ''),
      amount: Number(data.amount ?? 0),
      cashedOutAt: toDate(data.cashedOutAt),
    };
  });
}

export async function removeEarlyCashOut(sessionId: string, playerId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId, 'early_cashouts', playerId);
  await deleteDoc(ref);
}

/** No-op if this player has no early cash-out document. */
export async function removeEarlyCashOutIfExists(
  sessionId: string,
  playerId: string
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId, 'early_cashouts', playerId);
  const snap = await getDoc(ref);
  if (snap.exists()) await deleteDoc(ref);
}

// ---------------------------------------------------------------------------
// Results  (subcollection: sessions/{id}/results)
// ---------------------------------------------------------------------------

export async function saveResults(
  sessionId: string,
  results: SessionResult[]
): Promise<void> {
  const db = getFirestoreDb();
  const promises = results.map((r) => {
    const ref = doc(db, 'sessions', sessionId, 'results', r.playerId);
    return setDoc(ref, {
      playerName: r.playerName,
      totalBuyIn: r.totalBuyIn,
      cashOut: r.cashOut,
      profit: r.profit,
      settledAt: serverTimestamp(),
    });
  });
  await Promise.all(promises);
}

export async function getResults(sessionId: string): Promise<SessionResult[]> {
  const colRef = collection(getFirestoreDb(), 'sessions', sessionId, 'results');
  const snapshots = await getDocs(colRef);

  return snapshots.docs.map<SessionResult>((d) => {
    const data = d.data();
    return {
      playerId: d.id,
      playerName: String(data.playerName ?? ''),
      totalBuyIn: Number(data.totalBuyIn ?? 0),
      cashOut: Number(data.cashOut ?? 0),
      profit: Number(data.profit ?? 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Player history (all sessions a player participated in via buy-ins)
// ---------------------------------------------------------------------------

export async function getSessionHistoryForPlayer(
  playerId: string
): Promise<(SessionRecord & { totalBuyIn: number; cashOut: number; profit: number })[]> {
  const db = getFirestoreDb();

  const sessionsSnap = await getDocs(
    query(collection(db, 'sessions'), where('status', '==', 'finished'), limit(100))
  );

  const records: (SessionRecord & { totalBuyIn: number; cashOut: number; profit: number })[] = [];

  await Promise.all(
    sessionsSnap.docs.map(async (sessionDoc) => {
      const resultRef = doc(db, 'sessions', sessionDoc.id, 'results', playerId);
      const resultSnap = await getDoc(resultRef);
      if (!resultSnap.exists()) return;

      const data = sessionDoc.data();
      const r = resultSnap.data()!;
      records.push({
        id: sessionDoc.id,
        hostId: String(data.hostId ?? ''),
        label: data.label ? String(data.label) : undefined,
        location: data.location ? String(data.location) : undefined,
        status: 'finished',
        date: toDate(data.date),
        createdAt: toDate(data.createdAt),
        finishedAt: data.finishedAt ? toDate(data.finishedAt) : undefined,
        totalBuyIn: Number(r.totalBuyIn ?? 0),
        cashOut: Number(r.cashOut ?? 0),
        profit: Number(r.profit ?? 0),
      });
    })
  );

  return records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
