import { BlindsEditorModal } from '@/components/session/blinds-editor-modal';
import { BuyInModal } from '@/components/session/buy-in-modal';
import { CashedOutDetailModal } from '@/components/session/cashed-out-detail-modal';
import { ChipValueEditorModal } from '@/components/session/chip-value-editor-modal';
import { EarlyCashOutModal, type CashOutTarget } from '@/components/session/early-cash-out-modal';
import { EditBuyInModal, type EditBuyInTarget } from '@/components/session/edit-buy-in-modal';
import { LedgerHeader } from '@/components/session/ledger-header';
import { LocationEditorModal } from '@/components/session/location-editor-modal';
import { PlayerTotalsList } from '@/components/session/player-totals-list';
import { PotBadge } from '@/components/session/pot-badge';
import { SessionFooterActions } from '@/components/session/session-footer-actions';
import { SessionHeader } from '@/components/session/session-header';
import { SessionMetaCards } from '@/components/session/session-meta-cards';
import { hapticTap } from '@/components/session/feedback';
import { UndoSnackbar } from '@/components/session/undo-snackbar';
import { VoiceBanner, VoiceMicButton } from '@/components/session/voice-panel';
import {
  deleteBuyInEntry,
  useAddBuyIn,
  type BuyInDraft,
  type QueuedBuyIn,
} from '@/hooks/use-add-buy-in';
import { useLiveSession } from '@/hooks/use-live-session';
import { useSessionActions } from '@/hooks/use-session-actions';
import { useVoiceSession } from '@/hooks/use-voice-session';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { appAlert } from '@/lib/app-alert';
import { getAvatarEmoji } from '@/lib/avatar';
import { formatSessionAmountValue } from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import type { LedgerPlayer } from '@/lib/session-view';
import type { VoiceRosterEntry } from '@/lib/voice-command';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { userMessage } from '@/lib/user-message';

/** Only one Modal is ever on screen, so a single discriminated state drives them all. */
type ActiveModal =
  | { kind: 'buyIn'; draft: BuyInDraft }
  | { kind: 'cashOut'; target: CashOutTarget; amount: string }
  | { kind: 'cashedOut'; playerId: string }
  | { kind: 'editBuyIn'; target: EditBuyInTarget }
  | { kind: 'location' }
  | { kind: 'blinds' }
  | { kind: 'chipValue' };

const EMPTY_BUY_IN: BuyInDraft = { playerName: '', amount: '', pickedPlayerId: null };

function numberDraft(value: number | undefined): string {
  return value != null && Number.isFinite(value) ? String(value) : '';
}

