import { Icon } from '@/components/icon';
import { Animated, PressableScale, useCountUp, usePop } from '@/components/motion';
import { formatSessionTime } from '@/components/session/session-title';
import { SessionAmountDisplay } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import { formatSessionAmountValue } from '@/lib/currency-format';
import { formatDuration } from '@/lib/date-format';
import { radius, space, tapTarget } from '@/lib/spacing';
import { text } from '@/lib/ui';
import type { SessionAmountUnit } from '@/types';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const MINUTE_MS = 60_000;

function settle(value: number, target: number): number {
  return Number.isInteger(target) ? Math.round(value) : Math.round(value * 100) / 100;
}

/** Re-renders once a minute so "1h 12m" keeps counting while the game runs. */
function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

type Props = {
  total: number;
  unit: SessionAmountUnit;
  /** Session start; shows "Started 8:27 PM" and the elapsed time under the pot. */
  startedAt?: Date | null;
  /** Host only: the primary in-session action sits in the card. */
  onBuyIn?: (() => void) | null;
};

/** Live session summary: pot, how long the game has run, and the host's Buy-In button. */
export function PotBadge({ total, unit, startedAt, onBuyIn }: Props) {
  const c = useAppColors();
  const shown = settle(useCountUp(total), total);
  const popStyle = usePop(total);
  const now = useNow(!!startedAt);
  return (
    <Animated.View style={[styles.card, { backgroundColor: c.card, borderColor: c.borderAccent }, popStyle]}>
      <View
        style={styles.info}
        accessible
        accessibilityLabel={`Pot ${formatSessionAmountValue(total, unit, 'ledger')}${unit === 'chips' ? ' chips' : ''}`}
        accessibilityLiveRegion="polite">
        <Text style={[text.section, { color: c.accentText }]}>Pot</Text>
        <SessionAmountDisplay
          value={shown}
          unit={unit}
          color={c.text}
          iconSize={18}
          valueStyle="compact"
          textStyle={[text.display, text.tabular, { color: c.text }]}
          rowStyle={styles.valueRow}
        />
        {startedAt ? (
          // Start time and elapsed each carry an icon (no dot); elapsed wraps below on narrow cards.
          <View style={[styles.started, styles.startedRow]}>
            <View style={styles.startedPart}>
              <Icon name="clock-outline" size={14} color={c.textMuted} importantForAccessibility="no" />
              <Text style={[text.label, { color: c.textMuted }]}>Started {formatSessionTime(startedAt)}</Text>
            </View>
            <View style={styles.startedPart}>
              <Icon name="timer" size={14} color={c.textMuted} importantForAccessibility="no" />
              <Text style={[text.label, { color: c.textMuted }]}>{formatDuration(now - startedAt.getTime())}</Text>
            </View>
          </View>
        ) : null}
      </View>
      {onBuyIn ? (
        <PressableScale
          onPress={onBuyIn}
          accessibilityRole="button"
          accessibilityLabel="Add buy-in"
          style={({ pressed }) => [styles.buyIn, { backgroundColor: c.accent, opacity: pressed ? 0.9 : 1 }]}>
          <Icon name="add" size={18} color={c.onAccent} importantForAccessibility="no" />
          <Text style={[text.button, { color: c.onAccent }]}>Buy-In</Text>
        </PressableScale>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  started: {
    marginTop: space.xs,
  },
  startedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 2,
  },
  startedPart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buyIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: tapTarget,
    paddingLeft: 14,
    paddingRight: 18,
    borderRadius: radius.pill,
  },
});
