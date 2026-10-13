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
  arrayRemove,
  arrayUnion,
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
import { normalizeAvatarEmoji } from '@/lib/avatar-emoji';
import {
  MAX_GROUP_NAME_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_SESSION_PLAYERS,
  SESSION_PLAYER_LIMIT_MESSAGE,
  canDecrementMemberCount,
  clipText,
  finiteNum,
  groupFromMembershipData,
  isOversizedSession,
  mapDocsSafely,
  numOrZero,
  optStr,
  sessionPlayerIds,
  sessionSummaryFromDocData,
  storedPlayerResult,
  storedProfitEntries,
  str,
  tryMap,
} from '@/lib/firestore-coerce';
import { failedMembershipIds, leaveGroupInTransaction, membershipSyncError } from '@/lib/group-writes';
import { AMOUNT_TOO_LARGE_MESSAGE, isAmountInRange } from '@/lib/parse-amount';
import { participantAddError } from '@/lib/user-message';

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return new Date();
}

const SESSION_PARTICIPANTS_SUBCOLLECTION = 'session_participants';

function appendSessionParticipantWrites(
  batch: ReturnType<typeof writeBatch>,
  sessionId: string,
  playerId: string,
  playerName: string,
  options?: { skipSessionUpdate?: boolean }
): void {
  const db = getFirestoreDb();
  const ref = doc(db, 'sessions', sessionId, SESSION_PARTICIPANTS_SUBCOLLECTION, playerId);
  batch.set(
    ref,
    {
      playerId,
      playerName: playerName.trim() || playerId,
      joinedAt: serverTimestamp(),
    },
    { merge: true }
  );
  if (!options?.skipSessionUpdate) {
    batch.update(doc(db, 'sessions', sessionId), { participantIds: arrayUnion(playerId) });
  }
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
    name: str(data.name),
    anonymousUid: optStr(data.anonymousUid) ?? uid,
    refCode: optStr(data.refCode),
    avatarEmoji: normalizeAvatarEmoji(data.avatarEmoji),
  };
}

function termsFields(termsVersion?: string) {
  return termsVersion ? { termsVersion, termsAcceptedAt: serverTimestamp() } : {};
}

export async function upsertPlayerProfile(uid: string, name: string, termsVersion?: string): Promise<PlayerProfile> {
  const db = getFirestoreDb();
  const ref = doc(db, 'players', uid);
  const snapshot = await getDoc(ref);

  let refCode: string | undefined;
  if (snapshot.exists()) {
    const prevName = str(snapshot.data().name);
    refCode = optStr(snapshot.data().refCode);
    await setDoc(ref, { name, anonymousUid: uid, ...termsFields(termsVersion) }, { merge: true });
    if (prevName !== name) {
      const propagateName = () =>
        Promise.all([
          propagateMyDisplayToFriends(uid, { name }),
          propagateDisplayNameToGroupMembers(uid, name),
        ]);
      scheduleProfileDenormalization('displayName', propagateName(), propagateName);
    }
  } else {
    refCode = await reserveRefCode(uid);
    await setDoc(ref, {
      name,
      anonymousUid: uid,
      refCode,
      createdAt: serverTimestamp(),
      ...termsFields(termsVersion),
    });
  }

  return {
    id: uid,
    name,
    anonymousUid: uid,
    refCode,
    avatarEmoji: snapshot.exists() ? normalizeAvatarEmoji(snapshot.data().avatarEmoji) : undefined,
  };
}

export async function recordTermsAcceptance(uid: string, termsVersion: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'players', uid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;
  await setDoc(ref, termsFields(termsVersion), { merge: true });
}

function generateRefCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const REF_CODE_RESERVE_ATTEMPTS = 5;

function isPermissionDenied(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'permission-denied'
  );
}

async function reserveRefCode(uid: string): Promise<string> {
  const db = getFirestoreDb();
  for (let attempt = 0; attempt < REF_CODE_RESERVE_ATTEMPTS; attempt++) {
    const code = generateRefCode();
    try {
      await setDoc(doc(db, 'refCodes', code), { playerId: uid });
      return code;
    } catch (err) {
      if (!isPermissionDenied(err)) throw err;
    }
  }
  throw new Error('Could not reserve a referral code. Please try again.');
}

