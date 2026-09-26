import { useEffect, useRef } from 'react';
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Peak opacity of the accent tint behind an amount that just went up. */
const FLASH_PEAK = 0.22;
const FLASH_MS = 900;

/**
 * Opacity style for an accent overlay that briefly tints a ledger amount when `total` rises
 * (a buy-in landed, from this device or another). Not on mount, not when the total drops.
 * With reduce-motion on, the tint is skipped entirely.
 */
export function useAmountFlash(total: number) {
  const previous = useRef(total);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (total > previous.current) {
      opacity.value = FLASH_PEAK;
      opacity.value = withTiming(0, {
        duration: FLASH_MS,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      });
    }
    previous.current = total;
  }, [total, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}
