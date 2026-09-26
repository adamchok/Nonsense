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
  delay?: number;
  fromScale?: number;
  style?: StyleProp<ViewStyle>;
};

const FADE_MS = 260;
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