export async function ensureRefCode(uid: string): Promise<string> {
  const db = getFirestoreDb();
  const ref = doc(db, 'players', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Player not found');
  const data = snap.data();
  const existingRefCode = optStr(data.refCode);
  if (existingRefCode) return existingRefCode;

  const code = await reserveRefCode(uid);
  await updateDoc(ref, { refCode: code });
  return code;
}

const FRIEND_REQUESTS = 'friend_requests';
const FRIEND_REQUESTS_SENT = 'friend_requests_sent';

type SendFriendRequestResult =
  | { ok: true; outcome: 'sent' | 'now_friends' }
  | { ok: false; reason: 'already_friends' | 'already_sent' | 'self' };

function mapFriendRequestDoc(d: { id: string; data: () => Record<string, unknown> }): FriendRequestRecord {
  const data = d.data();
  return {
    playerId: d.id,
    name: str(data.name),
    createdAt: toDate(data.createdAt),
    avatarEmoji: normalizeAvatarEmoji(data.avatarEmoji),
  };
}

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
    await commitFriendAccept(fromUid, toProfile.id);
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
  await commitFriendAccept(receiverUid, senderUid);
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
      const requests = mapDocsSafely(snapshot.docs, colRef.path, mapFriendRequestDoc);
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
      const requests = mapDocsSafely(snapshot.docs, colRef.path, mapFriendRequestDoc);
      onNext(requests.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError
  );
}

export async function fetchIncomingFriendRequests(uid: string): Promise<FriendRequestRecord[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, FRIEND_REQUESTS);
  const snapshot = await getDocs(colRef);
  const requests = mapDocsSafely(snapshot.docs, colRef.path, mapFriendRequestDoc);
  return requests.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchOutgoingFriendRequests(uid: string): Promise<FriendRequestRecord[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, FRIEND_REQUESTS_SENT);
  const snapshot = await getDocs(colRef);
  const requests = mapDocsSafely(snapshot.docs, colRef.path, mapFriendRequestDoc);
  return requests.sort((a, b) => a.name.localeCompare(b.name));
}

export async function lookupPlayerByRefCode(code: string): Promise<PlayerProfile | null> {
  const ref = doc(getFirestoreDb(), 'refCodes', code.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const playerId = optStr(snap.data().playerId);
  return playerId ? getPlayerProfile(playerId) : null;
}

async function commitFriendAccept(myUid: string, friendUid: string): Promise<void> {
  const db = getFirestoreDb();
  const [myProfile, friendProfile] = await Promise.all([
    getPlayerProfile(myUid),
    getPlayerProfile(friendUid),
  ]);
  if (!myProfile) throw new Error('Your profile not found');
  if (!friendProfile) throw new Error('Player not found');

  const batch = writeBatch(db);
  batch.delete(doc(db, 'players', myUid, FRIEND_REQUESTS, friendUid));
  batch.delete(doc(db, 'players', friendUid, FRIEND_REQUESTS_SENT, myUid));
  batch.delete(doc(db, 'players', myUid, FRIEND_REQUESTS_SENT, friendUid));
  batch.delete(doc(db, 'players', friendUid, FRIEND_REQUESTS, myUid));
  batch.set(doc(db, 'players', myUid, 'friends', friendUid), {
    name: friendProfile.name,
    avatarEmoji: friendProfile.avatarEmoji ?? null,
    addedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'players', friendUid, 'friends', myUid), {
    name: myProfile.name,
    avatarEmoji: myProfile.avatarEmoji ?? null,
    addedAt: serverTimestamp(),
  });
  await batch.commit();
}

const FRIEND_PROPAGATE_BATCH_SIZE = 400;

const DENORM_RETRY_DELAY_MS = 3000;

function scheduleProfileDenormalization(
  label: string,
  work: Promise<unknown>,
  retry?: () => Promise<unknown>
): void {
  void work.catch((err) => {
    if (!retry) {
      console.error(`[Firestore profile denorm: ${label}]`, err);
      return;
    }
    console.warn(`[Firestore profile denorm: ${label}] failed, retrying once`, err);
    setTimeout(() => {
      void retry().catch((retryErr) => {
        console.error(`[Firestore profile denorm: ${label}] retry failed`, retryErr);
      });
    }, DENORM_RETRY_DELAY_MS);
  });
}

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

  await Promise.allSettled(
    friendsSnap.docs.map((d) => updateDoc(doc(db, 'players', d.id, 'friends', myUid), firestorePatch))
  );
}

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
  const batch = writeBatch(db);
  batch.delete(doc(db, 'players', myUid, 'friends', friendId));
  batch.delete(doc(db, 'players', friendId, 'friends', myUid));
  batch.delete(doc(db, 'players', myUid, FRIEND_REQUESTS, friendId));
  batch.delete(doc(db, 'players', friendId, FRIEND_REQUESTS_SENT, myUid));
  batch.delete(doc(db, 'players', myUid, FRIEND_REQUESTS_SENT, friendId));
  batch.delete(doc(db, 'players', friendId, FRIEND_REQUESTS, myUid));
  await batch.commit();
}

