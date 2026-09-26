import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from 'firebase/firestore';

export type GuestLinkStatus = 'pending' | 'accepted';

export interface GuestLink {
  id: string;
  ownerId: string;
  ownerName: string;
  guestId: string;
  guestName: string;
  targetId: string;
  targetName: string;
  status: GuestLinkStatus;
  sessionCount: number;
  net: number;
  sessions: Record<string, number>;
}

export interface GuestLinkRequest {
  ownerId: string;
  ownerName: string;
  guestId: string;
  guestName: string;
  targetId: string;
  targetName: string;
}

const GUEST_LINKS = 'guest_links';
const RESULT_FIELDS = ['totalBuyIn', 'cashOut', 'profit', 'settledAt'];
const EARLY_CASHOUT_FIELDS = ['amount', 'cashedOutAt'];
export const MAX_GUEST_LINK_SESSIONS = 300;

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseLinkSessions(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])
    )
  );
}

function sumSessions(sessions: Record<string, number>): number {
  return roundCents(Object.values(sessions).reduce((sum, p) => sum + p, 0));
}

export function guestLinkId(ownerId: string, guestId: string): string {
  return `${ownerId}_${guestId}`;
}

function mapGuestLink(d: DocumentSnapshot<DocumentData>): GuestLink {
  return parseGuestLink(d.id, d.data() ?? {});
}

export function parseGuestLink(id: string, data: DocumentData): GuestLink {
  const sessions = parseLinkSessions(data.sessions);
  return {
    id,
    ownerId: String(data.ownerId ?? ''),
    ownerName: String(data.ownerName ?? ''),
    guestId: String(data.guestId ?? ''),
    guestName: String(data.guestName ?? ''),
    targetId: String(data.targetId ?? ''),
    targetName: String(data.targetName ?? ''),
    status: data.status === 'accepted' ? 'accepted' : 'pending',
    sessionCount: Object.keys(sessions).length,
    net: sumSessions(sessions),
    sessions,
  };
}

async function hostedGuestSessions(db: Firestore, ownerId: string, guestId: string): Promise<QueryDocumentSnapshot[]> {
  const snap = await getDocs(
    query(collection(db, 'sessions'), where('participantIds', 'array-contains', guestId), where('hostId', '==', ownerId))
  );
  return snap.docs.filter((d) => d.data().status === 'finished');
}

async function collectGuestSessions(
  db: Firestore,
  ownerId: string,
  guestId: string,
  targetId?: string
): Promise<Record<string, number>> {
  const hosted = await hostedGuestSessions(db, ownerId, guestId);
  const sessions = targetId ? hosted.filter((s) => !(s.data().participantIds ?? []).includes(targetId)) : hosted;
  const entries = await Promise.all(
    sessions.map(async (s): Promise<[string, number]> => {
      const r = await getDoc(doc(db, 'sessions', s.id, 'results', guestId));
      const profit = r.exists() ? r.data().profit : 0;
      return [s.id, typeof profit === 'number' && Number.isFinite(profit) ? profit : 0];
    })
  );
  return Object.fromEntries(entries);
}

export async function summarizeGuestIn(
  db: Firestore,
  ownerId: string,
  guestId: string,
  targetId?: string
): Promise<{ sessionCount: number; net: number }> {
  const sessions = await collectGuestSessions(db, ownerId, guestId, targetId);
  return { sessionCount: Object.keys(sessions).length, net: sumSessions(sessions) };
}

export async function requestGuestLinkIn(db: Firestore, input: GuestLinkRequest): Promise<void> {
  const { ownerId, guestId, targetId } = input;
  if (!ownerId || !guestId || !targetId) throw new Error('Missing guest link details.');
  if (targetId === ownerId) throw new Error('You cannot link a guest to yourself.');
  if (targetId === guestId) throw new Error('Pick a different account for this guest.');
  const sessions = await collectGuestSessions(db, ownerId, guestId, targetId);
  if (Object.keys(sessions).length > MAX_GUEST_LINK_SESSIONS) {
    throw new Error(`This guest has more than ${MAX_GUEST_LINK_SESSIONS} sessions and cannot be linked in the app.`);
  }
  await setDoc(doc(db, GUEST_LINKS, guestLinkId(ownerId, guestId)), {
    ownerId,
    ownerName: input.ownerName.trim().slice(0, 64),
    guestId,
    guestName: input.guestName.trim().slice(0, 64),
    targetId,
    targetName: input.targetName.trim().slice(0, 64),
    status: 'pending',
    sessionCount: Object.keys(sessions).length,
    net: sumSessions(sessions),
    sessions,
    createdAt: serverTimestamp(),
  });
}

export async function cancelGuestLinkIn(db: Firestore, ownerId: string, guestId: string): Promise<void> {
  await deleteDoc(doc(db, GUEST_LINKS, guestLinkId(ownerId, guestId)));
}

export function subscribeGuestLinksIn(
  db: Firestore,
  field: 'ownerId' | 'targetId',
  uid: string,
  onChange: (links: GuestLink[]) => void,
  onError?: (e: unknown) => void
): () => void {
  return onSnapshot(
    query(collection(db, GUEST_LINKS), where(field, '==', uid)),
    (snap) => {
      const links = snap.docs.map(mapGuestLink);
      const visible = field === 'targetId' ? links.filter((l) => l.status === 'pending') : links;
      onChange(visible.sort((a, b) => a.guestName.localeCompare(b.guestName)));
    },
    (err) => onError?.(err)
  );
}

export async function acceptGuestLinkIn(db: Firestore, link: GuestLink): Promise<void> {
  await updateDoc(doc(db, GUEST_LINKS, link.id), { status: 'accepted', acceptedAt: serverTimestamp() });
}

