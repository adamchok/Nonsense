import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

export type GuestLinkStatus = 'pending' | 'accepted' | 'failed';

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

function parseStatus(raw: unknown): GuestLinkStatus {
  return raw === 'accepted' || raw === 'failed' ? raw : 'pending';
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
    status: parseStatus(data.status),
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
      onChange(links.sort((a, b) => a.guestName.localeCompare(b.guestName)));
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
