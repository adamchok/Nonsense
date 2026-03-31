import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { getFirestoreDb } from '@/lib/firebase';
import type {
  BuyIn,
  EarlyCashOut,
  FriendRecord,
  FriendRequestRecord,
  GroupMember,
  PlayerProfile,
  PokerGroup,
  SavedLocation,
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

function normalizeAvatarEmoji(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Subcollection under each session for participant membership checks. */
const SESSION_PARTICIPANTS_SUBCOLLECTION = 'session_participants';

async function writeSessionParticipant(
  sessionId: string,
  playerId: string,
  playerName: string
): Promise<void> {
  const ref = doc(
    getFirestoreDb(),
    'sessions',
    sessionId,
    SESSION_PARTICIPANTS_SUBCOLLECTION,
    playerId
  );
  await setDoc(
    ref,
    {
      playerId,
      playerName: playerName.trim() || playerId,
      joinedAt: serverTimestamp(),
    },
    { merge: true }
  );
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
    avatarEmoji: normalizeAvatarEmoji(data.avatarEmoji),
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

  return {
    id: uid,
    name,
    anonymousUid: uid,
    refCode,
    avatarEmoji: snapshot.exists() ? normalizeAvatarEmoji(snapshot.data().avatarEmoji) : undefined,
  };
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
// Friend requests: players/{uid}/friend_requests/{senderUid} (incoming)
//                  players/{uid}/friend_requests_sent/{receiverUid} (outgoing)
// ---------------------------------------------------------------------------

const FRIEND_REQUESTS = 'friend_requests';
const FRIEND_REQUESTS_SENT = 'friend_requests_sent';

type SendFriendRequestResult =
  | { ok: true; outcome: 'sent' | 'now_friends' }
  | { ok: false; reason: 'already_friends' | 'already_sent' | 'self' };

function mapFriendRequestDoc(d: { id: string; data: () => Record<string, unknown> }): FriendRequestRecord {
  const data = d.data();
  return {
    playerId: d.id,
    name: String(data.name ?? ''),
    createdAt: toDate(data.createdAt),
    avatarEmoji: normalizeAvatarEmoji(data.avatarEmoji),
  };
}

/** Remove all pending request docs between two users (both directions). */
async function clearFriendRequestPairBetween(db: ReturnType<typeof getFirestoreDb>, a: string, b: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'players', a, FRIEND_REQUESTS, b));
  batch.delete(doc(db, 'players', b, FRIEND_REQUESTS_SENT, a));
  batch.delete(doc(db, 'players', a, FRIEND_REQUESTS_SENT, b));
  batch.delete(doc(db, 'players', b, FRIEND_REQUESTS, a));
  await batch.commit();
}

export async function sendFriendRequest(
  fromUid: string,
  toProfile: PlayerProfile
): Promise<SendFriendRequestResult> {
  if (fromUid === toProfile.id) {
    return { ok: false, reason: 'self' };
  }

  const db = getFirestoreDb();
  const myFriendRef = doc(db, 'players', fromUid, 'friends', toProfile.id);
  const myFriendSnap = await getDoc(myFriendRef);
  if (myFriendSnap.exists()) {
    return { ok: false, reason: 'already_friends' };
  }

  const incomingFromThem = doc(db, 'players', fromUid, FRIEND_REQUESTS, toProfile.id);
  const incomingSnap = await getDoc(incomingFromThem);
  if (incomingSnap.exists()) {
    await clearFriendRequestPairBetween(db, fromUid, toProfile.id);
    await addFriend(fromUid, toProfile);
    return { ok: true, outcome: 'now_friends' };
  }

  const outgoingSnap = await getDoc(doc(db, 'players', fromUid, FRIEND_REQUESTS_SENT, toProfile.id));
  if (outgoingSnap.exists()) {
    return { ok: false, reason: 'already_sent' };
  }

  const myProfile = await getPlayerProfile(fromUid);
  if (!myProfile) throw new Error('Your profile not found');

  const batch = writeBatch(db);
  const theirIncoming = doc(db, 'players', toProfile.id, FRIEND_REQUESTS, fromUid);
  const myOutgoing = doc(db, 'players', fromUid, FRIEND_REQUESTS_SENT, toProfile.id);
  batch.set(theirIncoming, {
    name: myProfile.name,
    avatarEmoji: myProfile.avatarEmoji ?? null,
    createdAt: serverTimestamp(),
  });
  batch.set(myOutgoing, {
    name: toProfile.name,
    avatarEmoji: toProfile.avatarEmoji ?? null,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return { ok: true, outcome: 'sent' };
}

export async function acceptFriendRequest(receiverUid: string, senderUid: string): Promise<void> {
  const senderProfile = await getPlayerProfile(senderUid);
  if (!senderProfile) throw new Error('Player not found');

  const db = getFirestoreDb();
  await clearFriendRequestPairBetween(db, senderUid, receiverUid);
  await addFriend(receiverUid, senderProfile);
}

export async function declineFriendRequest(receiverUid: string, senderUid: string): Promise<void> {
  const db = getFirestoreDb();
  await clearFriendRequestPairBetween(db, senderUid, receiverUid);
}

export async function cancelOutgoingFriendRequest(senderUid: string, receiverUid: string): Promise<void> {
  const db = getFirestoreDb();
  await clearFriendRequestPairBetween(db, senderUid, receiverUid);
}

export function subscribeIncomingFriendRequests(
  uid: string,
  onNext: (requests: FriendRequestRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const colRef = collection(getFirestoreDb(), 'players', uid, FRIEND_REQUESTS);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const requests = snapshot.docs.map((d) => mapFriendRequestDoc(d));
      onNext(requests.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError
  );
}

export function subscribeOutgoingFriendRequests(
  uid: string,
  onNext: (requests: FriendRequestRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const colRef = collection(getFirestoreDb(), 'players', uid, FRIEND_REQUESTS_SENT);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const requests = snapshot.docs.map((d) => mapFriendRequestDoc(d));
      onNext(requests.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError
  );
}

export async function lookupPlayerByRefCode(code: string): Promise<PlayerProfile | null> {
  const ref = doc(getFirestoreDb(), 'refCodes', code.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const playerId = String(snap.data().playerId);
  return getPlayerProfile(playerId);
}

async function addFriend(myUid: string, friendProfile: PlayerProfile): Promise<void> {
  const db = getFirestoreDb();
  const myProfile = await getPlayerProfile(myUid);
  if (!myProfile) throw new Error('Your profile not found');

  const myFriendRef = doc(db, 'players', myUid, 'friends', friendProfile.id);
  const theirFriendRef = doc(db, 'players', friendProfile.id, 'friends', myUid);

  await setDoc(myFriendRef, {
    name: friendProfile.name,
    avatarEmoji: friendProfile.avatarEmoji ?? null,
    addedAt: serverTimestamp(),
  });
  await setDoc(theirFriendRef, {
    name: myProfile.name,
    avatarEmoji: myProfile.avatarEmoji ?? null,
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
        avatarEmoji: normalizeAvatarEmoji(d.data().avatarEmoji),
      }));
      onNext(friends.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError
  );
}

export async function getFriendLeaderboard(
  uid: string
): Promise<{ playerId: string; name: string; avatarEmoji?: string; totalProfit: number }[]> {
  const db = getFirestoreDb();
  const friendsSnap = await getDocs(collection(db, 'players', uid, 'friends'));
  const friendIds = friendsSnap.docs.map((d) => d.id);
  const allIds = [uid, ...friendIds];

  const leaderboard: { playerId: string; name: string; avatarEmoji?: string; totalProfit: number }[] = [];

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
    leaderboard.push({
      playerId: pid,
      name: profile.name,
      avatarEmoji: profile.avatarEmoji,
      totalProfit,
    });
  }

  return leaderboard.sort((a, b) => b.totalProfit - a.totalProfit);
}

export async function getGroupLeaderboard(
  uid: string,
  groupId: string
): Promise<{ playerId: string; name: string; avatarEmoji?: string; totalProfit: number }[]> {
  const db = getFirestoreDb();
  const members = await getGroupMembers(uid, groupId);

  const memberById = new Map<string, { name: string }>();
  for (const m of members) memberById.set(m.id, { name: m.name });

  const playerIds = [...new Set(members.map((m) => m.id))];
  if (playerIds.length === 0) return [];

  // Fetch all sessions once; then sum each player's profit from session results.
  const sessionsSnap = await getDocs(collection(db, 'sessions'));

  const leaderboard: { playerId: string; name: string; avatarEmoji?: string; totalProfit: number }[] = [];

  for (const pid of playerIds) {
    const profile = await getPlayerProfile(pid);
    let totalProfit = 0;

    for (const sDoc of sessionsSnap.docs) {
      const resultRef = doc(db, 'sessions', sDoc.id, 'results', pid);
      const resultSnap = await getDoc(resultRef);
      if (resultSnap.exists()) {
        totalProfit += Number(resultSnap.data().profit ?? 0);
      }
    }

    leaderboard.push({
      playerId: pid,
      name: profile?.name ?? memberById.get(pid)?.name ?? pid,
      avatarEmoji: profile?.avatarEmoji,
      totalProfit,
    });
  }

  return leaderboard.sort((a, b) => b.totalProfit - a.totalProfit);
}

function sessionBlindsFromDocData(data: Record<string, unknown>): {
  smallBlind?: number;
  bigBlind?: number;
} {
  const rawSb = data.smallBlind;
  const rawBb = data.bigBlind;
  if (rawSb == null || rawBb == null) return {};
  const sb = typeof rawSb === 'number' ? rawSb : Number(rawSb);
  const bb = typeof rawBb === 'number' ? rawBb : Number(rawBb);
  if (!Number.isFinite(sb) || !Number.isFinite(bb) || sb <= 0 || bb < sb) return {};
  return { smallBlind: sb, bigBlind: bb };
}

export async function createSession(input: {
  hostId: string;
  hostName?: string;
  location?: string;
  smallBlind?: number;
  bigBlind?: number;
}): Promise<string> {
  const db = getFirestoreDb();
  const sessionsRef = collection(db, 'sessions');
  const sessionRef = doc(sessionsRef);

  let smallBlind: number | null = null;
  let bigBlind: number | null = null;
  if (
    input.smallBlind != null &&
    input.bigBlind != null &&
    Number.isFinite(input.smallBlind) &&
    Number.isFinite(input.bigBlind) &&
    input.smallBlind > 0 &&
    input.bigBlind >= input.smallBlind
  ) {
    smallBlind = input.smallBlind;
    bigBlind = input.bigBlind;
  }

  await setDoc(sessionRef, {
    hostId: input.hostId,
    date: serverTimestamp(),
    location: input.location?.trim() || null,
    status: 'active',
    smallBlind,
    bigBlind,
  });

  const hostLabel = input.hostName?.trim() || input.hostId;
  await writeSessionParticipant(sessionRef.id, input.hostId, hostLabel);

  return sessionRef.id;
}

function mapSessionDocToRecord(sessionId: string, data: Record<string, unknown>): SessionRecord {
  return {
    id: sessionId,
    hostId: String(data.hostId ?? ''),
    location: data.location ? String(data.location) : undefined,
    ...sessionBlindsFromDocData(data),
    status: data.status === 'finished' ? 'finished' : 'active',
    date: toDate(data.date ?? data.createdAt),
    finishedAt: data.finishedAt ? toDate(data.finishedAt) : undefined,
  };
}

/**
 * Recent sessions the player participates in (host or member with buy-in / participant row).
 * Uses direct per-session participant doc checks to avoid collection-group index requirements.
 */
export async function getRecentSessionsForPlayer(playerId: string): Promise<SessionRecord[]> {
  const db = getFirestoreDb();
  const [hostedSnap, recentSnap] = await Promise.all([
    getDocs(query(collection(db, 'sessions'), where('hostId', '==', playerId), limit(200))),
    getDocs(query(collection(db, 'sessions'), orderBy('date', 'desc'), limit(200))),
  ]);

  const sessionsById = new Map<string, Record<string, unknown>>();
  for (const snap of hostedSnap.docs) {
    sessionsById.set(snap.id, snap.data() as Record<string, unknown>);
  }
  for (const snap of recentSnap.docs) {
    sessionsById.set(snap.id, snap.data() as Record<string, unknown>);
  }

  if (sessionsById.size === 0) return [];

  const records: SessionRecord[] = [];
  await Promise.all(
    [...sessionsById.entries()].map(async ([sessionId, data]) => {
      const isHost = String(data.hostId ?? '') === playerId;
      if (isHost) {
        records.push(mapSessionDocToRecord(sessionId, data));
        return;
      }

      const participantRef = doc(
        db,
        'sessions',
        sessionId,
        SESSION_PARTICIPANTS_SUBCOLLECTION,
        playerId
      );
      const participantSnap = await getDoc(participantRef);
      if (participantSnap.exists()) {
        records.push(mapSessionDocToRecord(sessionId, data));
      }
    })
  );

  return records.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 20);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export async function finishSession(sessionId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId);
  await updateDoc(ref, { status: 'finished', finishedAt: serverTimestamp() });
}

export async function updateSessionLocation(
  sessionId: string,
  location: string | null
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId);
  const trimmed = location?.trim();
  await updateDoc(ref, { location: trimmed ? trimmed : null });
}

export async function updateSessionBlinds(
  sessionId: string,
  input: { smallBlind: number | null; bigBlind: number | null }
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId);
  if (input.smallBlind == null && input.bigBlind == null) {
    await updateDoc(ref, { smallBlind: null, bigBlind: null });
    return;
  }
  if (input.smallBlind == null || input.bigBlind == null) {
    throw new Error('Set both small and big blind, or clear both.');
  }
  const sb = input.smallBlind;
  const bb = input.bigBlind;
  if (!Number.isFinite(sb) || !Number.isFinite(bb) || sb <= 0 || bb < sb) {
    throw new Error('Invalid blinds: small must be positive and big must be at least small.');
  }
  await updateDoc(ref, { smallBlind: sb, bigBlind: bb });
}

export async function updatePlayerAvatar(uid: string, avatarEmoji: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'players', uid);
  const trimmed = avatarEmoji.trim();
  await updateDoc(ref, { avatarEmoji: trimmed || null });
}

