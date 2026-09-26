import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { Animated, PressableScale, SPRING, fadeIn, fadeOut, layoutTransition, listItemEntering, usePop } from '@/components/motion';
import { SessionAmountPrefix } from '@/components/session-amount-prefix';
import { SessionAmountDisplay } from '@/components/session-amount-ui';
import { appAlert } from '@/lib/app-alert';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatChipsLedger, formatSessionAmountValue, formatSignedCurrency } from '@/lib/currency-format';
import { getBuyIns, getEarlyCashOuts, getSessionMeta, settleSession } from '@/lib/firestore';
import { parseAmount, sanitizeAmountInput } from '@/lib/parse-amount';
import type { SessionAmountUnit, SessionResult } from '@/types';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { userMessage } from '@/lib/user-message';
import {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

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

/** Split `totalCents` into `n` non-negative integers that sum to `totalCents` (extra cent to lower indices first). */
function splitCents(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  const rem = totalCents % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Inline error for a cash-out input, or null when it's a valid amount (0 or more). */
function cashOutError(input: string): string | null {
  const val = parseAmount(input);
  if (val == null) return input.trim() ? 'Enter a number' : 'Enter a cash-out';
  return val < 0 ? 'Must be 0 or more' : null;
}

/** Entering animation only for the first screenful; rows mounted later by scrolling just appear. */
const MAX_ANIMATED_ROWS = 10;
/** How far (px) the confirm button's ready ring spreads before fading out. */
const RING_SPREAD = 8;

/** P/L text that pops whenever the displayed value changes. */
function ProfitValue({ text, color }: { text: string; color: string }) {
  const pop = usePop(text);
  return <Animated.Text style={[styles.profitValue, { color }, pop]}>{text}</Animated.Text>;
}

/**
 * One-shot "good to go" cue for the confirm button: a small scale bump plus a ring that
 * spreads out and fades. Fires only on the transition into ready, never on mount.
 */
function useReadyPulse(isReady: boolean) {
  const scale = useSharedValue(1);
  const ring = useSharedValue(1);
  const wasReadyRef = useRef(isReady);
  useEffect(() => {
    if (isReady && !wasReadyRef.current) {
      scale.value = withSequence(
        withTiming(1.035, { duration: 140, reduceMotion: ReduceMotion.System }),
        withSpring(1, SPRING)
      );
      ring.value = 0;
      ring.value = withTiming(1, { duration: 650, reduceMotion: ReduceMotion.System });
    }
    wasReadyRef.current = isReady;
  }, [isReady, scale, ring]);
  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => {
    const d = ring.value * RING_SPREAD;
    return { top: -d, left: -d, right: -d, bottom: -d, borderRadius: 14 + d, opacity: 0.8 * (1 - ring.value) };
  });
  return { buttonStyle, ringStyle };
}

function PlayerBuyInCaption({
  totalBuyIn,
  isChipsMode,
  amountUnit,
  mutedColor,
}: {
  totalBuyIn: number;
  isChipsMode: boolean;
  amountUnit: SessionAmountUnit;
  mutedColor: string;
}) {
  if (isChipsMode) {
    return (
      <View style={styles.playerBuyInRow}>
        <Text style={[styles.playerBuyIn, { color: mutedColor }]}>Buy-in: </Text>
        <SessionAmountDisplay
          value={totalBuyIn}
          unit="chips"
          color={mutedColor}
          iconSize={18}
          valueStyle="fixed2"
          textStyle={[styles.playerBuyIn, { color: mutedColor }]}
        />
      </View>
    );
  }
  return (
    <Text style={[styles.playerBuyIn, { color: mutedColor }]}>
      Buy-in: {formatSessionAmountValue(totalBuyIn, 'cash', 'fixed2')}
    </Text>
  );
}

export default function CashOutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useAppColors();
  const { gutter } = usePageLayout();
  const { playerProfile } = useAuth();
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [amountUnit, setAmountUnit] = useState<SessionAmountUnit>('cash');
  const [dollarsPerChip, setDollarsPerChip] = useState<number | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const listRef = useRef<FlatList<PlayerEntry>>(null);
  const isChipsMode = amountUnit === 'chips';

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [buyIns, earlyCashOuts, sessionMeta] = await Promise.all([
          getBuyIns(id),
          getEarlyCashOuts(id),
          getSessionMeta(id),
        ]);
        if (cancelled) return;
        if (!sessionMeta) {
          setLoadError('Session not found. It may have been deleted.');
          appAlert('Session not found', 'This session no longer exists.');
          return;
        }
        setLoadError(null);
        setCanEdit(Boolean(playerProfile?.id && sessionMeta.hostId === playerProfile.id));
        setAmountUnit(sessionMeta.amountUnit);
        setDollarsPerChip(sessionMeta.dollarsPerChip);
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
        if (cancelled) return;
        setLoadError(userMessage(e, 'Failed to load buy-ins.'));
        appAlert('Error', userMessage(e, 'Failed to load buy-ins.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, playerProfile?.id]);

  const clearFieldError = useCallback((playerId: string) => {
    setFieldErrors((prev) => {
      if (!(playerId in prev)) return prev;
      const { [playerId]: _cleared, ...rest } = prev;
      return rest;
    });
  }, []);

  const updateCashOut = useCallback((playerId: string, value: string) => {
    clearFieldError(playerId);
    setPlayers((prev) =>
      prev.map((p) => (p.playerId === playerId ? { ...p, cashOutInput: value } : p))
    );
  }, [clearFieldError]);

  const adjustCashOut = useCallback((playerId: string, delta: number) => {
    clearFieldError(playerId);
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.playerId !== playerId) return p;
        const current = parseAmount(p.cashOutInput) ?? 0;
        const next = Math.max(0, current + delta);
        return { ...p, cashOutInput: next.toString() };
      })
    );
    void Haptics.selectionAsync().catch(() => {});
  }, [clearFieldError]);

  const focusPlayerRow = useCallback((index: number) => {
    setTimeout(() => {
      listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.65,
      });
    }, 120);
  }, []);

  function distributeRemainingEqually() {
    const unlocked = players.filter((p) => !p.locked);
    if (unlocked.length === 0) {
      appAlert(
        'No players',
        'No unlocked players to split among. Players who cashed out early are excluded.'
      );
      return;
    }
    setPlayers((prev) => {
      const unlockedPrev = prev.filter((p) => !p.locked);
      if (unlockedPrev.length === 0) return prev;
      const totalBuyInLocal = prev.reduce((s, p) => s + p.totalBuyIn, 0);
      const totalCashOutLocal = prev.reduce((s, p) => s + (parseAmount(p.cashOutInput) ?? 0), 0);
      const rem = totalBuyInLocal - totalCashOutLocal;
      if (rem <= 0.01) return prev;
      const cents = Math.round(rem * 100);
      const parts = splitCents(cents, unlockedPrev.length);
      const deltaById = new Map<string, number>();
      unlockedPrev.forEach((p, i) => deltaById.set(p.playerId, parts[i] / 100));
      return prev.map((p) => {
        if (p.locked) return p;
        const d = deltaById.get(p.playerId) ?? 0;
        const current = parseAmount(p.cashOutInput) ?? 0;
        return { ...p, cashOutInput: (current + d).toFixed(2) };
      });
    });
  }

  function trimOverageEqually() {
    const unlocked = players.filter((p) => !p.locked);
    if (unlocked.length === 0) {
      appAlert(
        'No players',
        'No unlocked players to trim among. Players who cashed out early are excluded.'
      );
      return;
    }
    setPlayers((prev) => {
      const unlockedPrev = prev.filter((p) => !p.locked);
      if (unlockedPrev.length === 0) return prev;
      const totalBuyInLocal = prev.reduce((s, p) => s + p.totalBuyIn, 0);
      const totalCashOutLocal = prev.reduce((s, p) => s + (parseAmount(p.cashOutInput) ?? 0), 0);
      const rem = totalBuyInLocal - totalCashOutLocal;
      if (rem >= -0.01) return prev;
      const overCents = Math.round(Math.abs(rem) * 100);
      const parts = splitCents(overCents, unlockedPrev.length);
      const subById = new Map<string, number>();
      unlockedPrev.forEach((p, i) => subById.set(p.playerId, parts[i] / 100));
      // Anything left over (a player hit 0) stays visible in the over-distributed banner.
      return prev.map((p) => {
        if (p.locked) return p;
        const sub = subById.get(p.playerId) ?? 0;
        const current = parseAmount(p.cashOutInput) ?? 0;
        const nextVal = Math.max(0, current - sub);
        return { ...p, cashOutInput: nextVal.toFixed(2) };
      });
    });
  }

  const totalBuyIn = useMemo(() => players.reduce((s, p) => s + p.totalBuyIn, 0), [players]);
  const totalCashOut = useMemo(
    () => players.reduce((s, p) => s + (parseAmount(p.cashOutInput) ?? 0), 0),
    [players]
  );
  const remaining = totalBuyIn - totalCashOut;
  const balanced = Math.abs(remaining) < 0.01;
  const allFilled = players.every((p) => p.cashOutInput.trim().length > 0);
  const isReady = balanced && allFilled;
  const wasReadyRef = useRef<boolean | null>(null);

  useEffect(() => {
    // Buzz only on the transition into "balanced", not on first render (prefill starts balanced).
    if (wasReadyRef.current === false && isReady) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    wasReadyRef.current = isReady;
  }, [isReady]);

  const status: 'ready' | 'under' | 'over' = isReady ? 'ready' : remaining > 0 ? 'under' : 'over';
  const statusColor = status === 'ready' ? c.profit : status === 'under' ? c.warning : c.loss;
  const statusPop = usePop(status);
  const { buttonStyle: confirmPulseStyle, ringStyle: confirmRingStyle } = useReadyPulse(isReady);

  async function handleConfirm() {
    if (!canEdit) {
      appAlert('Host only', 'Only the host can complete cash-out.');
      return;
    }
    if (!id) return;

    const errors: Record<string, string> = {};
    for (const p of players) {
      const error = cashOutError(p.cashOutInput);
      if (error) errors[p.playerId] = error;
    }
    setFieldErrors(errors);
    const firstInvalid = players.findIndex((p) => p.playerId in errors);
    if (firstInvalid >= 0) {
      listRef.current?.scrollToIndex({ index: firstInvalid, animated: true, viewPosition: 0.3 });
      return;
    }

    // The button is disabled until balanced; the tracker banner already explains the gap.
    if (!balanced) return;

    if (isChipsMode && (dollarsPerChip == null || !Number.isFinite(dollarsPerChip) || dollarsPerChip <= 0)) {
      appAlert('Session error', 'This chip session is missing a valid dollars-per-chip value.');
      return;
    }

    // Cash-outs are prefilled with buy-ins for speed, so review before the irreversible write.
    const formatAmount = (v: number) => (isChipsMode ? `${formatChipsLedger(v)} chips` : `$${v.toFixed(2)}`);
    const summaryLines = players.map((p) => {
      const cashOut = parseAmount(p.cashOutInput) ?? 0;
      const profit = cashOut - p.totalBuyIn;
      const pl = Math.abs(profit) < 0.005 ? 'even' : `${profit > 0 ? '+' : '-'}${formatAmount(Math.abs(profit))}`;
      return `${p.playerName}: ${formatAmount(cashOut)} (${pl})`;
    });
    appAlert('Settle session?', `${summaryLines.join('\n')}\n\nThis can't be undone.`, [
      { text: 'Review', style: 'cancel' },
      { text: 'Settle', style: 'default', onPress: () => void settle() },
    ]);
  }

  async function settle() {
    if (!id) return;
    try {
      setSaving(true);
      const dpc = dollarsPerChip ?? 1;
      const results: SessionResult[] = players.map((p) => {
        const cashOutRaw = parseAmount(p.cashOutInput) ?? 0;
        if (isChipsMode) {
          const buyChips = p.totalBuyIn;
          return {
            playerId: p.playerId,
            playerName: p.playerName,
            totalBuyIn: buyChips * dpc,
            cashOut: cashOutRaw * dpc,
            profit: (cashOutRaw - buyChips) * dpc,
          };
        }
        return {
          playerId: p.playerId,
          playerName: p.playerName,
          totalBuyIn: p.totalBuyIn,
          cashOut: cashOutRaw,
          profit: cashOutRaw - p.totalBuyIn,
        };
      });
      await settleSession(id, results);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(`../../session/summary/${id}?settled=1`);
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to save results.'));
    } finally {
      setSaving(false);
    }
  }

  // Stable renderItem so editing one player's amount doesn't re-render every mounted card.
  const renderItem = useCallback(
    ({ item, index }: { item: PlayerEntry; index: number }) => {
      const cashOut = parseAmount(item.cashOutInput) ?? 0;
      const profit = cashOut - item.totalBuyIn;
      const profitColor = profit > 0 ? c.profit : profit < 0 ? c.loss : c.textMuted;
      const profitText = isChipsMode
        ? `${profit >= 0 ? '+' : '-'}${formatChipsLedger(Math.abs(profit))}`
        : formatSignedCurrency(profit);
      const fieldError = fieldErrors[item.playerId];
      return (
        <Animated.View
          entering={index < MAX_ANIMATED_ROWS ? listItemEntering(index) : undefined}
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
            <PlayerBuyInCaption
              totalBuyIn={item.totalBuyIn}
              isChipsMode={isChipsMode}
              amountUnit={amountUnit}
              mutedColor={c.textMuted}
            />
          </View>

          <View
            style={[
              styles.cashOutRow,
              item.locked
                ? { backgroundColor: c.card, borderColor: c.borderDanger }
                : { backgroundColor: c.inputBg, borderColor: c.inputBorder },
              errorBorder(c, fieldError),
            ]}>
            <SessionAmountPrefix unit={amountUnit} color={c.textMuted} size={18} />
            <TextInput
              value={item.cashOutInput}
              onChangeText={(v) => updateCashOut(item.playerId, sanitizeAmountInput(v))}
              onFocus={() => focusPlayerRow(index)}
              placeholder={isChipsMode ? 'Chips' : '0.00'}
              placeholderTextColor={c.placeholder}
              keyboardType="numeric"
              accessibilityLabel={`Cash-out amount for ${item.playerName}`}
              accessibilityHint={`Bought in ${isChipsMode ? `${formatChipsLedger(item.totalBuyIn)} chips` : `$${item.totalBuyIn.toFixed(2)}`}, currently ${profit >= 0 ? 'up' : 'down'} ${isChipsMode ? `${formatChipsLedger(Math.abs(profit))} chips` : `$${Math.abs(profit).toFixed(2)}`}`}
              style={[
                styles.cashOutInput,
                { color: c.text },
                item.locked && { color: c.textMuted },
              ]}
              selectTextOnFocus
              editable={!item.locked}
              {...invalidProps(fieldError)}
            />
          </View>
          <FieldError message={fieldError} />

          {!item.locked && (
            <View style={styles.chipRow}>
              {NEGATIVE_CHIP_AMOUNTS.map((chip) => (
                <PressableScale
                  key={`minus-${chip}`}
                  pressedScale={0.92}
                  style={[styles.chipMinus, { backgroundColor: c.chipMinusBg }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Subtract ${chip} from ${item.playerName}`}
                  onPress={() => adjustCashOut(item.playerId, -chip)}>
                  <Text style={[styles.chipLabel, { color: c.chipValueText }]}>-{chip}</Text>
                </PressableScale>
              ))}
              {POSITIVE_CHIP_AMOUNTS.map((chip) => (
                <PressableScale
                  key={`plus-${chip}`}
                  pressedScale={0.92}
                  style={[styles.chipPlus, { backgroundColor: c.chipPlusBg }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${chip} to ${item.playerName}`}
                  onPress={() => adjustCashOut(item.playerId, chip)}>
                  <Text style={[styles.chipLabel, { color: c.chipValueText }]}>+{chip}</Text>
                </PressableScale>
              ))}
            </View>
          )}

          <View style={[styles.profitRow, { borderTopColor: c.border }]}>
            <Text style={[styles.profitLabel, { color: c.textHint }]}>P/L</Text>
            <ProfitValue text={profitText} color={profitColor} />
          </View>
        </Animated.View>
      );
    },
    [c, amountUnit, isChipsMode, fieldErrors, updateCashOut, adjustCashOut, focusPlayerRow]
  );

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg, paddingHorizontal: gutter }]}>
        <Text style={[styles.title, { color: c.text }]}>Cash-Out</Text>
        <ActivityIndicator color={c.textMuted} accessibilityLabel="Loading" />
      </View>
    );
  }

  if (players.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg, paddingHorizontal: gutter }]}>
        <Text style={[styles.title, { color: c.text }]}>Cash-Out</Text>
        <Text style={[styles.meta, { color: c.textMuted }]}>
          {loadError
            ? `Couldn't load this session: ${loadError}`
            : 'No players found for this session. Add buy-ins first.'}
        </Text>
        <Pressable
          style={[styles.backButton, { backgroundColor: c.card, borderColor: c.inputBorder }]}
          accessibilityRole="button"
          onPress={() => router.back()}>
          <Text style={[styles.buttonLabel, { color: c.text }]}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!canEdit) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg, paddingHorizontal: gutter }]}>
        <Text style={[styles.title, { color: c.text }]}>Cash-Out</Text>
        <Text style={[styles.meta, { color: c.textMuted }]}>
          View-only mode. Only the session host can complete cash-out.
        </Text>
        <Pressable
          style={[styles.backButton, { backgroundColor: c.card, borderColor: c.inputBorder }]}
          accessibilityRole="button"
          onPress={() => router.back()}>
          <Text style={[styles.buttonLabel, { color: c.text }]}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.bg, paddingHorizontal: gutter }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}>
      <Text style={[styles.title, { color: c.text }]}>Cash-Out</Text>
      <Text style={[styles.meta, { color: c.textMuted }]}>
        {isChipsMode
          ? "Enter each player's chip count below."
          : "Enter each player's cash-out amount below."}
        {players.some((p) => p.locked) ? ' Players who cashed out early are locked.' : ''}
      </Text>

      <Animated.View layout={layoutTransition} style={[styles.trackerCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.trackerRow}>
          <View style={styles.trackerItem}>
            <Text style={[styles.trackerLabel, { color: c.textHint }]}>Total Pot</Text>
            <SessionAmountDisplay
              value={totalBuyIn}
              unit={amountUnit}
              color={c.text}
              iconSize={18}
              valueStyle="fixed2"
              textStyle={[styles.trackerValue, { color: c.text }]}
              rowStyle={styles.trackerValueRow}
            />
          </View>
          <View style={styles.trackerItem}>
            <Text style={[styles.trackerLabel, { color: c.textHint }]}>Distributed</Text>
            <SessionAmountDisplay
              value={totalCashOut}
              unit={amountUnit}
              color={c.text}
              iconSize={18}
              valueStyle="fixed2"
              textStyle={[styles.trackerValue, { color: c.text }]}
              rowStyle={styles.trackerValueRow}
            />
          </View>
          <Animated.View style={[styles.trackerItem, statusPop]}>
            {/* Keyed by status so the label/colour crossfades instead of snapping. */}
            <Animated.Text
              key={`label-${status}`}
              entering={fadeIn}
              style={[styles.trackerLabel, { color: status === 'ready' ? c.profit : c.textHint }]}>
              {status === 'ready' ? 'Balanced' : 'Remaining'}
            </Animated.Text>
            <Animated.View key={`value-${status}`} entering={fadeIn}>
              <SessionAmountDisplay
                value={Math.abs(remaining)}
                unit={amountUnit}
                color={statusColor}
                iconSize={18}
                valueStyle="fixed2"
                textStyle={[styles.trackerValue, { color: statusColor }]}
                rowStyle={styles.trackerValueRow}
              />
            </Animated.View>
          </Animated.View>
        </View>
        {balanced && allFilled && (
          <Animated.Text
            entering={fadeIn}
            exiting={fadeOut}
            style={[styles.balancedHint, { color: c.profit }]}
            accessibilityLiveRegion="polite">
            Balanced! Ready to confirm.
          </Animated.Text>
        )}
        {!balanced && remaining > 0 && (
          <Animated.Text
            entering={fadeIn}
            exiting={fadeOut}
            style={[styles.remainingHint, { color: c.warning }]}
            accessibilityLiveRegion="polite">
            {isChipsMode
              ? `${formatChipsLedger(remaining)} chips left to distribute across players.`
              : `$${remaining.toFixed(2)} left to distribute across players.`}
          </Animated.Text>
        )}
        {!balanced && remaining < 0 && (
          <Animated.Text
            entering={fadeIn}
            exiting={fadeOut}
            style={[styles.overHint, { color: c.loss }]}
            accessibilityLiveRegion="polite">
            {isChipsMode
              ? `${formatChipsLedger(Math.abs(remaining))} chips over-distributed. Reduce some stacks.`
              : `$${Math.abs(remaining).toFixed(2)} over-distributed. Reduce some cash-outs.`}
          </Animated.Text>
        )}
        {!allFilled && (
          <Text style={[styles.splitHint, { color: c.textHint }]}>
            Blank cash-outs count as 0 until entered.
          </Text>
        )}
        {players.some((p) => p.locked) && (
          <Text style={[styles.splitHint, { color: c.textHint }]}>
            Equal split / trim applies to players still at the table (not early cash-out).
          </Text>
        )}
        {!balanced && remaining > 0.01 && (
          <Animated.View entering={fadeIn} exiting={fadeOut}>
            <PressableScale
              style={[styles.trackerActionBtn, { backgroundColor: c.accent }]}
              accessibilityRole="button"
              onPress={distributeRemainingEqually}>
              <Text style={[styles.trackerActionLabel, { color: c.onAccent }]}>Split remaining equally</Text>
            </PressableScale>
          </Animated.View>
        )}
        {!balanced && remaining < -0.01 && (
          <Animated.View entering={fadeIn} exiting={fadeOut}>
            <PressableScale
              style={[styles.trackerActionBtn, styles.secondaryBtn, { backgroundColor: c.card, borderColor: c.inputBorder }]}
              accessibilityRole="button"
              onPress={trimOverageEqually}>
              <Text style={[styles.trackerActionLabel, { color: c.text }]}>Trim overage equally</Text>
            </PressableScale>
          </Animated.View>
        )}
      </Animated.View>

      <FlatList
        ref={listRef}
        data={players}
        keyExtractor={(item) => item.playerId}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        onScrollToIndexFailed={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={renderItem}
      />

      <Animated.View style={[styles.confirmWrap, confirmPulseStyle]}>
        <Animated.View
          style={[styles.confirmRing, { borderColor: c.accent }, confirmRingStyle]}
        />
        <PressableScale
          style={[
            styles.confirmButton,
            { backgroundColor: c.accent },
            (!balanced || saving) && styles.disabled,
          ]}
          onPress={handleConfirm}
          accessibilityRole="button"
          accessibilityState={{ disabled: !balanced || saving, busy: saving }}
          disabled={!balanced || saving}>
          <Text style={[styles.buttonLabel, { color: c.onAccent }]}>
            {saving ? 'Saving...' : 'Confirm & View Summary'}
          </Text>
        </PressableScale>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 16,
    gap: 12,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -6,
  },
  trackerCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  trackerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trackerItem: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  trackerLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.66,
  },
  trackerValue: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  trackerValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
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
  splitHint: {
    fontSize: 12,
    textAlign: 'center',
  },
  trackerActionBtn: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 4,
  },
  secondaryBtn: {
    borderWidth: 1,
  },
  trackerActionLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  playerCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 8,
  },
  playerCardLocked: {
    borderStyle: 'dashed',
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  playerName: {
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
  },
  earlyBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  earlyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  playerBuyIn: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  playerBuyInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
    flexShrink: 1,
  },
  cashOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  cashOutInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  chipMinus: {
    borderRadius: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  chipPlus: {
    borderRadius: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  profitLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.72,
  },
  profitValue: {
    fontWeight: '600',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  confirmWrap: {
    marginBottom: 16,
  },
  confirmRing: {
    position: 'absolute',
    pointerEvents: 'none',
    borderWidth: 2,
  },
  confirmButton: {
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  backButton: {
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
