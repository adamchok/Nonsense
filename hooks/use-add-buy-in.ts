import { deleteDoc, doc } from 'firebase/firestore';
import { useState } from 'react';
import { Keyboard } from 'react-native';

import { announce, hapticSuccess } from '@/components/session/feedback';
import type { LiveSession } from '@/hooks/use-live-session';
import { appAlert } from '@/lib/app-alert';
import { getFirestoreDb } from '@/lib/firebase';
import { addBuyIn } from '@/lib/firestore';
import { parseAmount } from '@/lib/parse-amount';
import type { PlayerProfile } from '@/types';

export type BuyInDraft = {
  playerName: string;
  amount: string;
  /** Set when the host picked a seated player or friend chip rather than typing a name. */
  pickedPlayerId: string | null;
  /** Buying a cashed-out player back in: this buy-in clears their early cash-out in the same batch. */
  isBuyBack?: boolean;
};

/** A queued buy-in that can still be undone. `buyInId` resolves once the batch commits. */
export type QueuedBuyIn = {
  playerName: string;
  amount: number;
  buyInId: Promise<string | null>;
};

/** First unused `name_2` / `name_3` … id, so two guests typed with the same name stay separate. */
function firstFreeGuestId(base: string, playerTotals: LiveSession['playerTotals']): string {
  let n = 2;
  while (playerTotals[`${base}_${n}`]) n += 1;
  return `${base}_${n}`;
}

function resolvePlayerId(draft: BuyInDraft, playerProfile: PlayerProfile | null): string {
  const trimmed = draft.playerName.trim();
  if (draft.pickedPlayerId) return draft.pickedPlayerId;
  if (playerProfile && trimmed.toLowerCase() === playerProfile.name.toLowerCase()) {
    return playerProfile.id;
  }
  return trimmed.toLowerCase().replace(/\s+/g, '_');
}

/** Removes one buy-in entry (the undo for an add). The host-delete rule already allows it. */
export async function deleteBuyInEntry(sessionId: string, buyInId: string): Promise<void> {
  await deleteDoc(doc(getFirestoreDb(), 'sessions', sessionId, 'buy_ins', buyInId));
}

/**
 * Validates and queues a buy-in. `handleAddBuyIn` resolves true once the write is queued
 * (the form may close) and false when nothing was written (the form keeps its entry).
 */
export function useAddBuyIn(
  id: string | undefined,
  live: LiveSession,
  playerProfile: PlayerProfile | null,
  onQueued: (queued: QueuedBuyIn, draft: BuyInDraft) => void
) {
  /** Buy-in batches written locally but not yet acked by the server. */
  const [pendingBuyIns, setPendingBuyIns] = useState(0);

  /**
   * Fire-and-forget: the buy-in lands in the ledger from the local snapshot immediately, so
   * the form doesn't wait on the server ack (slow on poor mobile networks).
   */
  function commitBuyIn(draft: BuyInDraft, playerId: string, name: string, parsedAmount: number) {
    if (!id) return;
    setPendingBuyIns((n) => n + 1);
    const buyInId = addBuyIn(
      id,
      { playerId, playerName: name, amount: parsedAmount },
      {
        isExistingParticipant: Boolean(live.session?.participantIds.includes(playerId)),
        hasEarlyCashOut: live.earlyCashOutMap.has(playerId),
      }
    )
      .catch((e): null => {
        appAlert(
          'Buy-in not saved',
          `${name}'s buy-in of ${parsedAmount} failed: ${
            e instanceof Error ? e.message : 'unknown error'
          }. Add it again.`
        );
        return null;
      })
      .finally(() => setPendingBuyIns((n) => n - 1));
    hapticSuccess();
    announce(`Added ${parsedAmount} for ${name}`);
    onQueued({ playerName: name, amount: parsedAmount, buyInId }, draft);
  }

  async function handleAddBuyIn(draft: BuyInDraft): Promise<boolean> {
    Keyboard.dismiss();
    if (!live.viewerIsHost) {
      appAlert('Host only', 'Only the host can add buy-ins.');
      return false;
    }
    const name = draft.playerName.trim();
    if (!id || !name || !draft.amount.trim()) return false;
    const parsed = parseAmount(draft.amount);
    if (parsed == null || parsed <= 0) {
      appAlert('Invalid amount', 'Enter a positive number, like 50 or 12.5.');
      return false;
    }

    const resolvedId = resolvePlayerId(draft, playerProfile);
    if (live.earlyCashOutMap.has(resolvedId) && !draft.isBuyBack) {
      appAlert(`${name} already cashed out`, 'Tap their row and choose Buy Back In to add chips for them.');
      return false;
    }
    // A typed (non-picked) name colliding with an existing ledger entry is ambiguous:
    // a re-buy for that person, or a second guest with the same name. Ask, and keep the
    // form open until the host picks (Cancel leaves the entry in place).
    const typedNameCollision =
      !draft.pickedPlayerId &&
      Boolean(live.playerTotals[resolvedId]) &&
      !(playerProfile && resolvedId === playerProfile.id);
    if (typedNameCollision) {
      return new Promise<boolean>((resolve) => {
        appAlert(
          `${name} is already in this session`,
          'Add this buy-in to the existing player, or add a new player with the same name?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Same player',
              onPress: () => {
                commitBuyIn(draft, resolvedId, name, parsed);
                resolve(true);
              },
            },
            {
              text: 'New player',
              onPress: () => {
                commitBuyIn(draft, firstFreeGuestId(resolvedId, live.playerTotals), name, parsed);
                resolve(true);
              },
            },
          ]
        );
      });
    }

    commitBuyIn(draft, resolvedId, name, parsed);
    return true;
  }

  return { handleAddBuyIn, pendingBuyIns };
}
