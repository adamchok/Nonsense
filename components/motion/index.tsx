import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export const SPRING = { damping: 18, stiffness: 320, mass: 0.6, reduceMotion: ReduceMotion.System } as const;

export function listItemEntering(index = 0) {
  return FadeInDown.duration(220)
    .delay(Math.min(index, 8) * 35)
    .reduceMotion(ReduceMotion.System);
}

export const EXIT_AND_LAYOUT_ANIMATIONS = Platform.OS !== 'web';

export function webSafe<N, W>(native: N, web: W): N | W {
  return Platform.OS === 'web' ? web : native;
}

export const fadeIn = FadeIn.duration(180).reduceMotion(ReduceMotion.System);
export const fadeOut = EXIT_AND_LAYOUT_ANIMATIONS
  ? FadeOut.duration(140).reduceMotion(ReduceMotion.System)
  : undefined;

export const layoutTransition = EXIT_AND_LAYOUT_ANIMATIONS
  ? LinearTransition.duration(200).reduceMotion(ReduceMotion.System)
  : undefined;

type PressableScaleProps = PressableProps & {
  pressedScale?: number;
  style?: StyleProp<ViewStyle> | PressableProps['style'];
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  style,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const [state, setState] = useState({ pressed: false, hovered: false, focused: false });
  const patch = (next: Partial<typeof state>) => setState((prev) => ({ ...prev, ...next }));
  const resolved = typeof style === 'function' ? style(state as PressableStateCallbackType) : style;
  const webFocus = Platform.OS === 'web' && rest.focusable === false ? ({ tabIndex: -1 } as object) : {};
  return (
    <AnimatedPressable
      {...rest}
      {...webFocus}
      onPressIn={(e) => {
        scale.set(withSpring(pressedScale, SPRING));
        patch({ pressed: true });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, SPRING));
        patch({ pressed: false });
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        patch({ hovered: true });
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        patch({ hovered: false });
        onHoverOut?.(e);
      }}
      onFocus={(e) => {
        patch({ focused: true });
        onFocus?.(e);
      }}
      onBlur={(e) => {
        patch({ focused: false });
        onBlur?.(e);
      }}
      style={[resolved, animated]}
    />
  );
}

export function useCountUp(value: number, durationMs = 450): number {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(value);
  // With reduced motion, jump straight to the target instead of animating.
  if (reduceMotion && shown !== value) setShown(value);
  useEffect(() => {
    if (shown === value || reduceMotion) return;
    const from = shown;
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the target changes
  }, [value]);
  return shown;
}

export function usePop(trigger: unknown) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = 1.08;
    scale.value = withSpring(1, SPRING);
  }, [trigger, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

export { Animated, withTiming };