function mapFriendDoc(d: QueryDocumentSnapshot): FriendRecord {
  const data = d.data();
  return {
    playerId: d.id,
    name: str(data.name),
    addedAt: toDate(data.addedAt),
    avatarEmoji: normalizeAvatarEmoji(data.avatarEmoji),
  };
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
      const friends = mapDocsSafely(snapshot.docs, colRef.path, mapFriendDoc);
      onNext(friends.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError
  );
}

export async function fetchFriendsList(uid: string): Promise<FriendRecord[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, 'friends');
  const snapshot = await getDocs(colRef);
  const friends = mapDocsSafely(snapshot.docs, colRef.path, mapFriendDoc);
  return friends.sort((a, b) => a.name.localeCompare(b.name));
}

async function getAccessibleSessionDocs(uid: string): Promise<QueryDocumentSnapshot[]> {
  const db = getFirestoreDb();
  const [hostedSnap, participantSnap] = await Promise.all([
    getDocs(query(collection(db, 'sessions'), where('hostId', '==', uid))),
    getDocs(query(collection(db, 'sessions'), where('participantIds', 'array-contains', uid))),
  ]);
  const byId = new Map<string, QueryDocumentSnapshot>();
  for (const d of hostedSnap.docs) byId.set(d.id, d);
  for (const d of participantSnap.docs) byId.set(d.id, d);
  return [...byId.values()];
}

const SCAN_CACHE_TTL_MS = 5 * 60 * 1000;
const scanCache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

function cachedScan<T>(key: string, forceRefresh: boolean, run: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = scanCache.get(key);
  if (!forceRefresh && hit && hit.expiresAt > now) return hit.value as Promise<T>;

  const value = run().catch((err) => {
    scanCache.delete(key);
    throw err;
  });
  scanCache.set(key, { expiresAt: now + SCAN_CACHE_TTL_MS, value });
  return value;
}

export function invalidateSessionScanCache(): void {
  scanCache.clear();
}

async function sumProfitsAcrossSessions(uid: string): Promise<Map<string, number>> {
  const db = getFirestoreDb();
  const sessionDocs = await getAccessibleSessionDocs(uid);
  const profitById = new Map<string, number>();
  await Promise.all(
    sessionDocs.map(async (sDoc) => {
      const data = sDoc.data();
      if (data.status !== 'finished' || isOversizedSession(data)) return;
      const stored = tryMap(`sessions/${sDoc.id}`, () => storedProfitEntries(sDoc.id, data));
      if (stored === undefined) return;
      if (stored) {
        for (const [playerId, profit] of stored) {
          profitById.set(playerId, (profitById.get(playerId) ?? 0) + profit);
        }
        return;
      }
      const resultsSnap = await getDocs(collection(db, 'sessions', sDoc.id, 'results'));
      for (const r of resultsSnap.docs) {
        const profit = numOrZero(r.data(), 'profit', `sessions/${sDoc.id}/results/${r.id}`);
        profitById.set(r.id, (profitById.get(r.id) ?? 0) + profit);
      }
    })
  );
  return profitById;
}

export async function getFriendLeaderboard(
  uid: string,
  forceRefresh = false
): Promise<{ playerId: string; name: string; avatarEmoji?: string; totalProfit: number }[]> {
  const db = getFirestoreDb();
  const [friendsSnap, myProfile, profitById] = await Promise.all([
    getDocs(collection(db, 'players', uid, 'friends')),
    getPlayerProfile(uid),
    cachedScan(`profits:${uid}`, forceRefresh, () => sumProfitsAcrossSessions(uid)),
  ]);

  const leaderboard = mapDocsSafely(friendsSnap.docs, `players/${uid}/friends`, (d) => {
    const friend = mapFriendDoc(d);
    return {
      playerId: friend.playerId,
      name: friend.name,
      avatarEmoji: friend.avatarEmoji,
      totalProfit: profitById.get(d.id) ?? 0,
    };
  });
  if (myProfile) {
    leaderboard.push({
      playerId: uid,
      name: myProfile.name,
      avatarEmoji: myProfile.avatarEmoji,
      totalProfit: profitById.get(uid) ?? 0,
    });
  }

  return leaderboard.sort((a, b) => b.totalProfit - a.totalProfit);
}

