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
  startedAt?: Date | null;
  onBuyIn?: (() => void) | null;
};

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
          <View style={[styles.started, styles.startedPart]}>
            <Icon name="clock-outline" size={14} color={c.textMuted} importantForAccessibility="no" />
            <Text style={[text.label, { color: c.textMuted }]} numberOfLines={1}>
              Started {formatSessionTime(startedAt)} · {formatDuration(now - startedAt.getTime())}
            </Text>
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
          <Text style={[text.button, { color: c.onAccent }]}>Buy-in</Text>
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
