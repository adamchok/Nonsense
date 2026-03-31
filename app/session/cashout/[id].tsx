import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { finishSession, getBuyIns, getEarlyCashOuts, getSessionMeta, saveResults } from '@/lib/firestore';
import type { SessionResult } from '@/types';

const CHIP_AMOUNTS = [5, 10, 25, 50];
const NEGATIVE_CHIP_AMOUNTS = [...CHIP_AMOUNTS].sort((a, b) => b - a);
const POSITIVE_CHIP_AMOUNTS = [...CHIP_AMOUNTS].sort((a, b) => a - b);

type PlayerEntry = {
  playerId: string;
  playerName: string;
  totalBuyIn: number;
  cashOutInput: string;
  locked: boolean;
};

export default function CashOutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useAppColors();
  const { playerProfile } = useAuth();
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const listRef = useRef<FlatList<PlayerEntry>>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [buyIns, earlyCashOuts, sessionMeta] = await Promise.all([
          getBuyIns(id),
          getEarlyCashOuts(id),
          getSessionMeta(id),
        ]);
        setCanEdit(Boolean(playerProfile?.id && sessionMeta.hostId === playerProfile.id));
        const earlyMap = new Map(earlyCashOuts.map((c) => [c.playerId, c]));
        const totals: Record<string, { name: string; total: number }> = {};
        for (const b of buyIns) {
          if (!totals[b.playerId]) totals[b.playerId] = { name: b.playerName, total: 0 };
          totals[b.playerId].total += b.amount;
        }
        setPlayers(
          Object.entries(totals).map(([playerId, v]) => {
            const early = earlyMap.get(playerId);
            return {
              playerId,
              playerName: v.name,
              totalBuyIn: v.total,
              cashOutInput: early ? early.amount.toString() : v.total.toString(),
              locked: !!early,
            };
          })
        );
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load buy-ins.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, playerProfile?.id]);

  function updateCashOut(playerId: string, value: string) {
    setPlayers((prev) =>
      prev.map((p) => (p.playerId === playerId ? { ...p, cashOutInput: value } : p))
    );
  }

  function adjustCashOut(playerId: string, delta: number) {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.playerId !== playerId) return p;
        const current = parseFloat(p.cashOutInput) || 0;
        const next = Math.max(0, current + delta);
        return { ...p, cashOutInput: next.toString() };
      })
    );
  }

  function focusPlayerRow(index: number) {
    setTimeout(() => {
      listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.65,
      });
    }, 120);
  }

  const totalBuyIn = useMemo(() => players.reduce((s, p) => s + p.totalBuyIn, 0), [players]);
  const totalCashOut = useMemo(
    () => players.reduce((s, p) => s + (parseFloat(p.cashOutInput) || 0), 0),
    [players]
  );
  const remaining = totalBuyIn - totalCashOut;
  const balanced = Math.abs(remaining) < 0.01;
  const allFilled = players.every((p) => p.cashOutInput.trim().length > 0);

  async function handleConfirm() {
    if (!canEdit) {
      Alert.alert('Host only', 'Only the host can complete cash-out.');
      return;
    }
    if (!id) return;

    for (const p of players) {
      const val = parseFloat(p.cashOutInput);
      if (isNaN(val) || val < 0) {
        Alert.alert('Invalid entry', `Enter a valid cash-out for ${p.playerName}.`);
        return;
      }
    }

    if (!balanced) {
      Alert.alert(
        'Totals don\'t match',
        `$${Math.abs(remaining).toFixed(2)} ${remaining > 0 ? 'left to distribute' : 'over-distributed'}. Totals must balance.`
      );
      return;
    }

    try {
      setSaving(true);
      const results: SessionResult[] = players.map((p) => {
        const cashOut = parseFloat(p.cashOutInput) || 0;
        return {
          playerId: p.playerId,
          playerName: p.playerName,
          totalBuyIn: p.totalBuyIn,
          cashOut,
          profit: cashOut - p.totalBuyIn,
        };
      });
      await saveResults(id, results);
      await finishSession(id);
      router.replace(`../../session/summary/${id}`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save results.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg }]}>
        <Text style={[styles.title, { color: c.text }]}>Cash-Out</Text>
        <Text style={[styles.meta, { color: c.textMuted }]}>Loading...</Text>
      </View>
    );
  }

  if (players.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg }]}>
        <Text style={[styles.title, { color: c.text }]}>Cash-Out</Text>
        <Text style={[styles.meta, { color: c.textMuted }]}>
          No players found for this session. Add buy-ins first.
        </Text>
        <Pressable style={[styles.backButton, { backgroundColor: c.chipBg }]} onPress={() => router.back()}>
          <Text style={[styles.buttonLabel, { color: '#fff' }]}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!canEdit) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg }]}>
        <Text style={[styles.title, { color: c.text }]}>Cash-Out</Text>
        <Text style={[styles.meta, { color: c.textMuted }]}>
          View-only mode. Only the session host can complete cash-out.
        </Text>
        <Pressable style={[styles.backButton, { backgroundColor: c.chipBg }]} onPress={() => router.back()}>
          <Text style={[styles.buttonLabel, { color: '#fff' }]}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}>
      <Text style={[styles.title, { color: c.text }]}>Cash-Out</Text>
      <Text style={[styles.meta, { color: c.textMuted }]}>
        Count each remaining player&apos;s chips and enter the amount below.
        {players.some((p) => p.locked) ? ' Players who cashed out early are locked.' : ''}
      </Text>

      <View style={[styles.trackerCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.trackerRow}>
          <View style={styles.trackerItem}>
            <Text style={[styles.trackerLabel, { color: c.textHint }]}>Total Pot</Text>
            <Text style={[styles.trackerValue, { color: c.text }]}>${totalBuyIn.toFixed(2)}</Text>
          </View>
          <View style={styles.trackerItem}>
            <Text style={[styles.trackerLabel, { color: c.textHint }]}>Distributed</Text>
            <Text style={[styles.trackerValue, { color: c.text }]}>${totalCashOut.toFixed(2)}</Text>
          </View>
          <View style={styles.trackerItem}>
            <Text style={[styles.trackerLabel, { color: c.textHint }]}>Remaining</Text>
            <Text
              style={[
                styles.trackerValue,
                balanced ? { color: c.profit } : remaining > 0 ? { color: c.warning } : { color: c.loss },
              ]}>
              ${Math.abs(remaining).toFixed(2)}
            </Text>
          </View>
        </View>
        {balanced && allFilled && (
          <Text style={[styles.balancedHint, { color: c.profit }]}>Balanced! Ready to confirm.</Text>
        )}
        {!balanced && remaining > 0 && (
          <Text style={[styles.remainingHint, { color: c.warning }]}>
            ${remaining.toFixed(2)} left to distribute across players.
          </Text>
        )}
        {!balanced && remaining < 0 && (
          <Text style={[styles.overHint, { color: c.loss }]}>
            ${Math.abs(remaining).toFixed(2)} over-distributed. Reduce some cash-outs.
          </Text>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={players}
        keyExtractor={(item) => item.playerId}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        onScrollToIndexFailed={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item, index }) => {
          const cashOut = parseFloat(item.cashOutInput) || 0;
          const profit = cashOut - item.totalBuyIn;
          return (
            <View
              style={[
                styles.playerCard,
                { backgroundColor: c.card, borderColor: c.border },
                item.locked && [styles.playerCardLocked, { borderColor: c.borderDanger }],
              ]}>
              <View style={styles.playerHeader}>
                <View style={styles.playerNameRow}>
                  <Text style={[styles.playerName, { color: c.text }]}>{item.playerName}</Text>
                  {item.locked && (
                    <View style={[styles.earlyBadge, { backgroundColor: c.badge.cashedOut }]}>
                      <Text style={[styles.earlyBadgeText, { color: '#fff' }]}>EARLY CASH OUT</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.playerBuyIn, { color: c.textMuted }]}>
                  Buy-in: ${item.totalBuyIn.toFixed(2)}
                </Text>
              </View>

              <View
                style={[
                  styles.cashOutRow,
                  item.locked
                    ? { backgroundColor: c.card, borderColor: c.borderDanger }
                    : { backgroundColor: c.inputBg, borderColor: c.border },
                ]}>
                <Text style={[styles.dollarSign, { color: c.textMuted }]}>$</Text>
                <TextInput
                  value={item.cashOutInput}
                  onChangeText={(v) => updateCashOut(item.playerId, v)}
                  onFocus={() => focusPlayerRow(index)}
                  placeholder="0.00"
                  placeholderTextColor={c.placeholder}
                  keyboardType="numeric"
                  style={[
                    styles.cashOutInput,
                    { color: c.text },
                    item.locked && { color: c.textMuted },
                  ]}
                  selectTextOnFocus
                  editable={!item.locked}
                />
              </View>

              {!item.locked && (
                <View style={styles.chipRow}>
                  {NEGATIVE_CHIP_AMOUNTS.map((chip) => (
                    <Pressable
                      key={`minus-${chip}`}
                      style={[styles.chipMinus, { backgroundColor: c.chipMinusBg }]}
                      onPress={() => adjustCashOut(item.playerId, -chip)}>
                      <Text style={[styles.chipLabel, { color: c.chipValueText }]}>-{chip}</Text>
                    </Pressable>
                  ))}
                  {POSITIVE_CHIP_AMOUNTS.map((chip) => (
                    <Pressable
                      key={`plus-${chip}`}
                      style={[styles.chipPlus, { backgroundColor: c.chipPlusBg }]}
                      onPress={() => adjustCashOut(item.playerId, chip)}>
                      <Text style={[styles.chipLabel, { color: c.chipValueText }]}>+{chip}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={[styles.profitRow, { borderTopColor: c.border }]}>
                <Text style={[styles.profitLabel, { color: c.textHint }]}>P/L</Text>
                <Text
                  style={[
                    styles.profitValue,
                    profit > 0 ? { color: c.profit } : profit < 0 ? { color: c.loss } : { color: c.textMuted },
                  ]}>
                  {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                </Text>
              </View>
            </View>
          );
        }}
      />

      <Pressable
        style={[
          styles.confirmButton,
          { backgroundColor: c.accent },
          (!balanced || saving) && styles.disabled,
        ]}
        onPress={handleConfirm}
        disabled={!balanced || saving}>
        <Text style={[styles.buttonLabel, { color: '#fff' }]}>
          {saving ? 'Saving...' : 'Confirm & View Summary'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 16,
    paddingTop: 12,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  meta: {
    fontSize: 13,
  },
  trackerCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  trackerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trackerItem: {
    alignItems: 'center',
    flex: 1,
  },
  trackerLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trackerValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  balancedHint: {
    fontSize: 12,
    textAlign: 'center',
  },
  remainingHint: {
    fontSize: 12,
    textAlign: 'center',
  },
  overHint: {
    fontSize: 12,
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  playerCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  playerCardLocked: {
    opacity: 0.7,
    borderStyle: 'dashed',
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerName: {
    fontWeight: '600',
    fontSize: 15,
  },
  earlyBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  earlyBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  playerBuyIn: {
    fontSize: 13,
  },
  cashOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  dollarSign: {
    fontSize: 18,
    fontWeight: '600',
  },
  cashOutInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    fontSize: 18,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  chipMinus: {
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  chipPlus: {
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 6,
  },
  profitLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  profitValue: {
    fontWeight: '700',
    fontSize: 15,
  },
  confirmButton: {
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 14,
  },
  backButton: {
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  buttonLabel: {
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
});