export async function getGroupLeaderboard(
  uid: string,
  groupId: string,
  forceRefresh = false
): Promise<{ playerId: string; name: string; avatarEmoji?: string; totalProfit: number }[]> {
  const [members, profitById] = await Promise.all([
    getGroupMembers(uid, groupId),
    cachedScan(`profits:${uid}`, forceRefresh, () => sumProfitsAcrossSessions(uid)),
  ]);
  if (members.length === 0) return [];

  const seen = new Set<string>();
  const leaderboard: { playerId: string; name: string; avatarEmoji?: string; totalProfit: number }[] = [];
  for (const m of members) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    leaderboard.push({
      playerId: m.id,
      name: m.name,
      avatarEmoji: m.avatarEmoji,
      totalProfit: profitById.get(m.id) ?? 0,
    });
  }

  return leaderboard.sort((a, b) => b.totalProfit - a.totalProfit);
}

const BUY_IN_TOO_LARGE_MESSAGE = `Buy-in amounts ${AMOUNT_TOO_LARGE_MESSAGE.toLowerCase()}.`;

type InitialBuyIn = { playerId: string; playerName: string; amount: number };

export async function createSession(input: {
  hostId: string;
  hostName?: string;
  location?: string;
  smallBlind?: number;
  bigBlind?: number;
  amountUnit?: SessionAmountUnit;
  dollarsPerChip?: number;
  groupId?: string;
  initialBuyIns?: InitialBuyIn[];
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

  const initialBuyIns = input.initialBuyIns ?? [];
  for (const b of initialBuyIns) {
    if (!Number.isFinite(b.amount) || b.amount <= 0) {
      throw new Error('Buy-in amounts must be positive numbers.');
    }
    if (!isAmountInRange(b.amount)) {
      throw new Error(BUY_IN_TOO_LARGE_MESSAGE);
    }
  }
  const playerIds = sessionPlayerIds(input.hostId, initialBuyIns.map((b) => b.playerId));
  if (playerIds.length > MAX_SESSION_PLAYERS) {
    throw new Error(SESSION_PLAYER_LIMIT_MESSAGE);
  }

  const groupId = input.groupId?.trim();
  const batch = writeBatch(db);
  batch.set(sessionRef, {
    hostId: input.hostId,
    date: serverTimestamp(),
    location: clipText(input.location?.trim() ?? '', MAX_LOCATION_LENGTH).trim() || null,
    status: 'active',
    smallBlind,
    bigBlind,
    amountUnit,
    dollarsPerChip,
    participantIds: [input.hostId],
    ...(groupId ? { groupId } : {}),
  });

  const writeInitialBuyIn = (target: ReturnType<typeof writeBatch>, b: InitialBuyIn) => {
    target.set(doc(collection(db, 'sessions', sessionRef.id, 'buy_ins')), {
      playerId: b.playerId,
      playerName: b.playerName,
      amount: b.amount,
      createdAt: serverTimestamp(),
    });
  };
  const buyInsByPlayer = new Map<string, InitialBuyIn[]>();
  for (const b of initialBuyIns) {
    buyInsByPlayer.set(b.playerId, [...(buyInsByPlayer.get(b.playerId) ?? []), b]);
  }

  const hostLabel = input.hostName?.trim() || input.hostId;
  appendSessionParticipantWrites(batch, sessionRef.id, input.hostId, hostLabel, {
    skipSessionUpdate: true,
  });
  for (const b of buyInsByPlayer.get(input.hostId) ?? []) {
    writeInitialBuyIn(batch, b);
    appendSessionParticipantWrites(batch, sessionRef.id, b.playerId, b.playerName, {
      skipSessionUpdate: true,
    });
  }
  await batch.commit();

  try {
    for (const playerId of playerIds.slice(1)) {
      const buyIns = buyInsByPlayer.get(playerId) ?? [];
      const playerName = buyIns[0]?.playerName ?? playerId;
      const playerBatch = writeBatch(db);
      buyIns.forEach((b) => writeInitialBuyIn(playerBatch, b));
      appendSessionParticipantWrites(playerBatch, sessionRef.id, playerId, playerName);
      await playerBatch.commit().catch((err: unknown) => {
        throw participantAddError(err, playerName.trim() || playerId, Boolean(input.groupId));
      });
    }
  } catch (err) {
    await deleteSession(sessionRef.id).catch((cleanupErr) => {
      console.error('[Firestore] createSession: could not remove partial session', cleanupErr);
    });
    throw err;
  }

  return sessionRef.id;
}

function mapSessionDocToRecord(sessionId: string, data: Record<string, unknown>): SessionRecord {
  return {
    id: sessionId,
    ...sessionSummaryFromDocData(data),
    status: data.status === 'finished' ? 'finished' : 'active',
    date: toDate(data.date ?? data.createdAt),
    finishedAt: data.finishedAt ? toDate(data.finishedAt) : undefined,
  };
}

const RECENT_SESSIONS_DISPLAY_LIMIT = 20;
const RECENT_SESSIONS_FETCH_LIMIT = 40;

export async function getRecentSessionsForPlayer(playerId: string): Promise<SessionRecord[]> {
  const db = getFirestoreDb();
  const [hostedSnap, participantSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'sessions'),
        where('hostId', '==', playerId),
        orderBy('date', 'desc'),
        limit(RECENT_SESSIONS_FETCH_LIMIT)
      )
    ),
    getDocs(
      query(
        collection(db, 'sessions'),
        where('participantIds', 'array-contains', playerId),
        orderBy('date', 'desc'),
        limit(RECENT_SESSIONS_FETCH_LIMIT)
      )
    ),
  ]);

  const sessionsById = new Map<string, Record<string, unknown>>();
  for (const snap of hostedSnap.docs) {
    sessionsById.set(snap.id, snap.data() as Record<string, unknown>);
  }
  for (const snap of participantSnap.docs) {
    sessionsById.set(snap.id, snap.data() as Record<string, unknown>);
  }

  const records: SessionRecord[] = [];
  for (const [sessionId, data] of sessionsById) {
    if (isOversizedSession(data)) continue;
    const record = tryMap(`sessions/${sessionId}`, () => mapSessionDocToRecord(sessionId, data));
    if (record) records.push(record);
  }
  return records
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, RECENT_SESSIONS_DISPLAY_LIMIT);
}