export async function getSavedLocations(uid: string): Promise<SavedLocation[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, 'saved_locations');
  const q = query(colRef, orderBy('createdAt', 'desc'), limit(10));
  const snapshots = await getDocs(q);
  return snapshots.docs.map<SavedLocation>((d) => ({
    id: d.id,
    name: String(d.data().name ?? ''),
    createdAt: toDate(d.data().createdAt),
  }));
}

export async function addSavedLocation(uid: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Location name is required.');

  const existing = await getSavedLocations(uid);
  if (existing.length >= 10) {
    throw new Error('You can save up to 10 locations.');
  }
  if (existing.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('This location is already saved.');
  }

  const colRef = collection(getFirestoreDb(), 'players', uid, 'saved_locations');
  await addDoc(colRef, { name: trimmed, createdAt: serverTimestamp() });
}

export async function removeSavedLocation(uid: string, locationId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'players', uid, 'saved_locations', locationId);
  await deleteDoc(ref);
}

export async function getSessionMeta(sessionId: string): Promise<{
  date?: Date;
  finishedAt?: Date;
  location?: string;
  hostId?: string;
  status?: 'active' | 'finished';
  smallBlind?: number;
  bigBlind?: number;
}> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  const data = snap.data() as Record<string, unknown>;
  return {
    date: toDate(data.date ?? data.createdAt),
    finishedAt: data.finishedAt ? toDate(data.finishedAt) : undefined,
    location: data.location ? String(data.location) : undefined,
    hostId: data.hostId ? String(data.hostId) : undefined,
    status: data.status === 'finished' ? 'finished' : 'active',
    ...sessionBlindsFromDocData(data),
  };
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
  await writeSessionParticipant(sessionId, input.playerId, input.playerName);
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
// Groups  (subcollection: players/{uid}/groups/{groupId})
//         members:         players/{uid}/groups/{groupId}/members/{memberId}
// ---------------------------------------------------------------------------