export default function ActiveSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useAppColors();
  const { playerProfile } = useAuth();
  const live = useLiveSession(id, playerProfile);
  const { session, players, earlyCashOutMap, viewerIsHost } = live;
  const unit = session?.amountUnit ?? 'cash';
  const canAct = viewerIsHost && live.isActive;

  const [modal, setModal] = useState<ActiveModal | null>(null);
  /** Bumped on every open so each modal remounts with fresh drafts. */
  const [modalSeq, setModalSeq] = useState(0);
  /** Chip sessions with dollars per chip: the ledger switch toggles chip vs dollar display for all rows. */
  const [ledgerShowDollars, setLedgerShowDollars] = useState(false);

  function openModal(next: ActiveModal) {
    setModalSeq((n) => n + 1);
    setModal(next);
  }
  function closeModal() {
    Keyboard.dismiss();
    setModal(null);
  }

  /** The last queued buy-in, undoable for UNDO_WINDOW_MS. Buy-backs aren't offered undo. */
  const [undoable, setUndoable] = useState<(QueuedBuyIn & { key: number }) | null>(null);
  const dismissUndo = useCallback(() => setUndoable(null), []);

  const { handleAddBuyIn, pendingBuyIns } = useAddBuyIn(id, live, playerProfile, (queued, draft) =>
    setUndoable(draft.isBuyBack ? null : { ...queued, key: Date.now() })
  );
  const actions = useSessionActions({
    id,
    session,
    viewerIsHost,
    pendingBuyIns,
    closeModal,
    openBlindsEditor: () => openModal({ kind: 'blinds' }),
  });

  /** Closes the form only when the buy-in was queued; a failed check keeps the entry. */
  async function submitBuyIn(draft: BuyInDraft): Promise<boolean> {
    const queued = await handleAddBuyIn(draft);
    if (queued) closeModal();
    return queued;
  }

  function undoBuyIn() {
    const target = undoable;
    setUndoable(null);
    if (!target || !id) return;
    hapticTap();
    // The id resolves once the add commits; null means the add itself failed (already reported).
    void target.buyInId.then((buyInId) => {
      if (!buyInId) return;
      return deleteBuyInEntry(id, buyInId).catch((e) =>
        appAlert('Undo failed', userMessage(e, 'Could not remove that buy-in.'))
      );
    });
  }

  /** Quick-amount chips in the buy-in form: each player's latest buy-in and the session's most common one. */
  const { lastAmountByPlayer, commonAmount } = useMemo(() => {
    const last = new Map<string, number>();
    const counts = new Map<number, number>();
    for (const b of live.buyIns) {
      last.set(b.playerId, b.amount);
      counts.set(b.amount, (counts.get(b.amount) ?? 0) + 1);
    }
    let common: number | null = null;
    let best = 0;
    for (const [amount, n] of counts) {
      if (n > best) {
        best = n;
        common = amount;
      }
    }
    return { lastAmountByPlayer: last, commonAmount: common };
  }, [live.buyIns]);

  function openRebuy(player: LedgerPlayer) {
    openModal({ kind: 'buyIn', draft: { playerName: player.name, amount: '', pickedPlayerId: player.playerId } });
  }

  function openBuyBack(playerId: string, playerName: string) {
    if (!actions.requireHost('buy players back in')) return;
    openModal({ kind: 'buyIn', draft: { playerName, amount: '', pickedPlayerId: playerId, isBuyBack: true } });
  }

  function startEarlyCashOut(player: LedgerPlayer, amount = '') {
    if (!actions.requireHost('cash out players')) return;
    openModal({
      kind: 'cashOut',
      target: { playerId: player.playerId, playerName: player.name, totalBuyIn: player.total },
      amount,
    });
  }

  const cashedOutDetail = useMemo(() => {
    if (modal?.kind !== 'cashedOut') return null;
    const co = earlyCashOutMap.get(modal.playerId);
    const p = players.find((x) => x.playerId === modal.playerId);
    if (!co || !p) return null;
    return { playerId: p.playerId, name: p.name, totalBuyIn: p.total, cashOut: co };
  }, [modal, earlyCashOutMap, players]);

  /** Seated players first, so they win name ties against friends who aren't playing. */
  const voiceRoster = useMemo<VoiceRosterEntry[]>(() => {
    const entries: VoiceRosterEntry[] = players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      inSession: true,
    }));
    const seen = new Set(entries.map((e) => e.playerId));
    if (playerProfile && !seen.has(playerProfile.id)) {
      seen.add(playerProfile.id);
      entries.push({ playerId: playerProfile.id, name: playerProfile.name, inSession: false });
    }
    for (const friend of live.friends) {
      if (seen.has(friend.playerId)) continue;
      seen.add(friend.playerId);
      entries.push({ playerId: friend.playerId, name: friend.name, inSession: false });
    }
    return entries;
  }, [players, live.friends, playerProfile]);

  /**
   * Voice only pre-fills these existing modals — it never writes. The host still
   * taps Confirm, which runs the same validated handlers as a typed entry.
   */
  const voice = useVoiceSession({
    isHost: viewerIsHost,
    sessionActive: live.isActive,
    amountUnit: unit,
    roster: voiceRoster,
    findSeatedPlayer: (playerId) => {
      const player = players.find((p) => p.playerId === playerId);
      if (!player) return null;
      return {
        playerId: player.playerId,
        name: player.name,
        totalBuyIn: player.total,
        cashedOut: earlyCashOutMap.has(player.playerId),
      };
    },
    // null pickedPlayerId keeps the typed-name collision prompt in play for new guests.
    prefillBuyIn: ({ playerId, playerName, amount }) =>
      openModal({ kind: 'buyIn', draft: { playerName, amount: String(amount), pickedPlayerId: playerId } }),
    prefillCashOut: (player, amount) =>
      startEarlyCashOut(
        { playerId: player.playerId, name: player.name, total: player.totalBuyIn },
        String(amount)
      ),
    prefillManualEntry: ({ playerName, amount }) =>
      openModal({ kind: 'buyIn', draft: { playerName, amount, pickedPlayerId: null } }),
  });

  const showLedgerDollars = live.ledgerCanToggleDollars && ledgerShowDollars;

  const headerRight = canAct
    ? () => (
        <Pressable
          onPress={actions.confirmDeleteSession}
          disabled={actions.isDeletingSession}
          style={styles.headerIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Delete session"
          accessibilityState={{ disabled: actions.isDeletingSession, busy: actions.isDeletingSession }}>
          {actions.isDeletingSession ? (
            <ActivityIndicator size="small" color={c.lossLight} />
          ) : (
            <MaterialIcons name="delete-outline" size={24} color={c.lossLight} />
          )}
        </Pressable>
      )
    : undefined;

  if (live.isLoading) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.textMuted} accessibilityLabel="Loading session" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      <ScrollView
        style={[styles.screen, { backgroundColor: c.bg }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <SessionHeader
          title={session?.date ? formatDateTimeDMY(session.date) : 'Active Session'}
          hostActions={
            viewerIsHost
              ? {
                  micSlot: <VoiceMicButton voice={voice} />,
                  onBuyIn: () => openModal({ kind: 'buyIn', draft: EMPTY_BUY_IN }),
                }
              : null
          }
        />
        <PotBadge total={live.totalPot} unit={unit} />
        {live.showSessionMetaCards ? (
          <SessionMetaCards
            session={session}
            canEdit={viewerIsHost}
            onEditLocation={() => openModal({ kind: 'location' })}
            onEditBlinds={() => openModal({ kind: 'blinds' })}
            onEditChipValue={() => openModal({ kind: 'chipValue' })}
          />
        ) : null}
        {live.error ? (
          <View style={styles.errorRow} accessibilityLiveRegion="polite">
            <Text style={[styles.errorText, { color: c.loss }]}>{live.error}</Text>
            <Pressable
              onPress={live.retry}
              style={[styles.retryBtn, { borderColor: c.border }]}
              accessibilityRole="button">
              <Text style={[styles.retryLabel, { color: c.text }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {live.isActive && !viewerIsHost ? (
          <Text style={{ color: c.textMuted }}>
            View-only mode: only the host can add buy-ins, cash out players, edit location, blinds, dollars per
            chip, or end the session.
          </Text>
        ) : null}

        <LedgerHeader
          count={players.length}
          showTapHint={canAct && players.length > 0}
          pendingCount={pendingBuyIns}
          dollarsToggle={
            live.ledgerCanToggleDollars ? { value: ledgerShowDollars, onChange: setLedgerShowDollars } : null
          }
        />
        <PlayerTotalsList
          players={players}
          earlyCashOutMap={earlyCashOutMap}
          getAvatar={(playerId) => getAvatarEmoji(playerId, playerProfile, live.friendAvatarMap)}
          hostId={session?.hostId}
          canAct={canAct}
          removingPlayerId={actions.removingPlayerId}
          displayUnit={showLedgerDollars ? 'cash' : unit}
          dollarsPerChip={showLedgerDollars ? session?.dollarsPerChip : undefined}
          onRebuy={openRebuy}
          onCorrectTotal={(p) =>
            openModal({
              kind: 'editBuyIn',
              target: { playerId: p.playerId, playerName: p.name, currentTotal: p.total },
            })
          }
          onOpenCashedOut={(playerId) => openModal({ kind: 'cashedOut', playerId })}
          onCashOut={(p) => startEarlyCashOut(p)}
          onRemove={(p) => actions.confirmRemovePlayer(p.playerId, p.name)}
        />

        <SessionFooterActions
          canManage={canAct}
          isFinished={session?.status === 'finished'}
          onEndSession={actions.endSession}
          onViewSummary={() => router.push(`./summary/${id}`)}
        />
      </ScrollView>

      <VoiceBanner voice={voice} />
      {undoable ? (
        <UndoSnackbar
          key={undoable.key}
          message={`Added ${formatSessionAmountValue(undoable.amount, unit, 'ledger')}${
            unit === 'chips' ? ' chips' : ''
          } for ${undoable.playerName}`}
          onUndo={undoBuyIn}
          onDismiss={dismissUndo}
        />
      ) : null}

      <EarlyCashOutModal
        key={`cashOut-${modalSeq}`}
        visible={modal?.kind === 'cashOut'}
        target={modal?.kind === 'cashOut' ? modal.target : null}
        initialAmount={modal?.kind === 'cashOut' ? modal.amount : ''}
        unit={unit}
        onClose={closeModal}
        onSubmit={actions.saveCashOut}
      />
      <BuyInModal
        key={`buyIn-${modalSeq}`}
        visible={modal?.kind === 'buyIn'}
        initialDraft={modal?.kind === 'buyIn' ? modal.draft : EMPTY_BUY_IN}
        unit={unit}
        players={players}
        cashedOutIds={earlyCashOutMap}
        friends={live.friends}
        playerProfile={playerProfile}
        lastAmountByPlayer={lastAmountByPlayer}
        commonAmount={commonAmount}
        onClose={closeModal}
        onSubmit={submitBuyIn}
      />
      <CashedOutDetailModal
        detail={cashedOutDetail}
        unit={unit}
        canBuyBack={viewerIsHost}
        onClose={closeModal}
        onBuyBackIn={openBuyBack}
      />
      <LocationEditorModal
        key={`location-${modalSeq}`}
        visible={modal?.kind === 'location'}
        initialLocation={session?.location ?? ''}
        onClose={closeModal}
        onSubmit={actions.saveLocation}
      />
      <ChipValueEditorModal
        key={`chipValue-${modalSeq}`}
        visible={modal?.kind === 'chipValue'}
        initialValue={numberDraft(session?.dollarsPerChip)}
        onClose={closeModal}
        onSubmit={actions.saveChipValue}
      />
      <EditBuyInModal
        key={`editBuyIn-${modalSeq}`}
        visible={modal?.kind === 'editBuyIn'}
        target={modal?.kind === 'editBuyIn' ? modal.target : null}
        unit={unit}
        onClose={closeModal}
        onSubmit={actions.saveEditBuyIn}
      />
      <BlindsEditorModal
        key={`blinds-${modalSeq}`}
        visible={modal?.kind === 'blinds'}
        initialSmallBlind={numberDraft(session?.smallBlind)}
        initialBigBlind={numberDraft(session?.bigBlind)}
        unit={unit}
        onClose={closeModal}
        onSubmit={actions.saveBlinds}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 12,
    gap: 10,
    // Room for the undo snackbar / voice banner over the last rows.
    paddingBottom: 96,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    flex: 1,
  },
  retryBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
  },
  retryLabel: {
    fontWeight: '600',
  },
});