export async function updateSessionLocation(
  sessionId: string,
  location: string | null
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId);
  const trimmed = clipText(location?.trim() ?? '', MAX_LOCATION_LENGTH).trim();
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
  const propagateAvatar = () =>
    Promise.all([
      propagateMyDisplayToFriends(uid, { avatarEmoji: value }),
      propagateAvatarToGroupMembers(uid, value),
    ]);
  scheduleProfileDenormalization('avatar', propagateAvatar(), propagateAvatar);
}

export async function getSavedLocations(uid: string): Promise<SavedLocation[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, 'saved_locations');
  const q = query(colRef, orderBy('createdAt', 'desc'), limit(10));
  const snapshots = await getDocs(q);
  return snapshots.docs.map<SavedLocation>((d) => ({
    id: d.id,
    name: str(d.data().name),
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
} | null> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    date: toDate(data.date ?? data.createdAt),
    finishedAt: data.finishedAt ? toDate(data.finishedAt) : undefined,
    ...sessionSummaryFromDocData(data),
    hostId: optStr(data.hostId),
    status: data.status === 'finished' ? 'finished' : 'active',
  };
}

export async function addBuyIn(
  sessionId: string,
  input: { playerId: string; playerName: string; amount: number },
  options?: {
    isExistingParticipant?: boolean;
    hasEarlyCashOut?: boolean;
    participantCount?: number;
    isGroupSession?: boolean;
  }
): Promise<string> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Buy-in amounts must be positive numbers.');
  }
  if (!isAmountInRange(input.amount)) throw new Error(BUY_IN_TOO_LARGE_MESSAGE);
  if (!options?.isExistingParticipant && (options?.participantCount ?? 0) >= MAX_SESSION_PLAYERS) {
    throw new Error(SESSION_PLAYER_LIMIT_MESSAGE);
  }
  const db = getFirestoreDb();
  const buyInRef = doc(collection(db, 'sessions', sessionId, 'buy_ins'));
  const batch = writeBatch(db);
  batch.set(buyInRef, {
    playerId: input.playerId,
    playerName: input.playerName,
    amount: input.amount,
    createdAt: serverTimestamp(),
  });
  if (!options?.isExistingParticipant) {
    appendSessionParticipantWrites(batch, sessionId, input.playerId, input.playerName);
  }
  if (options?.hasEarlyCashOut !== false) {
    batch.delete(doc(db, 'sessions', sessionId, 'early_cashouts', input.playerId));
  }
  await batch.commit().catch((err: unknown) => {
    throw options?.isExistingParticipant
      ? err
      : participantAddError(err, input.playerName.trim() || input.playerId, options?.isGroupSession);
  });
  return buyInRef.id;
}