export async function createGroup(uid: string, name: string): Promise<string> {
  const db = getFirestoreDb();
  const colRef = collection(db, 'players', uid, 'groups');
  const existing = await getDocs(colRef);
  if (existing.size >= 10) {
    throw new Error('You can create up to 10 groups.');
  }
  const ref = await addDoc(colRef, {
    name: name.trim(),
    createdAt: serverTimestamp(),
    memberCount: 0,
  });
  return ref.id;
}

export async function renameGroup(uid: string, groupId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Group name is required.');
  }
  const ref = doc(getFirestoreDb(), 'players', uid, 'groups', groupId);
  await updateDoc(ref, { name: trimmed });
}

export async function deleteGroup(uid: string, groupId: string): Promise<void> {
  const db = getFirestoreDb();
  const membersSnap = await getDocs(collection(db, 'players', uid, 'groups', groupId, 'members'));
  const batch = writeBatch(db);
  membersSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'players', uid, 'groups', groupId));
  await batch.commit();
}

export function subscribeGroups(
  uid: string,
  onNext: (groups: PokerGroup[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const colRef = collection(getFirestoreDb(), 'players', uid, 'groups');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const groups = snapshot.docs.map<PokerGroup>((d) => ({
        id: d.id,
        name: String(d.data().name ?? ''),
        createdAt: toDate(d.data().createdAt),
        memberCount: Number(d.data().memberCount ?? 0),
      }));
      onNext(groups);
    },
    onError
  );
}

