import { useAppColors } from '@/lib/app-theme';
import { Icon } from '@/components/icon';
import { text as type } from '@/lib/ui';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { AppSwitch } from '@/components/app-switch';

type Props = {
  count: number;
  showTapHint: boolean;
  pendingCount: number;
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
          Platform.OS === 'web' ? (
            // Shows a mini version of the row's ⋮ button so the hint points at what's on screen.
            <View
              style={styles.hintRow}
              accessible
              accessibilityLabel="Click a player to add a rebuy. Use the more button for more options.">
              <Text style={[styles.hint, { color: c.textMuted }]}>Click a player to add a rebuy. Use</Text>
              <View style={[styles.hintDots, { borderColor: c.border }]}>
                <Icon name="more-vert" size={10} color={c.textSecondary} weight="bold" />
              </View>
              <Text style={[styles.hint, { color: c.textMuted }]}>for more options.</Text>
            </View>
          ) : (
            <Text style={[styles.hint, { color: c.textMuted }]}>
              Tap a player to add a rebuy. Long-press to correct their total.
            </Text>
          )
        ) : null}
      </View>
      {dollarsToggle ? (
        <View style={styles.switchRow}>
          <Icon
            name="poker-chip"
            size={14}
            color={c.textMuted}
            importantForAccessibility="no"
          />
          <AppSwitch
            value={dollarsToggle.value}
            onValueChange={dollarsToggle.onChange}
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
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 5,
  },
  hintDots: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    minHeight: 32,
    // Breathing room between the title/hint and the ledger card below.
    marginBottom: 4,
  },
  title: {
    flex: 1,
    minWidth: 0,
    gap: 6,
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
