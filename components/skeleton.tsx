import { useAppColors } from '@/lib/app-theme';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  makeMutable,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** One clock for every bone on screen, so a whole skeleton breathes together, not in a ripple. */
const pulse = makeMutable(0);
let pulseUsers = 0;
const PULSE_MS = 850;
/** Bone opacity at the pulse's low and high points. */
const LOW = 0.45;
const HIGH = 1;

function usePulseClock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    pulseUsers += 1;
    if (pulseUsers === 1) {
      pulse.value = 0;
      pulse.value = withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }), -1, true);
    }
    return () => {
      pulseUsers -= 1;
      if (pulseUsers === 0) cancelAnimation(pulse);
    };
  }, [enabled]);
}

type BoneProps = {
  width?: DimensionValue;
  height?: number;
  /** Corner radius; defaults to a soft 6, pass height / 2 for pills and circles. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A placeholder block shaped like the content it stands in for. Compose bones inside a
 * <SkeletonGroup> that mirrors the real layout, so data replaces them in place without a jump.
 * Pulses in sync with every other bone; still under reduce motion.
 */
export function Skeleton({ width = '100%', height = 14, radius = 6, style }: BoneProps) {
  const c = useAppColors();
  const reduceMotion = useReducedMotion();
  usePulseClock(!reduceMotion);
  const animated = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.7 : LOW + (HIGH - LOW) * pulse.value,
  }));
  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[{ width, height, borderRadius: radius, backgroundColor: c.border }, style, animated]}
    />
  );
}

/** Wraps a skeleton layout: one "Loading" announcement for screen readers instead of many bones. */
export function SkeletonGroup({
  label = 'Loading',
  style,
  children,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      accessibilityRole="progressbar"
      style={style}>
      {children}
    </View>
  );
}

/** Common shapes, so screens don't hand-roll the same bones. */
export const skeletonStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 8 },
});
