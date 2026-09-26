/**
 * Shared motion primitives (Reanimated 4). Every animation here honours the OS "reduce
 * motion" setting via ReduceMotion.System, so callers don't need to check it themselves.
 */
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

/** Spring used for press feedback and small pops: quick, no visible overshoot. */
export const SPRING = { damping: 18, stiffness: 320, mass: 0.6, reduceMotion: ReduceMotion.System } as const;

/** List rows: fade + small rise, staggered by index (capped so long lists don't wait). */
export function listItemEntering(index = 0) {
  return FadeInDown.duration(220)
    .delay(Math.min(index, 8) * 35)
    .reduceMotion(ReduceMotion.System);
}

/**
 * Reanimated 4.1 on web throws in its exit/layout clean-up ("Cannot read properties of
 * undefined (reading 'top')" in setElementPosition) when an animated view unmounts along
 * with its parent. Exit and layout animations are therefore native-only; entering still
 * animates on web. ponytail: re-enable on web once Reanimated fixes the clean-up.
 */
export const EXIT_AND_LAYOUT_ANIMATIONS = Platform.OS !== 'web';

/**
 * Custom animations (Keyframe, withInitialValues, springify) go down Reanimated's
 * custom-keyframe path on web, whose clean-up crashes when the view unmounts mid-animation.
 * Use them on native only; web gets a plain preset.
 */
export function webSafe<N, W>(native: N, web: W): N | W {
  return Platform.OS === 'web' ? web : native;
}

/** Fade in/out for content that swaps in place (empty states, menus, banners). */
export const fadeIn = FadeIn.duration(180).reduceMotion(ReduceMotion.System);
export const fadeOut = EXIT_AND_LAYOUT_ANIMATIONS
  ? FadeOut.duration(140).reduceMotion(ReduceMotion.System)
  : undefined;

/** Neighbours slide into place when a row is added or removed. */
export const layoutTransition = EXIT_AND_LAYOUT_ANIMATIONS
  ? LinearTransition.duration(200).reduceMotion(ReduceMotion.System)
  : undefined;

type PressableScaleProps = PressableProps & {
  /** Scale while pressed; 0.97 suits buttons, ~0.985 suits full-width rows. */
  pressedScale?: number;
  style?: StyleProp<ViewStyle> | PressableProps['style'];
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Drop-in Pressable with a spring "squish" on press (native and web). Style may be a
 * function of press state, as with Pressable. Reanimated's animated Pressable does not
 * resolve style functions on web, so state is tracked here and a plain array is passed.
 */
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
  // react-native-web ignores `focusable` on Pressable; map it to tabIndex so hidden actions leave the Tab order.
  const webFocus = Platform.OS === 'web' && rest.focusable === false ? ({ tabIndex: -1 } as object) : {};
  return (
    <AnimatedPressable
      {...rest}
      {...webFocus}
      onPressIn={(e) => {
        scale.value = withSpring(pressedScale, SPRING);
        patch({ pressed: true });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING);
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

/**
 * Counts from the previous value to `value` (e.g. the pot after a buy-in). Returns the
 * number to render; formatting stays with the caller.
 */
export function useCountUp(value: number, durationMs = 450): number {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (shown === value) return;
    if (reduceMotion) {
      setShown(value);
      return;
    }
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

/** Opacity/scale pop for a value that just changed (badge, total). */
export function usePop(trigger: unknown) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = 1.08;
    scale.value = withSpring(1, SPRING);
  }, [trigger, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

export { Animated, withTiming };