export async function addGroupMember(
  uid: string,
  groupId: string,
  member: GroupMember
): Promise<void> {
  const db = getFirestoreDb();
  const groupRef = doc(db, 'players', uid, 'groups', groupId);
  const memberRef = doc(db, 'players', uid, 'groups', groupId, 'members', member.id);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(memberRef);
    tx.set(memberRef, { name: member.name, isRegistered: member.isRegistered });
    if (!existing.exists()) {
      tx.update(groupRef, { memberCount: increment(1) });
    }
  });
}

export async function removeGroupMember(
  uid: string,
  groupId: string,
  memberId: string
): Promise<void> {
  const db = getFirestoreDb();
  const groupRef = doc(db, 'players', uid, 'groups', groupId);
  const memberRef = doc(db, 'players', uid, 'groups', groupId, 'members', memberId);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(memberRef);
    if (!existing.exists()) return;
    tx.delete(memberRef);
    tx.update(groupRef, { memberCount: increment(-1) });
  });
}

export async function getGroupMembers(uid: string, groupId: string): Promise<GroupMember[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, 'groups', groupId, 'members');
  const snap = await getDocs(colRef);
  return snap.docs.map<GroupMember>((d) => ({
    id: d.id,
    name: String(d.data().name ?? ''),
    isRegistered: Boolean(d.data().isRegistered),
  }));
}

