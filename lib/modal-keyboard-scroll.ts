import type { RefObject } from 'react';
import { Platform, ScrollView } from 'react-native';

/**
 * Delay before `scrollToEnd` after focus so the keyboard has started opening (Android usually needs more).
 */
export const MODAL_FOCUS_SCROLL_DELAY_MS = Platform.OS === 'android' ? 120 : 50;

/** `scrollTo({ y })` when snapping toward the top; increase to leave content visible above the field. */
export const MODAL_FOCUS_SCROLL_TOP_Y = 0;

export function scrollModalFieldToTop(scrollRef: RefObject<ScrollView | null>, y: number = MODAL_FOCUS_SCROLL_TOP_Y) {
  requestAnimationFrame(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
  });
}

export function scrollModalFieldToEnd(scrollRef: RefObject<ScrollView | null>, delayMs: number = MODAL_FOCUS_SCROLL_DELAY_MS) {
  requestAnimationFrame(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), delayMs);
  });
}
