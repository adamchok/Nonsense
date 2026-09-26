/**
 * Scale + fade reveal (settle-moment winner row, QR card). Uses shared values rather than a
 * layout animation so it behaves the same on native and web. With reduce motion on, the
 * animations complete instantly and the child simply appears.
 */
import { SPRING } from '@/components/motion';
import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  children: ReactNode;
  /** Wait before revealing (ms). */
  delay?: number;
  /** Scale the child starts from; 0.9 reads as a "moment", ~0.96 as a quiet entrance. */
  fromScale?: number;
  style?: StyleProp<ViewStyle>;
};

const FADE_MS = 260;
/** Slightly softer than SPRING so the reveal settles with a hint of overshoot. */
const REVEAL_SPRING = { ...SPRING, damping: 14 };

export function ScaleFadeIn({ children, delay = 0, fromScale = 0.9, style }: Props) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(fromScale);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: FADE_MS, reduceMotion: ReduceMotion.System }),
      ReduceMotion.System
    );
    scale.value = withDelay(delay, withSpring(1, REVEAL_SPRING), ReduceMotion.System);
  }, [delay, opacity, scale]);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
