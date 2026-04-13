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
  SessionAmountUnit,
  SessionRecord,
  SessionResult,
} from '@/types';
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
    const prevName = String(snapshot.data().name ?? '');
    refCode = snapshot.data().refCode ? String(snapshot.data().refCode) : undefined;
    await setDoc(ref, { name, anonymousUid: uid }, { merge: true });
    if (prevName !== name) {
      scheduleProfileDenormalization(
        'displayName',
        Promise.all([
          propagateMyDisplayToFriends(uid, { name }),
          propagateDisplayNameToGroupMembers(uid, name),
        ])
      );
    }
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

export async function fetchIncomingFriendRequests(uid: string): Promise<FriendRequestRecord[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, FRIEND_REQUESTS);
  const snapshot = await getDocs(colRef);
  const requests = snapshot.docs.map((d) => mapFriendRequestDoc(d));
  return requests.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchOutgoingFriendRequests(uid: string): Promise<FriendRequestRecord[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, FRIEND_REQUESTS_SENT);
  const snapshot = await getDocs(colRef);
  const requests = snapshot.docs.map((d) => mapFriendRequestDoc(d));
  return requests.sort((a, b) => a.name.localeCompare(b.name));
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

/** Max operations per Firestore batch (stay under 500). */
const FRIEND_PROPAGATE_BATCH_SIZE = 400;

/**
 * Runs denormalized writes without blocking the caller so the canonical `players/{uid}` update
 * can finish and the UI can unblock; failures are logged (friends/groups may be briefly stale).
 */
function scheduleProfileDenormalization(label: string, work: Promise<unknown>): void {
  void work.catch((err) => {
    console.error(`[Firestore profile denorm: ${label}]`, err);
  });
}

/**
 * Updates each friend's denormalized copy of this user (`players/{friendUid}/friends/{myUid}`).
 * Without this, avatar/name changes only live on `players/{myUid}` and friends' lists stay stale.
 */
async function propagateMyDisplayToFriends(
  myUid: string,
  patch: { name?: string; avatarEmoji?: string | null }
): Promise<void> {
  const hasName = patch.name !== undefined;
  const hasAvatar = patch.avatarEmoji !== undefined;
  if (!hasName && !hasAvatar) return;

  const db = getFirestoreDb();
  const friendsSnap = await getDocs(collection(db, 'players', myUid, 'friends'));
  if (friendsSnap.empty) return;

  const firestorePatch: Record<string, string | null> = {};
  if (hasName) firestorePatch.name = patch.name as string;
  if (hasAvatar) firestorePatch.avatarEmoji = patch.avatarEmoji ?? null;

  const friendIds = friendsSnap.docs.map((d) => d.id);
  for (let i = 0; i < friendIds.length; i += FRIEND_PROPAGATE_BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const friendId of friendIds.slice(i, i + FRIEND_PROPAGATE_BATCH_SIZE)) {
      batch.update(doc(db, 'players', friendId, 'friends', myUid), firestorePatch);
    }
    await batch.commit();
  }
}

/**
 * Updates `avatarEmoji` on every `groups/{groupId}/members/{myUid}` row so group lists stay in sync
 * after the player changes their profile avatar (same idea as friends denormalization).
 */
async function propagateAvatarToGroupMembers(myUid: string, avatarEmoji: string | null): Promise<void> {
  const db = getFirestoreDb();
  const membershipsSnap = await getDocs(collection(db, 'players', myUid, 'group_memberships'));
  if (membershipsSnap.empty) return;

  const groupIds = membershipsSnap.docs.map((d) => d.id);
  await Promise.allSettled(
    groupIds.map((groupId) =>
      updateDoc(doc(db, 'groups', groupId, 'members', myUid), { avatarEmoji })
    )
  );
}

