import { Icon, type IconName } from '@/components/icon';
import { useAppColors } from '@/lib/app-theme';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type SegmentedTab<K extends string> = { key: K; label: string; icon: IconName };

type Props<K extends string> = {
  tabs: readonly SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
};

/**
 * Pill-style tab switcher: the selected tab is tinted with the accent (filled icon), the rest
 * stay muted. Hover/focus feedback on web comes from lib/web-interactions.css.
 */
export function SegmentedTabs<K extends string>({ tabs, value, onChange }: Props<K>) {
  const c = useAppColors();
  return (
    <View style={[styles.track, { backgroundColor: c.inputBg, borderColor: c.border }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const selected = tab.key === value;
        const color = selected ? c.accentText : c.textMuted;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, selected && { backgroundColor: c.accentBg }]}>
            <Icon name={tab.icon} size={18} color={color} weight={selected ? 'fill' : 'regular'} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  tab: {
    // Grow to fill the row but size by content, so long labels (Leaderboard) aren't truncated
    // on phones while short ones give up space.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
