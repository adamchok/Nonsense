import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { getFirestoreDb } from '@/lib/firebase';
import { subscribeBuyIns, subscribeEarlyCashOuts, subscribeFriends } from '@/lib/firestore';
import { sessionBlindsAreSet, sessionViewFromData, type LedgerPlayer, type SessionView } from '@/lib/session-view';
import type { BuyIn, EarlyCashOut, FriendRecord, PlayerProfile } from '@/types';

export type LiveSession = {
  session: SessionView | null;
  buyIns: BuyIn[];
  earlyCashOuts: EarlyCashOut[];
  friends: FriendRecord[];
  error: string | null;
  isLoading: boolean;
  retry: () => void;
  earlyCashOutMap: Map<string, EarlyCashOut>;
  friendAvatarMap: Map<string, string | undefined>;
  playerTotals: Record<string, { name: string; total: number }>;
  players: LedgerPlayer[];
  totalPot: number;
  viewerIsHost: boolean;
  isActive: boolean;
  ledgerCanToggleDollars: boolean;
  showSessionMetaCards: boolean;
};

export function useLiveSession(id: string | undefined, playerProfile: PlayerProfile | null): LiveSession {
  const [session, setSession] = useState<SessionView | null>(null);
  const [buyIns, setBuyIns] = useState<BuyIn[]>([]);
  const [earlyCashOuts, setEarlyCashOuts] = useState<EarlyCashOut[]>([]);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    const ref = doc(getFirestoreDb(), 'sessions', id);
    return onSnapshot(
      ref,
      (snapshot) => {
        if (!snapshot.exists()) {
          setError('Session not found.');
          setSession(null);
          return;
        }
        setSession(sessionViewFromData(snapshot.data() as Record<string, unknown>));
        setError(null);
      },
      (e) => setError(e.message)
    );
  }, [id, attempt]);

  useEffect(() => {
    if (!id) return;
    return subscribeBuyIns(id, setBuyIns, (e) => setError(e.message));
  }, [id, attempt]);

  useEffect(() => {
    if (!id) return;
    return subscribeEarlyCashOuts(id, setEarlyCashOuts, (e) => setError(e.message));
  }, [id, attempt]);

  useEffect(() => {
    if (!playerProfile) return;
    return subscribeFriends(playerProfile.id, setFriends, () => {});
  }, [playerProfile]);

  const earlyCashOutMap = useMemo(
    () => new Map(earlyCashOuts.map((ec) => [ec.playerId, ec])),
    [earlyCashOuts]
  );
  const friendAvatarMap = useMemo(
    () => new Map(friends.map((f) => [f.playerId, f.avatarEmoji])),
    [friends]
  );

  const playerTotals = useMemo(
    () =>
      buyIns.reduce<Record<string, { name: string; total: number }>>((acc, b) => {
        if (!acc[b.playerId]) acc[b.playerId] = { name: b.playerName, total: 0 };
        acc[b.playerId].total += b.amount;
        return acc;
      }, {}),
    [buyIns]
  );
  const hostId = session?.hostId;
  const players = useMemo(
    () =>
      Object.entries(playerTotals)
        .map(([playerId, v]) => ({ playerId, ...v }))
        .sort((a, b) => {
          if (hostId) {
            if (a.playerId === hostId) return -1;
            if (b.playerId === hostId) return 1;
          }
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        }),
    [playerTotals, hostId]
  );
  const totalPot = useMemo(() => players.reduce((sum, p) => sum + p.total, 0), [players]);

  const viewerIsHost = Boolean(playerProfile && hostId && playerProfile.id === hostId);
  const dpc = session?.dollarsPerChip;
  const ledgerCanToggleDollars =
    session?.amountUnit === 'chips' && dpc != null && Number.isFinite(dpc) && dpc > 0;
  const showSessionMetaCards = Boolean(
    viewerIsHost ||
      sessionBlindsAreSet(session) ||
      Boolean(session?.location?.trim()) ||
      session?.amountUnit === 'chips'
  );

  return {
    session,
    buyIns,
    earlyCashOuts,
    friends,
    error,
    isLoading: session === null && error === null,
    retry: () => {
      setError(null);
      setAttempt((n) => n + 1);
    },
    earlyCashOutMap,
    friendAvatarMap,
    playerTotals,
    players,
    totalPot,
    viewerIsHost,
    isActive: session?.status === 'active',
    ledgerCanToggleDollars,
    showSessionMetaCards,
  };
}