export async function updatePlayerBuyInTotal(
  sessionId: string,
  playerId: string,
  playerName: string,
  newTotal: number
): Promise<void> {
  const db = getFirestoreDb();
  const q = query(
    collection(db, 'sessions', sessionId, 'buy_ins'),
    where('playerId', '==', playerId)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.set(doc(collection(db, 'sessions', sessionId, 'buy_ins')), {
    playerId,
    playerName,
    amount: newTotal,
    createdAt: serverTimestamp(),
  });
  appendSessionParticipantWrites(batch, sessionId, playerId, playerName);
  await batch.commit();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = getFirestoreDb();
  const subcollections = ['buy_ins', 'early_cashouts', 'results', SESSION_PARTICIPANTS_SUBCOLLECTION];
  const refs = [];
  for (const sub of subcollections) {
    const snap = await getDocs(collection(db, 'sessions', sessionId, sub));
    refs.push(...snap.docs.map((d) => d.ref));
  }
  refs.push(doc(db, 'sessions', sessionId));
  for (let i = 0; i < refs.length; i += 500) {
    const batch = writeBatch(db);
    refs.slice(i, i + 500).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  invalidateSessionScanCache();
}

export async function removePlayerBuyIns(sessionId: string, playerId: string, hostId?: string): Promise<void> {
  const db = getFirestoreDb();
  const q = query(
    collection(db, 'sessions', sessionId, 'buy_ins'),
    where('playerId', '==', playerId)
  );
  const sessionRef = doc(db, 'sessions', sessionId);
  const [snap, resolvedHostId] = await Promise.all([
    getDocs(q),
    hostId ?? getDoc(sessionRef).then((s) => (s.exists() ? str(s.data().hostId) : '')),
  ]);
  const isHost = resolvedHostId === playerId;

  const extraWrites = isHost ? 1 : 3;
  const chunkSize = 500 - extraWrites;
  const docs = snap.docs;
  for (let i = 0; i === 0 || i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    docs.slice(i, i + chunkSize).forEach((d) => batch.delete(d.ref));
    if (i === 0) {
      if (!isHost) {
        batch.update(sessionRef, { participantIds: arrayRemove(playerId) });
        batch.delete(doc(db, 'sessions', sessionId, SESSION_PARTICIPANTS_SUBCOLLECTION, playerId));
      }
      batch.delete(doc(db, 'sessions', sessionId, 'early_cashouts', playerId));
    }
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
      const buyIns = mapDocsSafely(snapshot.docs, colRef.path, (d): BuyIn => {
        const data = d.data({ serverTimestamps: 'estimate' });
        return {
          id: d.id,
          sessionId,
          playerId: str(data.playerId),
          playerName: str(data.playerName),
          amount: numOrZero(data, 'amount', `sessions/${sessionId}/buy_ins/${d.id}`),
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

  return mapDocsSafely(snapshots.docs, colRef.path, (d): BuyIn => {
    const data = d.data();
    return {
      id: d.id,
      sessionId,
      playerId: str(data.playerId),
      playerName: str(data.playerName),
      amount: numOrZero(data, 'amount', `sessions/${sessionId}/buy_ins/${d.id}`),
      createdAt: toDate(data.createdAt),
    };
  });
}

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
      const cashOuts = mapDocsSafely(snapshot.docs, colRef.path, (d): EarlyCashOut => {
        const data = d.data();
        return {
          playerId: d.id,
          playerName: str(data.playerName),
          amount: numOrZero(data, 'amount', `sessions/${sessionId}/early_cashouts/${d.id}`),
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
  return mapDocsSafely(snapshots.docs, colRef.path, (d): EarlyCashOut => {
    const data = d.data();
    return {
      playerId: d.id,
      playerName: str(data.playerName),
      amount: numOrZero(data, 'amount', `sessions/${sessionId}/early_cashouts/${d.id}`),
      cashedOutAt: toDate(data.cashedOutAt),
    };
  });
}

export async function removeEarlyCashOut(sessionId: string, playerId: string): Promise<void> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId, 'early_cashouts', playerId);
  await deleteDoc(ref);
}

export async function removeEarlyCashOutIfExists(
  sessionId: string,
  playerId: string
): Promise<void> {
  const ref = doc(getFirestoreDb(), 'sessions', sessionId, 'early_cashouts', playerId);
  const snap = await getDoc(ref);
  if (snap.exists()) await deleteDoc(ref);
}

function toCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export async function settleSession(
  sessionId: string,
  results: SessionResult[]
): Promise<void> {
  const db = getFirestoreDb();
  const batch = writeBatch(db);
  const playerResults: Record<string, { playerName: string; totalBuyIn: number; cashOut: number; profit: number }> = {};
  for (const r of results) {
    const entry = {
      playerName: r.playerName,
      totalBuyIn: toCents(r.totalBuyIn),
      cashOut: toCents(r.cashOut),
      profit: toCents(r.profit),
    };
    playerResults[r.playerId] = entry;
    batch.set(doc(db, 'sessions', sessionId, 'results', r.playerId), { ...entry, settledAt: serverTimestamp() });
  }
  batch.update(doc(db, 'sessions', sessionId), {
    status: 'finished',
    finishedAt: serverTimestamp(),
    playerResults,
  });
  await batch.commit();
  invalidateSessionScanCache();
}

export async function getResults(sessionId: string): Promise<SessionResult[]> {
  const colRef = collection(getFirestoreDb(), 'sessions', sessionId, 'results');
  const snapshots = await getDocs(colRef);

  return mapDocsSafely(snapshots.docs, colRef.path, (d): SessionResult => {
    const data = d.data();
    const ctx = `sessions/${sessionId}/results/${d.id}`;
    return {
      playerId: d.id,
      playerName: str(data.playerName),
      totalBuyIn: numOrZero(data, 'totalBuyIn', ctx),
      cashOut: numOrZero(data, 'cashOut', ctx),
      profit: numOrZero(data, 'profit', ctx),
    };
  });
}

const GROUPS_COLLECTION = 'groups';
const GROUP_MEMBERSHIPS_SUB = 'group_memberships';

export async function syncGroupMembershipDocs(
  groupId: string,
  required?: { id: string; name: string }
): Promise<void> {
  const db = getFirestoreDb();
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) return;

  const g = groupSnap.data() as Record<string, unknown>;
  const name = str(g.name);
  const memberCount = finiteNum(g.memberCount) ?? 0;
  const ownerId = str(g.ownerId);
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

  const outcomes = await Promise.allSettled(
    idsList.map((pid) =>
      setDoc(
        doc(db, 'players', pid, GROUP_MEMBERSHIPS_SUB, groupId),
        { ...payloadBase, role: pid === ownerId ? 'owner' : 'member' },
        { merge: true }
      )
    )
  );
  const failedIds = failedMembershipIds(idsList, outcomes);
  if (failedIds.length > 0) {
    console.warn(`[Firestore] syncGroupMembershipDocs: ${failedIds.length} of ${idsList.length} memberships not updated for groups/${groupId}`);
  }
  const error = membershipSyncError(failedIds, ownerId, required);
  if (error) throw error;
}

function validGroupName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Group name is required.');
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    throw new Error(`Group names can be up to ${MAX_GROUP_NAME_LENGTH} characters.`);
  }
  return trimmed;
}

export async function createGroup(uid: string, name: string): Promise<string> {
  const db = getFirestoreDb();
  const trimmed = validGroupName(name);

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
  const trimmed = validGroupName(name);
  const db = getFirestoreDb();
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const snap = await getDoc(groupRef);
  if (!snap.exists()) throw new Error('Group not found');
  if (str(snap.data().ownerId) !== uid) {
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
  if (str(snap.data().ownerId) !== uid) {
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
      onNext(mapDocsSafely(snapshot.docs, colRef.path, mapGroupMembershipDoc));
    },
    onError
  );
}

function mapGroupMembershipDoc(d: QueryDocumentSnapshot): PokerGroup {
  const data = d.data();
  return {
    ...groupFromMembershipData(d.id, data),
    createdAt: toDate(data.groupCreatedAt ?? data.createdAt),
  };
}

export async function fetchGroupsList(uid: string): Promise<PokerGroup[]> {
  const colRef = collection(getFirestoreDb(), 'players', uid, GROUP_MEMBERSHIPS_SUB);
  const q = query(colRef, orderBy('groupCreatedAt', 'desc'));
  const snapshot = await getDocs(q);
  return mapDocsSafely(snapshot.docs, colRef.path, mapGroupMembershipDoc);
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
    if (str(gSnap.data().ownerId) !== ownerUid) {
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
  }).catch((err: unknown) => {
    if (member.isRegistered && member.id !== ownerUid && isPermissionDenied(err)) {
      throw new Error(`${member.name} isn't your friend, so they can't be added to this group.`, { cause: err });
    }
    throw err;
  });

  await syncGroupMembershipDocs(groupId, member.isRegistered ? { id: member.id, name: member.name } : undefined);
}

export async function removeGroupMember(
  ownerUid: string,
  groupId: string,
  memberId: string
): Promise<void> {
  const db = getFirestoreDb();
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const memberRef = doc(db, GROUPS_COLLECTION, groupId, 'members', memberId);

  await runTransaction(db, async (tx) => {
    const gSnap = await tx.get(groupRef);
    if (!gSnap.exists()) throw new Error('Group not found');
    if (str(gSnap.data().ownerId) !== ownerUid) {
      throw new Error('Only the group owner can remove members');
    }

    const existing = await tx.get(memberRef);
    if (!existing.exists()) return;
    tx.delete(memberRef);
    if (existing.data().isRegistered) {
      tx.delete(doc(db, 'players', memberId, GROUP_MEMBERSHIPS_SUB, groupId));
    }
    if (canDecrementMemberCount(gSnap.data().memberCount)) {
      tx.update(groupRef, { memberCount: increment(-1) });
    }
  });

  await syncGroupMembershipDocs(groupId);
}

export async function leaveGroup(uid: string, groupId: string): Promise<void> {
  const db = getFirestoreDb();
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const memberRef = doc(db, GROUPS_COLLECTION, groupId, 'members', uid);
  const membershipRef = doc(db, 'players', uid, GROUP_MEMBERSHIPS_SUB, groupId);

  await runTransaction(db, (tx) =>
    leaveGroupInTransaction(tx, { group: groupRef, member: memberRef, membership: membershipRef }, uid)
  );
}

export async function getGroupMembers(viewerUid: string, groupId: string): Promise<GroupMember[]> {
  const db = getFirestoreDb();
  const access = await getDoc(doc(db, 'players', viewerUid, GROUP_MEMBERSHIPS_SUB, groupId));
  if (!access.exists()) {
    throw new Error('Group not found or you are not a member.');
  }
  const colRef = collection(db, GROUPS_COLLECTION, groupId, 'members');
  const snap = await getDocs(colRef);
  return mapDocsSafely(snap.docs, colRef.path, mapGroupMemberDoc);
}

function mapGroupMemberDoc(d: QueryDocumentSnapshot): GroupMember {
  const data = d.data();
  return {
    id: d.id,
    name: str(data.name),
    isRegistered: Boolean(data.isRegistered),
    avatarEmoji: normalizeAvatarEmoji(data.avatarEmoji),
  };
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
      const members = mapDocsSafely(snapshot.docs, colRef.path, mapGroupMemberDoc);
      onNext(members.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError
  );
}

export type SessionHistoryEntry = SessionRecord & {
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
      const data = sessionDoc.data() as Record<string, unknown>;
      if (isOversizedSession(data)) return;
      const stored = storedPlayerResult(data, playerId);
      if (stored === null) return;
      const result = stored ?? (await getDoc(doc(db, 'sessions', sessionDoc.id, 'results', playerId))).data();
      if (!result) return;
      const resultCtx = `sessions/${sessionDoc.id}/results/${playerId}`;
      const entry = tryMap(`sessions/${sessionDoc.id}`, (): SessionHistoryEntry => ({
        id: sessionDoc.id,
        ...sessionSummaryFromDocData(data),
        status: 'finished',
        date: toDate(data.date ?? data.createdAt),
        finishedAt: data.finishedAt ? toDate(data.finishedAt) : undefined,
        totalBuyIn: numOrZero(result, 'totalBuyIn', resultCtx),
        cashOut: numOrZero(result, 'cashOut', resultCtx),
        profit: numOrZero(result, 'profit', resultCtx),
      }));
      if (entry) records.push(entry);
    })
  );

  return records;
}

