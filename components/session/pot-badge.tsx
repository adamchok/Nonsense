import { SessionAmountDisplay } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import { formatSessionAmountValue } from '@/lib/currency-format';
import type { SessionAmountUnit } from '@/types';
import { StyleSheet, Text, View } from 'react-native';

export function PotBadge({ total, unit }: { total: number; unit: SessionAmountUnit }) {
  const c = useAppColors();
  return (
    <View style={styles.row}>
      <View
        style={[styles.badge, { backgroundColor: c.card, borderColor: c.borderAccent }]}
        accessible
        accessibilityLabel={`Pot ${formatSessionAmountValue(total, unit, 'ledger')}${unit === 'chips' ? ' chips' : ''}`}
        accessibilityLiveRegion="polite">
        <Text style={[styles.label, { color: c.profit }]}>POT</Text>
        <SessionAmountDisplay
          value={total}
          unit={unit}
          color={c.profit}
          iconSize={14}
          valueStyle="compact"
          textStyle={[styles.value, { color: c.profit }]}
          rowStyle={styles.valueRow}
        />
      </View>
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
