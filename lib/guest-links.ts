import { getFirestoreDb } from '@/lib/firebase';
import { invalidateSessionScanCache, syncGroupMembershipDocs } from '@/lib/firestore';
import {
  acceptGuestLinkIn,
  cancelGuestLinkIn,
  declineGuestLinkIn,
  guestLinkId,
  migrateGuestLinkIn,
  requestGuestLinkIn,
  subscribeGuestLinksIn,
  summarizeGuestIn,
  type GuestLink,
  type GuestLinkStatus,
} from '@/lib/guest-link-store';

export { guestLinkId };
export type { GuestLink, GuestLinkStatus };

export async function summarizeGuest(ownerId: string, guestId: string): Promise<{ sessionCount: number; net: number }> {
  return summarizeGuestIn(getFirestoreDb(), ownerId, guestId);
}

export async function requestGuestLink(input: {
  ownerId: string;
  ownerName: string;
  guestId: string;
  guestName: string;
  targetId: string;
  targetName: string;
}): Promise<void> {
  await requestGuestLinkIn(getFirestoreDb(), input);
}

export async function cancelGuestLink(ownerId: string, guestId: string): Promise<void> {
  await cancelGuestLinkIn(getFirestoreDb(), ownerId, guestId);
}

export function subscribeOutgoingGuestLinks(
  ownerId: string,
  onChange: (links: GuestLink[]) => void,
  onError?: (e: unknown) => void
): () => void {
  return subscribeGuestLinksIn(getFirestoreDb(), 'ownerId', ownerId, onChange, onError);
}

export function subscribeIncomingGuestLinks(
  targetId: string,
  onChange: (links: GuestLink[]) => void,
  onError?: (e: unknown) => void
): () => void {
  return subscribeGuestLinksIn(getFirestoreDb(), 'targetId', targetId, onChange, onError);
}

export async function acceptGuestLink(link: GuestLink): Promise<void> {
  await acceptGuestLinkIn(getFirestoreDb(), link);
}

export async function declineGuestLink(link: GuestLink): Promise<void> {
  await declineGuestLinkIn(getFirestoreDb(), link);
}

export async function migrateGuestLink(link: GuestLink): Promise<{ sessions: number; groups: number }> {
  const { sessions, groups, touchedGroupIds } = await migrateGuestLinkIn(getFirestoreDb(), link);
  const synced = await Promise.allSettled(touchedGroupIds.map((id) => syncGroupMembershipDocs(id)));
  synced.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[guest-links] could not refresh membership mirrors for group ${touchedGroupIds[i]}`, r.reason);
    }
  });
  invalidateSessionScanCache();
  return { sessions, groups };
}