export async function declineGuestLinkIn(db: Firestore, link: GuestLink): Promise<void> {
  await deleteDoc(doc(db, GUEST_LINKS, link.id));
}

function pickFields(data: DocumentData, keys: string[]): DocumentData {
  return Object.fromEntries(keys.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
}

async function stageCopy(
  batch: WriteBatch,
  db: Firestore,
  sessionId: string,
  sub: 'results' | 'early_cashouts',
  link: GuestLink
): Promise<boolean> {
  const fromRef = doc(db, 'sessions', sessionId, sub, link.guestId);
  const toRef = doc(db, 'sessions', sessionId, sub, link.targetId);
  const [from, to] = await Promise.all([getDoc(fromRef), getDoc(toRef)]);
  if (!from.exists()) return false;
  if (!to.exists()) {
    const fields = sub === 'results' ? RESULT_FIELDS : EARLY_CASHOUT_FIELDS;
    batch.set(toRef, {
      ...pickFields(from.data(), fields),
      playerName: link.targetName,
      migratedFrom: link.guestId,
    });
  }
  batch.delete(fromRef);
  return true;
}

async function stageParticipant(batch: WriteBatch, db: Firestore, sessionId: string, link: GuestLink): Promise<void> {
  const fromRef = doc(db, 'sessions', sessionId, 'session_participants', link.guestId);
  const toRef = doc(db, 'sessions', sessionId, 'session_participants', link.targetId);
  const [from, to] = await Promise.all([getDoc(fromRef), getDoc(toRef)]);
  if (!from.exists()) return;
  if (!to.exists()) {
    batch.set(toRef, { ...from.data(), playerId: link.targetId, playerName: link.targetName });
  }
  batch.delete(fromRef);
}

async function migrateSession(db: Firestore, session: QueryDocumentSnapshot, link: GuestLink): Promise<boolean> {
  const ids: string[] = Array.isArray(session.data().participantIds) ? session.data().participantIds : [];
  if (ids.includes(link.targetId) || !ids.includes(link.guestId)) return false;

  const batch = writeBatch(db);
  await stageCopy(batch, db, session.id, 'results', link);
  await stageCopy(batch, db, session.id, 'early_cashouts', link);
  const buyIns = await getDocs(
    query(collection(db, 'sessions', session.id, 'buy_ins'), where('playerId', '==', link.guestId))
  );
  for (const b of buyIns.docs) {
    batch.update(b.ref, { playerId: link.targetId, playerName: link.targetName });
  }
  await stageParticipant(batch, db, session.id, link);
  batch.update(session.ref, { participantIds: ids.map((id) => (id === link.guestId ? link.targetId : id)) });
  await batch.commit();
  return true;
}

async function migrateGroup(
  db: Firestore,
  group: QueryDocumentSnapshot,
  link: GuestLink,
  avatarEmoji: string | null
): Promise<boolean> {
  const guestRef = doc(db, 'groups', group.id, 'members', link.guestId);
  const targetRef = doc(db, 'groups', group.id, 'members', link.targetId);
  const [guest, target] = await Promise.all([getDoc(guestRef), getDoc(targetRef)]);
  if (!guest.exists()) return false;

  const g = group.data();
  const alreadyMember = target.exists();
  const batch = writeBatch(db);
  if (alreadyMember) {
    batch.update(group.ref, { memberCount: increment(-1) });
  } else {
    batch.set(targetRef, { name: link.targetName, isRegistered: true, avatarEmoji });
  }
  batch.delete(guestRef);
  const groupCreatedAt = g.createdAt ?? g.groupCreatedAt;
  batch.set(
    doc(db, 'players', link.targetId, 'group_memberships', group.id),
    {
      name: String(g.name ?? ''),
      memberCount: Math.max(0, Number(g.memberCount ?? 0) - (alreadyMember ? 1 : 0)),
      ownerId: link.ownerId,
      role: 'member',
      ...(groupCreatedAt !== undefined && groupCreatedAt !== null ? { groupCreatedAt } : {}),
    },
    { merge: true }
  );
  await batch.commit();
  return true;
}

export async function migrateGuestLinkIn(
  db: Firestore,
  link: GuestLink
): Promise<{ sessions: number; groups: number; touchedGroupIds: string[] }> {
  const linkId = guestLinkId(link.ownerId, link.guestId);
  const found = await getDocs(
    query(collection(db, GUEST_LINKS), where('ownerId', '==', link.ownerId), where('guestId', '==', link.guestId))
  );
  const linkSnap = found.docs.find((d) => d.id === linkId);
  if (!linkSnap) return { sessions: 0, groups: 0, touchedGroupIds: [] };
  const current = mapGuestLink(linkSnap);
  if (current.status !== 'accepted') throw new Error('This guest link has not been accepted yet.');

  let sessions = 0;
  for (const s of await hostedGuestSessions(db, current.ownerId, current.guestId)) {
    if (!Object.prototype.hasOwnProperty.call(current.sessions, s.id)) continue;
    if (await migrateSession(db, s, current)) sessions += 1;
  }

  const profile = await getDoc(doc(db, 'players', current.targetId));
  const rawAvatar = profile.exists() ? profile.data().avatarEmoji : null;
  const avatarEmoji = typeof rawAvatar === 'string' && rawAvatar ? rawAvatar : null;
  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('ownerId', '==', current.ownerId)));
  const touchedGroupIds: string[] = [];
  for (const g of groupsSnap.docs) {
    if (await migrateGroup(db, g, current, avatarEmoji)) touchedGroupIds.push(g.id);
  }

  await deleteDoc(linkSnap.ref);
  return { sessions, groups: touchedGroupIds.length, touchedGroupIds };
}
