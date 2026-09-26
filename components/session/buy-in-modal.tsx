import { ModalShell } from '@/components/session/modal-shell';
import { PlayerPicker } from '@/components/session/player-picker';
import { formStyles } from '@/components/session/session-form-styles';
import { SessionAmountInputRow } from '@/components/session-amount-ui';
import type { BuyInDraft } from '@/hooks/use-add-buy-in';
import { useAppColors } from '@/lib/app-theme';
import { formatSessionAmountValue } from '@/lib/currency-format';
import { scrollModalFieldToTop } from '@/lib/modal-keyboard-scroll';
import type { LedgerPlayer } from '@/lib/session-view';
import type { FriendRecord, PlayerProfile, SessionAmountUnit } from '@/types';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { sanitizeAmountInput } from '@/lib/parse-amount';

type Props = {
  visible: boolean;
  initialDraft: BuyInDraft;
  unit: SessionAmountUnit;
  players: LedgerPlayer[];
  cashedOutIds: ReadonlyMap<string, unknown>;
  friends: FriendRecord[];
  playerProfile: PlayerProfile | null;
  /** Each player's most recent buy-in amount, for the quick-amount chips. */
  lastAmountByPlayer: ReadonlyMap<string, number>;
  /** The session's most frequent buy-in amount, if any. */
  commonAmount: number | null;
  onClose: () => void;
  /** Resolves true when the buy-in was queued; the parent then closes the modal. */
  onSubmit: (draft: BuyInDraft) => Promise<boolean>;
};

export function BuyInModal({
  visible,
  initialDraft,
  unit,
  players,
  cashedOutIds,
  friends,
  playerProfile,
  lastAmountByPlayer,
  commonAmount,
  onClose,
  onSubmit,
}: Props) {
  const c = useAppColors();
  const [draft, setDraft] = useState<BuyInDraft>(initialDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const amountInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const selfInSession = Boolean(playerProfile && players.some((p) => p.playerId === playerProfile.id));
  const sessionPlayerIds = new Set(players.map((p) => p.playerId));
  const activePlayers = players.filter((p) => !cashedOutIds.has(p.playerId));
  const friendsNotInSession = friends.filter((f) => !sessionPlayerIds.has(f.playerId));
  const canSubmit = Boolean(draft.playerName.trim() && draft.amount.trim());

  const lastAmount = draft.pickedPlayerId ? lastAmountByPlayer.get(draft.pickedPlayerId) : undefined;
  const quickAmounts = [lastAmount, commonAmount ?? undefined].filter(
    (v, i, all): v is number => v != null && all.indexOf(v) === i
  );

  function pick(playerId: string, name: string) {
    setDraft((d) => ({ ...d, playerName: name, pickedPlayerId: playerId }));
    requestAnimationFrame(() => amountInputRef.current?.focus());
  }

  async function submit() {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(draft);
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputColors = { borderColor: c.inputBorder, backgroundColor: c.inputBg };
  const title = draft.isBuyBack ? `Buy back in: ${draft.playerName}` : 'Add Buy-In';

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title={title}
      cardStyle={styles.card}
      primary={{ label: 'Add', onPress: () => void submit(), disabled: !canSubmit, busy: isSubmitting }}>
      <Text style={[formStyles.sub, { color: c.textMuted }]}>
        {draft.isBuyBack
          ? 'Enter the chips they are buying back in with. This clears their early cash-out.'
          : unit === 'chips'
            ? 'Enter name and chip amount, or pick a player below.'
            : 'Enter name and amount, or pick a player below.'}
      </Text>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={formStyles.fieldsScrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}>
        <View style={[styles.addSection, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
          {playerProfile && !selfInSession && !draft.isBuyBack && (
            <Pressable
              style={[styles.quickAddButton, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}
              onPress={() => pick(playerProfile.id, playerProfile.name)}
              accessibilityRole="button"
              accessibilityLabel={`Add myself, ${playerProfile.name}`}>
              <Text style={[styles.quickAddLabel, { color: c.accentText }]}>
                + Add myself ({playerProfile.name})
              </Text>
            </Pressable>
          )}
          <View style={styles.inputRow}>
            <TextInput
              value={draft.playerName}
              onChangeText={(text) => setDraft((d) => ({ ...d, playerName: text, pickedPlayerId: null }))}
              editable={!draft.isBuyBack}
              autoFocus={!draft.pickedPlayerId && !draft.playerName}
              returnKeyType="next"
              onSubmitEditing={() => amountInputRef.current?.focus()}
              submitBehavior="submit"
              placeholder="Player name"
              placeholderTextColor={c.placeholder}
              accessibilityLabel="Player name"
              onFocus={() => scrollModalFieldToTop(scrollRef)}
              style={[formStyles.input, styles.nameInput, inputColors, { color: c.text }]}
            />
            <SessionAmountInputRow
              unit={unit}
              color={c.textMuted}
              iconSize={16}
              style={[formStyles.amountInputWrap, inputColors]}>
              <TextInput
                ref={amountInputRef}
                value={draft.amount}
                onChangeText={(text) => setDraft((d) => ({ ...d, amount: sanitizeAmountInput(text) }))}
                autoFocus={Boolean(draft.pickedPlayerId) && !draft.amount}
                returnKeyType="done"
                onSubmitEditing={() => void submit()}
                placeholder={unit === 'chips' ? 'Chips' : '0.00'}
                placeholderTextColor={c.placeholder}
                accessibilityLabel={unit === 'chips' ? 'Buy-in chips' : 'Buy-in amount'}
                keyboardType="numeric"
                style={[formStyles.amountInput, { color: c.text }]}
              />
            </SessionAmountInputRow>
          </View>
          {quickAmounts.length > 0 ? (
            <View style={styles.quickAmounts}>
              {quickAmounts.map((v) => {
                const label = formatSessionAmountValue(v, unit, 'ledger');
                return (
                  <Pressable
                    key={v}
                    onPress={() => setDraft((d) => ({ ...d, amount: String(v) }))}
                    accessibilityRole="button"
                    accessibilityLabel={`Amount ${label}${unit === 'chips' ? ' chips' : ''}`}
                    style={[styles.quickAmount, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}>
                    <Text style={[styles.quickAmountText, { color: c.chipText }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {draft.isBuyBack ? null : (
            <PlayerPicker
              activePlayers={activePlayers}
              friendsNotInSession={friendsNotInSession}
              selfId={playerProfile?.id}
              pickedPlayerId={draft.pickedPlayerId}
              onPick={pick}
            />
          )}
        </View>
      </ScrollView>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: '100%',
  },
  scroll: {
    maxHeight: 320,
    width: '100%',
  },
  addSection: {
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  quickAddButton: {
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickAddLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  nameInput: {
    flex: 2,
    minWidth: 0,
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickAmount: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAmountText: {
    fontWeight: '600',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
});
