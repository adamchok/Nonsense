import { useAppColors } from '@/lib/app-theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { text as type } from '@/lib/ui';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

type Props = {
  count: number;
  showTapHint: boolean;
  /** Buy-ins queued locally but not yet acknowledged by the server. */
  pendingCount: number;
  /** Present only when the ledger can switch between chips and dollars. */
  dollarsToggle: { value: boolean; onChange: (v: boolean) => void } | null;
};

export function LedgerHeader({ count, showTapHint, pendingCount, dollarsToggle }: Props) {
  const c = useAppColors();
  return (
    <View style={styles.header}>
      <View style={styles.title}>
        <Text style={[type.section, { color: c.textMuted }]} numberOfLines={1} accessibilityRole="header">
          Buy-In Ledger ({count})
        </Text>
        {pendingCount > 0 ? (
          <View style={styles.syncRow} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={c.textMuted} />
            <Text style={[styles.hint, { color: c.textMuted }]}>
              Syncing {pendingCount} buy-in{pendingCount === 1 ? '' : 's'}…
            </Text>
          </View>
        ) : null}
        {showTapHint ? (
          <Text style={[styles.hint, { color: c.textMuted }]}>
            Tap a player to add a rebuy. Long-press to correct their total.
          </Text>
        ) : null}
      </View>
      {dollarsToggle ? (
        <View style={styles.switchRow}>
          <MaterialCommunityIcons
            name="poker-chip"
            size={14}
            color={c.textMuted}
            importantForAccessibility="no"
          />
          <Switch
            value={dollarsToggle.value}
            onValueChange={dollarsToggle.onChange}
            trackColor={{ false: c.switchTrackOff, true: c.switchTrackOn }}
            thumbColor={c.switchThumb}
            accessibilityRole="switch"
            accessibilityLabel="Show amounts in dollars"
            accessibilityState={{ checked: dollarsToggle.value }}
          />
          <Text
            style={[styles.switchSideLabel, { color: c.textMuted }]}
            importantForAccessibility="no"
            accessibilityElementsHidden>
            $
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    minHeight: 32,
  },
  title: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hint: {
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  switchSideLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
