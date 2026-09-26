import { Icon, type IconName } from '@/components/icon';
import { Animated, PressableScale, fadeIn, webSafe } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { StyleSheet, Text } from 'react-native';
import { ReduceMotion, ZoomIn, FadeIn } from 'react-native-reanimated';

const iconEntering = webSafe(
  ZoomIn.duration(260).delay(40).reduceMotion(ReduceMotion.System).withInitialValues({
    transform: [{ scale: 0.85 }],
  }),
  FadeIn.duration(260).delay(40).reduceMotion(ReduceMotion.System),
);

type Props = {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; icon?: IconName; onPress: () => void };
  compact?: boolean;
};

export function EmptyState({ icon, title, message, action, compact = false }: Props) {
  const c = useAppColors();
  return (
    <Animated.View entering={fadeIn} style={[styles.wrap, compact && styles.compact]}>
      <Animated.View entering={iconEntering} style={[styles.iconCircle, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
        <Icon name={icon} size={26} color={c.textMuted} importantForAccessibility="no" />
      </Animated.View>
      <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text style={[styles.message, { color: c.textMuted }]}>{message}</Text> : null}
      {action ? (
        <PressableScale
          onPress={action.onPress}
          accessibilityRole="button"
          style={[styles.action, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
          {action.icon ? <Icon name={action.icon} size={18} color={c.accentText} /> : null}
          <Text style={[styles.actionLabel, { color: c.accentText }]}>{action.label}</Text>
        </PressableScale>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 8,
  },
  compact: {
    paddingVertical: 24,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  action: {
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
