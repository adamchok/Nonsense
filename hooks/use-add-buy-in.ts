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
import { userMessage } from '@/lib/user-message';

export type BuyInDraft = {
  playerName: string;
  amount: string;
  pickedPlayerId: string | null;
  isBuyBack?: boolean;
};

export type QueuedBuyIn = {
  playerName: string;
  amount: number;
  buyInId: Promise<string | null>;
};

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

export async function deleteBuyInEntry(sessionId: string, buyInId: string): Promise<void> {
  await deleteDoc(doc(getFirestoreDb(), 'sessions', sessionId, 'buy_ins', buyInId));
}

export function useAddBuyIn(
  id: string | undefined,
  live: LiveSession,
  playerProfile: PlayerProfile | null,
  onQueued: (queued: QueuedBuyIn, draft: BuyInDraft) => void
) {
  const [pendingBuyIns, setPendingBuyIns] = useState(0);

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
            userMessage(e, 'unknown error')
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
    const parsed = parseAmount(draft.amount);
    if (!id || !name || parsed == null || parsed <= 0) return false;

    const resolvedId = resolvePlayerId(draft, playerProfile);
    if (live.earlyCashOutMap.has(resolvedId) && !draft.isBuyBack) {
      appAlert(`${name} already cashed out`, 'Tap their row and choose Buy Back In to add chips for them.');
      return false;
    }
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
