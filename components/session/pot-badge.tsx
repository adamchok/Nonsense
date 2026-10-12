import { SessionAmountDisplay } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import { formatSessionAmountValue } from '@/lib/currency-format';
import { Animated, useCountUp, usePop } from '@/components/motion';
import type { SessionAmountUnit } from '@/types';
import { radius, space } from '@/lib/spacing';
import { text } from '@/lib/ui';
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
        <Text style={[text.label, { color: c.accentText }]}>Pot</Text>
        <SessionAmountDisplay
          value={shown}
          unit={unit}
          color={c.text}
          iconSize={14}
          valueStyle="compact"
          textStyle={[text.title, text.tabular, { color: c.text }]}
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
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: 2,
    minWidth: 0,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
});