/** Syncs display `name` on every `groups/{groupId}/members/{myUid}` row after profile name change. */
async function propagateDisplayNameToGroupMembers(myUid: string, name: string): Promise<void> {
  const db = getFirestoreDb();
  const membershipsSnap = await getDocs(collection(db, 'players', myUid, 'group_memberships'));
  if (membershipsSnap.empty) return;

  const groupIds = membershipsSnap.docs.map((d) => d.id);
  await Promise.allSettled(
    groupIds.map((groupId) =>
      updateDoc(doc(db, 'groups', groupId, 'members', myUid), { name })
    )
  );
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

/** One-shot read; same ordering as {@link subscribeFriends}. */
export async function fetchFriendsList(uid: string): Promise<FriendRecord[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, 'friends');
  const snapshot = await getDocs(colRef);
  const friends = snapshot.docs.map<FriendRecord>((d) => ({
    playerId: d.id,
    name: String(d.data().name ?? ''),
    addedAt: toDate(d.data().addedAt),
    avatarEmoji: normalizeAvatarEmoji(d.data().avatarEmoji),
  }));
  return friends.sort((a, b) => a.name.localeCompare(b.name));
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

function sessionAmountMetaFromDocData(data: Record<string, unknown>): {
  amountUnit: SessionAmountUnit;
  dollarsPerChip?: number;
} {
  const amountUnit: SessionAmountUnit = data.amountUnit === 'chips' ? 'chips' : 'cash';
  if (amountUnit !== 'chips') return { amountUnit: 'cash' };
  const raw = data.dollarsPerChip;
  const n = typeof raw === 'number' ? raw : Number(raw);
  const dollarsPerChip = Number.isFinite(n) && n > 0 ? n : undefined;
  return { amountUnit: 'chips', dollarsPerChip };
}

export async function createSession(input: {
  hostId: string;
  hostName?: string;
  location?: string;
  smallBlind?: number;
  bigBlind?: number;
  amountUnit?: SessionAmountUnit;
  dollarsPerChip?: number;
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

  const amountUnit: SessionAmountUnit = input.amountUnit === 'chips' ? 'chips' : 'cash';
  let dollarsPerChip: number | null = null;
  if (amountUnit === 'chips') {
    const dpc = input.dollarsPerChip;
    if (dpc == null || !Number.isFinite(dpc) || dpc <= 0) {
      throw new Error('Chip sessions require a valid dollars-per-chip value.');
    }
    dollarsPerChip = dpc;
  }

  await setDoc(sessionRef, {
    hostId: input.hostId,
    date: serverTimestamp(),
    location: input.location?.trim() || null,
    status: 'active',
    smallBlind,
    bigBlind,
    amountUnit,
    dollarsPerChip,
  });

  const hostLabel = input.hostName?.trim() || input.hostId;
  await writeSessionParticipant(sessionRef.id, input.hostId, hostLabel);

  return sessionRef.id;
}

function mapSessionDocToRecord(sessionId: string, data: Record<string, unknown>): SessionRecord {
  const { amountUnit, dollarsPerChip } = sessionAmountMetaFromDocData(data);
  return {
    id: sessionId,
    hostId: String(data.hostId ?? ''),
    location: data.location ? String(data.location) : undefined,
    ...sessionBlindsFromDocData(data),
    amountUnit,
    ...(amountUnit === 'chips' && dollarsPerChip != null ? { dollarsPerChip } : {}),
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

/** Host-only: dollar value of one chip for chip-mode sessions (e.g. 0.5 for 100 chips = $50). */
export async function updateSessionDollarsPerChip(sessionId: string, dollarsPerChip: number): Promise<void> {
  if (!Number.isFinite(dollarsPerChip) || dollarsPerChip <= 0) {
    throw new Error('Dollars per chip must be a positive number.');
  }
  const ref = doc(getFirestoreDb(), 'sessions', sessionId);
  await updateDoc(ref, { dollarsPerChip });
}

export async function updatePlayerAvatar(uid: string, avatarEmoji: string): Promise<void> {
  const db = getFirestoreDb();
  const ref = doc(db, 'players', uid);
  const trimmed = avatarEmoji.trim();
  const value = trimmed || null;
  await updateDoc(ref, { avatarEmoji: value });
  scheduleProfileDenormalization(
    'avatar',
    Promise.all([
      propagateMyDisplayToFriends(uid, { avatarEmoji: value }),
      propagateAvatarToGroupMembers(uid, value),
    ])
  );
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
  amountUnit: SessionAmountUnit;
  dollarsPerChip?: number;
}> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { amountUnit: 'cash' };
  const data = snap.data() as Record<string, unknown>;
  const { amountUnit, dollarsPerChip } = sessionAmountMetaFromDocData(data);
  return {
    date: toDate(data.date ?? data.createdAt),
    finishedAt: data.finishedAt ? toDate(data.finishedAt) : undefined,
    location: data.location ? String(data.location) : undefined,
    hostId: data.hostId ? String(data.hostId) : undefined,
    status: data.status === 'finished' ? 'finished' : 'active',
    ...sessionBlindsFromDocData(data),
    amountUnit,
    ...(amountUnit === 'chips' && dollarsPerChip != null ? { dollarsPerChip } : {}),
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
// Groups — canonical: groups/{groupId} + groups/{groupId}/members/{memberId}
// Per-user index (one query for the Groups tab): players/{uid}/group_memberships/{groupId}
// ---------------------------------------------------------------------------

const GROUPS_COLLECTION = 'groups';
const GROUP_MEMBERSHIPS_SUB = 'group_memberships';

/** Keeps denormalized list fields in sync for every player who should see the group. */
async function syncGroupMembershipDocs(groupId: string): Promise<void> {
  const db = getFirestoreDb();
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) return;

  const g = groupSnap.data() as Record<string, unknown>;
  const name = String(g.name ?? '');
  const memberCount = Number(g.memberCount ?? 0);
  const ownerId = String(g.ownerId ?? '');
  const groupCreatedAt = g.createdAt ?? g.groupCreatedAt;

  const membersSnap = await getDocs(collection(db, GROUPS_COLLECTION, groupId, 'members'));
  const registeredIds = membersSnap.docs
    .filter((d) => Boolean(d.data().isRegistered))
    .map((d) => d.id);

  const ids = new Set<string>([ownerId, ...registeredIds]);
  const idsList = [...ids];

  const payloadBase: Record<string, unknown> = {
    name,
    memberCount,
    ownerId,
  };
  if (groupCreatedAt !== undefined && groupCreatedAt !== null) {
    payloadBase.groupCreatedAt = groupCreatedAt;
  }

  for (let i = 0; i < idsList.length; i += FRIEND_PROPAGATE_BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const pid of idsList.slice(i, i + FRIEND_PROPAGATE_BATCH_SIZE)) {
      const mref = doc(db, 'players', pid, GROUP_MEMBERSHIPS_SUB, groupId);
      const role = pid === ownerId ? 'owner' : 'member';
      batch.set(
        mref,
        {
          ...payloadBase,
          role,
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
}

export async function createGroup(uid: string, name: string): Promise<string> {
  const db = getFirestoreDb();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Group name is required.');

  const ownedSnap = await getDocs(query(collection(db, GROUPS_COLLECTION), where('ownerId', '==', uid)));
  if (ownedSnap.size >= 10) {
    throw new Error('You can create up to 10 groups.');
  }

  const groupRef = doc(collection(db, GROUPS_COLLECTION));
  const groupId = groupRef.id;
  const groupCreatedAt = serverTimestamp();

  await setDoc(groupRef, {
    name: trimmed,
    ownerId: uid,
    memberCount: 0,
    createdAt: groupCreatedAt,
  });

  await setDoc(doc(db, 'players', uid, GROUP_MEMBERSHIPS_SUB, groupId), {
    name: trimmed,
    memberCount: 0,
    ownerId: uid,
    role: 'owner',
    groupCreatedAt,
  });

  return groupId;
}

export async function renameGroup(uid: string, groupId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Group name is required.');
  }
  const db = getFirestoreDb();
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const snap = await getDoc(groupRef);
  if (!snap.exists()) throw new Error('Group not found');
  if (String(snap.data().ownerId) !== uid) {
    throw new Error('Only the group owner can rename the group.');
  }
  await updateDoc(groupRef, { name: trimmed });
  await syncGroupMembershipDocs(groupId);
}

export async function deleteGroup(uid: string, groupId: string): Promise<void> {
  const db = getFirestoreDb();
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const snap = await getDoc(groupRef);
  if (!snap.exists()) throw new Error('Group not found');
  if (String(snap.data().ownerId) !== uid) {
    throw new Error('Only the group owner can delete the group.');
  }

  const membersSnap = await getDocs(collection(db, GROUPS_COLLECTION, groupId, 'members'));
  const membershipIds = new Set<string>([uid]);
  for (const d of membersSnap.docs) {
    if (Boolean(d.data().isRegistered)) membershipIds.add(d.id);
  }

  const memberDocs = membersSnap.docs.map((d) => d.ref);

  for (let i = 0; i < memberDocs.length; i += FRIEND_PROPAGATE_BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const ref of memberDocs.slice(i, i + FRIEND_PROPAGATE_BATCH_SIZE)) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  const membershipIdList = [...membershipIds];
  for (let i = 0; i < membershipIdList.length; i += FRIEND_PROPAGATE_BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const pid of membershipIdList.slice(i, i + FRIEND_PROPAGATE_BATCH_SIZE)) {
      batch.delete(doc(db, 'players', pid, GROUP_MEMBERSHIPS_SUB, groupId));
    }
    await batch.commit();
  }

  await deleteDoc(groupRef);
}

export function subscribeGroups(
  uid: string,
  onNext: (groups: PokerGroup[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const colRef = collection(getFirestoreDb(), 'players', uid, GROUP_MEMBERSHIPS_SUB);
  const q = query(colRef, orderBy('groupCreatedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const groups = snapshot.docs.map<PokerGroup>((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name ?? ''),
          createdAt: toDate(data.groupCreatedAt ?? data.createdAt),
          memberCount: Number(data.memberCount ?? 0),
          ownerId: String(data.ownerId ?? ''),
          myRole: data.role === 'owner' ? 'owner' : 'member',
        };
      });
      onNext(groups);
    },
    onError
  );
}

/** One-shot read; same ordering as {@link subscribeGroups}. */
export async function fetchGroupsList(uid: string): Promise<PokerGroup[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, GROUP_MEMBERSHIPS_SUB);
  const q = query(colRef, orderBy('groupCreatedAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map<PokerGroup>((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? ''),
      createdAt: toDate(data.groupCreatedAt ?? data.createdAt),
      memberCount: Number(data.memberCount ?? 0),
      ownerId: String(data.ownerId ?? ''),
      myRole: data.role === 'owner' ? 'owner' : 'member',
    };
  });
}

export async function addGroupMember(
  ownerUid: string,
  groupId: string,
  member: GroupMember
): Promise<void> {
  const db = getFirestoreDb();
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const memberRef = doc(db, GROUPS_COLLECTION, groupId, 'members', member.id);

  let avatarEmoji: string | null = null;
  if (member.isRegistered) {
    const fromInput = normalizeAvatarEmoji(member.avatarEmoji);
    if (fromInput) {
      avatarEmoji = fromInput;
    } else {
      const profile = await getPlayerProfile(member.id);
      const fromProfile = profile ? normalizeAvatarEmoji(profile.avatarEmoji) : undefined;
      avatarEmoji = fromProfile ?? null;
    }
  } else {
    avatarEmoji = normalizeAvatarEmoji(member.avatarEmoji) ?? null;
  }

  await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(groupRef);
    if (!gSnap.exists()) throw new Error('Group not found');
    if (String(gSnap.data().ownerId) !== ownerUid) {
      throw new Error('Only the group owner can add members');
    }

    const existing = await tx.get(memberRef);
    tx.set(memberRef, {
      name: member.name,
      isRegistered: member.isRegistered,
      avatarEmoji,
    });
    if (!existing.exists()) {
      tx.update(groupRef, { memberCount: increment(1) });
    }
  });

  await syncGroupMembershipDocs(groupId);
}

