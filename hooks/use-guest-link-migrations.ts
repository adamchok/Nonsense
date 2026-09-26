import { useAuth } from '@/lib/auth-context';
import { migrateGuestLink, subscribeOutgoingGuestLinks } from '@/lib/guest-links';
import { useEffect, useRef } from 'react';

export function useGuestLinkMigrations() {
  const { user, isAnonymous } = useAuth();
  const inFlightRef = useRef(new Set<string>());
  const uid = user && !isAnonymous ? user.uid : null;

  useEffect(() => {
    if (!uid) return;
    const inFlight = inFlightRef.current;
    return subscribeOutgoingGuestLinks(
      uid,
      (links) => {
        for (const link of links) {
          if (link.status !== 'accepted' || inFlight.has(link.id)) continue;
          inFlight.add(link.id);
          migrateGuestLink(link).catch((e) => {
            console.error('Guest link migration failed:', e);
            inFlight.delete(link.id);
          });
        }
      },
      (e) => console.error('Outgoing guest links error:', e)
    );
  }, [uid]);
}
