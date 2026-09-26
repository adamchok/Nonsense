import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard } from 'react-native';

import { announce, hapticSuccess } from '@/components/session/feedback';
import type { CashOutTarget } from '@/components/session/early-cash-out-modal';
import type { EditBuyInTarget } from '@/components/session/edit-buy-in-modal';
import { appAlert } from '@/lib/app-alert';
import {
  deleteSession,
  removePlayerBuyIns,
  saveEarlyCashOut,
  updatePlayerBuyInTotal,
  updateSessionBlinds,
  updateSessionDollarsPerChip,
  updateSessionLocation,
} from '@/lib/firestore';
import { parseAmount } from '@/lib/parse-amount';
import { isValidBlinds, sessionBlindsAreSet, type SessionView } from '@/lib/session-view';
import { userMessage } from '@/lib/user-message';

type Options = {
  id: string | undefined;
  session: SessionView | null;
  viewerIsHost: boolean;
  pendingBuyIns: number;
  /** Closes whichever modal is open. */
  closeModal: () => void;
  /** Opens the blinds editor (End Session needs blinds). */
  openBlindsEditor: () => void;
};


/**
 * Host-only writes for the live session screen. Each guards host status and alerts on save
 * failures; the modals show invalid input inline before calling these, so bad input just returns.
 */
export function useSessionActions({
  id,
  session,
  viewerIsHost,
  pendingBuyIns,
  closeModal,
  openBlindsEditor,
}: Options) {
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  function requireHost(action: string): boolean {
    if (viewerIsHost) return true;
    appAlert('Host only', `Only the host can ${action}.`);
    return false;
  }

  function confirmRemovePlayer(playerId: string, name: string) {
    if (!requireHost('remove players') || !id) return;
    appAlert(`Remove ${name}?`, 'All buy-ins for this player will be deleted from the session.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setRemovingPlayerId(playerId);
            await removePlayerBuyIns(id, playerId);
          } catch (e) {
            appAlert('Error', userMessage(e, 'Could not remove player.'));
          } finally {
            setRemovingPlayerId(null);
          }
        },
      },
    ]);
  }

  async function saveCashOut(target: CashOutTarget, amount: string) {
    if (!requireHost('cash out players') || !id) return;
    const parsed = parseAmount(amount);
    if (parsed == null || parsed < 0) return;
    try {
      await saveEarlyCashOut(id, {
        playerId: target.playerId,
        playerName: target.playerName,
        amount: parsed,
      });
      hapticSuccess();
      announce(`${target.playerName} cashed out`);
      Keyboard.dismiss();
      closeModal();
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to save cash-out.'));
    }
  }

  function endSession() {
    if (!requireHost('end this session') || !id) return;
    if (!sessionBlindsAreSet(session)) {
      appAlert('Blinds required', 'Set small and big blind before ending this session.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Set blinds', onPress: openBlindsEditor },
      ]);
      return;
    }
    // Cash-out settles from the ledger; wait until every buy-in has reached the server.
    if (pendingBuyIns > 0) {
      appAlert(
        'Buy-ins still saving',
        'Some buy-ins have not reached the server yet. Check your connection and try again in a moment.'
      );
      return;
    }
    // No confirm: the cash-out screen is reversible (Back returns here) and settles nothing yet.
    router.push(`./cashout/${id}`);
  }

  function confirmDeleteSession() {
    if (!viewerIsHost || !id) return;
    appAlert(
      'Delete Session?',
      'This will permanently delete the session and all buy-in data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeletingSession(true);
              await deleteSession(id);
              router.replace('/(tabs)');
            } catch (e) {
              setIsDeletingSession(false);
              appAlert('Error', userMessage(e, 'Failed to delete session.'));
            }
          },
        },
      ]
    );
  }

  async function saveLocation(location: string) {
    if (!requireHost('edit location') || !id) return;
    try {
      await updateSessionLocation(id, location);
      Keyboard.dismiss();
      closeModal();
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to update location.'));
    }
  }

  async function saveChipValue(value: string) {
    if (!requireHost('edit dollars per chip') || !id) return;
    const dpc = parseAmount(value);
    if (dpc == null || dpc <= 0) return;
    try {
      await updateSessionDollarsPerChip(id, dpc);
      Keyboard.dismiss();
      closeModal();
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to update dollars per chip.'));
    }
  }

  async function saveBlinds(smallBlind: string, bigBlind: string) {
    if (!requireHost('edit blinds') || !id) return;
    const sb = parseAmount(smallBlind);
    const bb = parseAmount(bigBlind);
    if (sb == null || bb == null || !isValidBlinds(sb, bb)) return;
    try {
      await updateSessionBlinds(id, { smallBlind: sb, bigBlind: bb });
      Keyboard.dismiss();
      closeModal();
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to update blinds.'));
    }
  }

  async function saveEditBuyIn(target: EditBuyInTarget, amount: string) {
    if (!viewerIsHost || !id) return;
    const parsed = parseAmount(amount);
    if (parsed == null || parsed <= 0) return;
    try {
      await updatePlayerBuyInTotal(id, target.playerId, target.playerName, parsed);
      Keyboard.dismiss();
      closeModal();
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to update buy-in.'));
    }
  }

  return {
    removingPlayerId,
    isDeletingSession,
    requireHost,
    confirmRemovePlayer,
    saveCashOut,
    endSession,
    confirmDeleteSession,
    saveLocation,
    saveChipValue,
    saveBlinds,
    saveEditBuyIn,
  };
}