export async function removeGroupMember(
  ownerUid: string,
  groupId: string,
  memberId: string
): Promise<void> {
  const db = getFirestoreDb();
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const memberRef = doc(db, GROUPS_COLLECTION, groupId, 'members', memberId);

  let wasRegistered = false;

  await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(groupRef);
    if (!gSnap.exists()) throw new Error('Group not found');
    if (String(gSnap.data().ownerId) !== ownerUid) {
      throw new Error('Only the group owner can remove members');
    }

    const existing = await tx.get(memberRef);
    if (!existing.exists()) return;
    wasRegistered = Boolean(existing.data().isRegistered);
    tx.delete(memberRef);
    tx.update(groupRef, { memberCount: increment(-1) });
  });

  if (wasRegistered) {
    await deleteDoc(doc(db, 'players', memberId, GROUP_MEMBERSHIPS_SUB, groupId));
  }

  await syncGroupMembershipDocs(groupId);
}

export async function getGroupMembers(viewerUid: string, groupId: string): Promise<GroupMember[]> {
  const db = getFirestoreDb();
  const access = await getDoc(doc(db, 'players', viewerUid, GROUP_MEMBERSHIPS_SUB, groupId));
  if (!access.exists()) {
    throw new Error('Group not found or you are not a member.');
  }
  const snap = await getDocs(collection(db, GROUPS_COLLECTION, groupId, 'members'));
  return snap.docs.map<GroupMember>((d) => ({
    id: d.id,
    name: String(d.data().name ?? ''),
    isRegistered: Boolean(d.data().isRegistered),
    avatarEmoji: normalizeAvatarEmoji(d.data().avatarEmoji),
  }));
}

export function subscribeGroupMembers(
  _viewerUid: string,
  groupId: string,
  onNext: (members: GroupMember[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const db = getFirestoreDb();
  const colRef = collection(db, GROUPS_COLLECTION, groupId, 'members');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const members = snapshot.docs.map<GroupMember>((d) => ({
        id: d.id,
        name: String(d.data().name ?? ''),
        isRegistered: Boolean(d.data().isRegistered),
        avatarEmoji: normalizeAvatarEmoji(d.data().avatarEmoji),
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
      const { amountUnit, dollarsPerChip } = sessionAmountMetaFromDocData(data);
      records.push({
        id: sessionDoc.id,
        hostId: String(data.hostId ?? ''),
        location: data.location ? String(data.location) : undefined,
        ...sessionBlindsFromDocData(data),
        amountUnit,
        ...(amountUnit === 'chips' && dollarsPerChip != null ? { dollarsPerChip } : {}),
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
    getDocs(collection(db, 'players', uid, GROUP_MEMBERSHIPS_SUB)),
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