export function subscribeGroupMembers(
  uid: string,
  groupId: string,
  onNext: (members: GroupMember[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const colRef = collection(getFirestoreDb(), 'players', uid, 'groups', groupId, 'members');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const members = snapshot.docs.map<GroupMember>((d) => ({
        id: d.id,
        name: String(d.data().name ?? ''),
        isRegistered: Boolean(d.data().isRegistered),
      }));
      onNext(members.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError
  );
}

// ---------------------------------------------------------------------------
// Player history (all sessions a player participated in via buy-ins)
// ---------------------------------------------------------------------------

type SessionHistoryEntry = SessionRecord & {
  totalBuyIn: number;
  cashOut: number;
  profit: number;
};

async function sessionHistoryEntriesFromDocs(
  db: ReturnType<typeof getFirestoreDb>,
  sessionDocs: QueryDocumentSnapshot[],
  playerId: string
): Promise<SessionHistoryEntry[]> {
  const records: SessionHistoryEntry[] = [];

  await Promise.all(
    sessionDocs.map(async (sessionDoc) => {
      const resultRef = doc(db, 'sessions', sessionDoc.id, 'results', playerId);
      const resultSnap = await getDoc(resultRef);
      if (!resultSnap.exists()) return;

      const data = sessionDoc.data() as Record<string, unknown>;
      const r = resultSnap.data()!;
      records.push({
        id: sessionDoc.id,
        hostId: String(data.hostId ?? ''),
        location: data.location ? String(data.location) : undefined,
        ...sessionBlindsFromDocData(data),
        status: 'finished',
        date: toDate(data.date ?? data.createdAt),
        finishedAt: data.finishedAt ? toDate(data.finishedAt) : undefined,
        totalBuyIn: Number(r.totalBuyIn ?? 0),
        cashOut: Number(r.cashOut ?? 0),
        profit: Number(r.profit ?? 0),
      });
    })
  );

  return records;
}

/** Page size for History tab (Firestore `limit` per request; use `startAfter` for next page). */
export const HISTORY_TAB_PAGE_SIZE = 50;

type SessionHistoryPageResult = {
  entries: SessionHistoryEntry[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
};

/**
 * One page of finished sessions (newest first), keeping only those with `results/{playerId}`.
 * Pass `lastDoc` from the previous page as `cursor` for the next page.
 * Requires composite index: `sessions` — `status` ASC + `date` DESC + `__name__` DESC.
 */
export async function getSessionHistoryPage(
  playerId: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot | null
): Promise<SessionHistoryPageResult> {
  const db = getFirestoreDb();
  const snap = await getDocs(
    cursor
      ? query(
          collection(db, 'sessions'),
          where('status', '==', 'finished'),
          orderBy('date', 'desc'),
          orderBy(documentId(), 'desc'),
          startAfter(cursor),
          limit(pageSize)
        )
      : query(
          collection(db, 'sessions'),
          where('status', '==', 'finished'),
          orderBy('date', 'desc'),
          orderBy(documentId(), 'desc'),
          limit(pageSize)
        )
  );

  if (snap.empty) {
    return { entries: [], lastDoc: null, hasMore: false };
  }

  const entries = await sessionHistoryEntriesFromDocs(db, snap.docs, playerId);
  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  const lastDoc = snap.docs[snap.docs.length - 1];
  const hasMore = snap.docs.length === pageSize;
  return { entries, lastDoc, hasMore };
}

/**
 * Documents per Firestore query. This is not a cap on total history: we page with `startAfter`
 * until a batch returns fewer than this many docs (or empty).
 */
const FINISHED_SESSIONS_QUERY_PAGE_SIZE = 500;

/**
 * Every finished session in the database (paginated in batches), keeping only those with a
 * `results/{playerId}` doc. Requires composite index: `sessions` — `status` ASC + `date` DESC + `__name__` DESC.
 */
async function getFullSessionHistoryForPlayer(playerId: string): Promise<SessionHistoryEntry[]> {
  const db = getFirestoreDb();
  const allDocs: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;

  while (true) {
    const snap = await getDocs(
      cursor
        ? query(
            collection(db, 'sessions'),
            where('status', '==', 'finished'),
            orderBy('date', 'desc'),
            orderBy(documentId(), 'desc'),
            startAfter(cursor),
            limit(FINISHED_SESSIONS_QUERY_PAGE_SIZE)
          )
        : query(
            collection(db, 'sessions'),
            where('status', '==', 'finished'),
            orderBy('date', 'desc'),
            orderBy(documentId(), 'desc'),
            limit(FINISHED_SESSIONS_QUERY_PAGE_SIZE)
          )
    );
    if (snap.empty) break;
    allDocs.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < FINISHED_SESSIONS_QUERY_PAGE_SIZE) break;
  }

  const records = await sessionHistoryEntriesFromDocs(db, allDocs, playerId);
  return records.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function sessionDurationMsForStats(entry: SessionHistoryEntry): number {
  if (!entry.finishedAt) return 0;
  const start = entry.date.getTime();
  const end = entry.finishedAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

/** Aggregated stats for Settings → Statistics (uses same data sources as history / home). */
export type PlayerAppStatistics = {
  finishedSessions: number;
  totalProfit: number;
  totalBuyIn: number;
  totalCashOut: number;
  winningSessions: number;
  losingSessions: number;
  breakEvenSessions: number;
  bestSessionProfit: number | null;
  worstSessionProfit: number | null;
  avgProfitPerSession: number | null;
  sessionsAsHost: number;
  sessionsAsParticipant: number;
  uniqueSessionLocations: number;
  sessionsWithLocation: number;
  totalPlayTimeMs: number;
  firstSessionDate: Date | null;
  lastSessionDate: Date | null;
  friendCount: number;
  groupCount: number;
  savedLocationCount: number;
  /** Profit / loss per hour of recorded table time (`totalPlayTimeMs` > 0). */
  profitPerHour: number | null;
};

export async function getPlayerAppStatistics(uid: string): Promise<PlayerAppStatistics> {
  const db = getFirestoreDb();
  const [history, friendsSnap, groupsSnap, savedLocs] = await Promise.all([
    getFullSessionHistoryForPlayer(uid),
    getDocs(collection(db, 'players', uid, 'friends')),
    getDocs(collection(db, 'players', uid, 'groups')),
    getSavedLocations(uid),
  ]);

  const finishedSessions = history.length;
  let totalProfit = 0;
  let totalBuyIn = 0;
  let totalCashOut = 0;
  let winningSessions = 0;
  let losingSessions = 0;
  let breakEvenSessions = 0;
  let bestSessionProfit: number | null = null;
  let worstSessionProfit: number | null = null;
  let sessionsAsHost = 0;
  let sessionsAsParticipant = 0;
  let totalPlayTimeMs = 0;
  const locationSet = new Set<string>();
  let sessionsWithLocation = 0;

  for (const h of history) {
    totalProfit += h.profit;
    totalBuyIn += h.totalBuyIn;
    totalCashOut += h.cashOut;
    if (h.profit > 0) winningSessions += 1;
    else if (h.profit < 0) losingSessions += 1;
    else breakEvenSessions += 1;
    if (bestSessionProfit === null || h.profit > bestSessionProfit) bestSessionProfit = h.profit;
    if (worstSessionProfit === null || h.profit < worstSessionProfit) worstSessionProfit = h.profit;
    if (h.hostId === uid) sessionsAsHost += 1;
    else sessionsAsParticipant += 1;
    totalPlayTimeMs += sessionDurationMsForStats(h);
    const loc = h.location?.trim();
    if (loc) {
      sessionsWithLocation += 1;
      locationSet.add(loc);
    }
  }

  const avgProfitPerSession = finishedSessions > 0 ? totalProfit / finishedSessions : null;
  const hoursPlayed = totalPlayTimeMs / 3_600_000;
  const profitPerHour = hoursPlayed > 0 ? totalProfit / hoursPlayed : null;
  const dates = history.map((h) => h.date.getTime()).filter(Number.isFinite);
  const firstSessionDate =
    dates.length > 0 ? new Date(Math.min(...dates)) : null;
  const lastSessionDate =
    dates.length > 0 ? new Date(Math.max(...dates)) : null;

  return {
    finishedSessions,
    totalProfit,
    totalBuyIn,
    totalCashOut,
    winningSessions,
    losingSessions,
    breakEvenSessions,
    bestSessionProfit,
    worstSessionProfit,
    avgProfitPerSession,
    sessionsAsHost,
    sessionsAsParticipant,
    uniqueSessionLocations: locationSet.size,
    sessionsWithLocation,
    totalPlayTimeMs,
    firstSessionDate,
    lastSessionDate,
    friendCount: friendsSnap.size,
    groupCount: groupsSnap.size,
    savedLocationCount: savedLocs.length,
    profitPerHour,
  };
}
