import { SessionAmountDisplay } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import { formatSessionAmountValue } from '@/lib/currency-format';
import { Animated, useCountUp, usePop } from '@/components/motion';
import type { SessionAmountUnit } from '@/types';
import { StyleSheet, Text, View } from 'react-native';

function settle(value: number, target: number): number {
  return Number.isInteger(target) ? Math.round(value) : Math.round(value * 100) / 100;
}

export function PotBadge({ total, unit }: { total: number; unit: SessionAmountUnit }) {
  const c = useAppColors();
  const shown = settle(useCountUp(total), total);
  const popStyle = usePop(total);
  return (
    <View style={styles.row}>
      <Animated.View
        style={[styles.badge, { backgroundColor: c.card, borderColor: c.borderAccent }, popStyle]}
        accessible
        accessibilityLabel={`Pot ${formatSessionAmountValue(total, unit, 'ledger')}${unit === 'chips' ? ' chips' : ''}`}
        accessibilityLiveRegion="polite">
        <Text style={[styles.label, { color: c.accentText }]}>POT</Text>
        <SessionAmountDisplay
          value={shown}
          unit={unit}
          color={c.text}
          iconSize={14}
          valueStyle="compact"
          textStyle={[styles.value, { color: c.text }]}
          rowStyle={styles.valueRow}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  badge: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 2,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.72,
  },
  value: {
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
});
