import { PressableScale } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { Icon } from '@/components/icon';
import { radius, space, tapTarget } from '@/lib/spacing';
import { text } from '@/lib/ui';
import { Platform, StyleSheet, Text, View } from 'react-native';

type Props = {
  /** Secondary line under the navigation title, e.g. "Started 4:51 PM". */
  meta?: string | null;
  hostActions?: { onBuyIn: () => void } | null;
};

// The session's identity ("Fri 10 Oct · Jordan's place") lives in the navigation title, so this
// row only carries the start time and the host's primary in-session action.
export function SessionHeader({ meta, hostActions }: Props) {
  const c = useAppColors();
  if (!meta && !hostActions) return null;
  return (
    <View style={styles.header}>
      <View style={styles.meta}>
        {meta ? (
          <>
            <Icon name="clock-outline" size={16} color={c.textMuted} importantForAccessibility="no" />
            <Text style={[text.label, styles.metaText, { color: c.textMuted }]} numberOfLines={1}>
              {meta}
            </Text>
          </>
        ) : null}
      </View>
      {hostActions ? (
        <PressableScale
          onPress={hostActions.onBuyIn}
          accessibilityRole="button"
          accessibilityLabel="Add buy-in"
          style={({ pressed }) => [styles.buyIn, { backgroundColor: c.accent, opacity: pressed ? 0.9 : 1 }]}>
          <Icon name="add" size={18} color={c.onAccent} importantForAccessibility="no" />
          <Text style={[text.button, { color: c.onAccent }]}>Buy-In</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
  },
  metaText: {
    flexShrink: 1,
  },
  buyIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: tapTarget,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 18,
    borderRadius: radius.pill,
    ...Platform.select({
      ios: {
        shadowColor: '#05070a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
});