export const HISTORY_TAB_PAGE_SIZE = 50;

type SessionHistoryPageResult = {
  entries: SessionHistoryEntry[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
};

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
          where('participantIds', 'array-contains', playerId),
          where('status', '==', 'finished'),
          orderBy('date', 'desc'),
          orderBy(documentId(), 'desc'),
          startAfter(cursor),
          limit(pageSize)
        )
      : query(
          collection(db, 'sessions'),
          where('participantIds', 'array-contains', playerId),
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

const FINISHED_SESSIONS_QUERY_PAGE_SIZE = 500;

async function getFullSessionHistoryForPlayer(playerId: string): Promise<SessionHistoryEntry[]> {
  const db = getFirestoreDb();
  const allDocs: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;

  while (true) {
    const snap = await getDocs(
      cursor
        ? query(
            collection(db, 'sessions'),
            where('participantIds', 'array-contains', playerId),
            where('status', '==', 'finished'),
            orderBy('date', 'desc'),
            orderBy(documentId(), 'desc'),
            startAfter(cursor),
            limit(FINISHED_SESSIONS_QUERY_PAGE_SIZE)
          )
        : query(
            collection(db, 'sessions'),
            where('participantIds', 'array-contains', playerId),
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
  profitPerHour: number | null;
};

export function getCachedSessionHistory(uid: string, forceRefresh = false): Promise<SessionHistoryEntry[]> {
  return cachedScan(`history:${uid}`, forceRefresh, () => getFullSessionHistoryForPlayer(uid));
}

export function getPlayerAppStatistics(uid: string, forceRefresh = false): Promise<PlayerAppStatistics> {
  return cachedScan(`stats:${uid}`, forceRefresh, () => computePlayerAppStatistics(uid, forceRefresh));
}

async function computePlayerAppStatistics(uid: string, forceRefresh: boolean): Promise<PlayerAppStatistics> {
  const db = getFirestoreDb();
  const [history, friendsSnap, groupsSnap, savedLocs] = await Promise.all([
    getCachedSessionHistory(uid, forceRefresh),
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
