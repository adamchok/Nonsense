import { pointer } from '@/lib/ui';
import { Animated, PressableScale, EXIT_AND_LAYOUT_ANIMATIONS } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeOutDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export const UNDO_WINDOW_MS = Platform.OS === 'web' ? 8000 : 5000;

const enter = FadeInDown.duration(220).reduceMotion(ReduceMotion.System);
const exit = EXIT_AND_LAYOUT_ANIMATIONS
  ? FadeOutDown.duration(180).reduceMotion(ReduceMotion.System)
  : undefined;

type Props = {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
};

function UndoCountdown({ color, isPaused }: { color: string; isPaused: boolean }) {
  const remaining = useSharedValue(1);
  useEffect(() => {
    if (isPaused) {
      cancelAnimation(remaining);
      return;
    }
    remaining.value = withTiming(0, { duration: UNDO_WINDOW_MS * remaining.value, easing: Easing.linear });
  }, [remaining, isPaused]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: remaining.value }] }));
  return (
    <View style={[styles.track, pointer.none]} importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.progress, { backgroundColor: color }, style]} />
    </View>
  );
}

export function UndoSnackbar({ message, onUndo, onDismiss }: Props) {
  const c = useAppColors();
  const reduceMotion = useReducedMotion();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isPaused = isHovered || isFocused;
  const remainingMsRef = useRef(UNDO_WINDOW_MS);

  useEffect(() => {
    if (isPaused) return;
    const startedAt = Date.now();
    const timer = setTimeout(onDismiss, remainingMsRef.current);
    return () => {
      clearTimeout(timer);
      remainingMsRef.current = Math.max(0, remainingMsRef.current - (Date.now() - startedAt));
    };
  }, [onDismiss, isPaused]);

  const pauseHandlers: object =
    Platform.OS === 'web'
      ? {
          onMouseEnter: () => setIsHovered(true),
          onMouseLeave: () => setIsHovered(false),
          onFocus: () => setIsFocused(true),
          onBlur: () => setIsFocused(false),
        }
      : {};

  return (
    <Animated.View
      entering={enter}
      exiting={exit}
      style={[styles.bar, { backgroundColor: c.card, borderColor: c.border }]}
      accessibilityLiveRegion="polite"
      {...pauseHandlers}>
      <Text style={[styles.message, { color: c.text }]} numberOfLines={2}>
        {message}
      </Text>
      <PressableScale
        onPress={onUndo}
        {...({ dataSet: { textButton: 'true' } } as object)}
        style={styles.undoBtn}
        accessibilityRole="button"
        accessibilityLabel={`Undo: ${message}`}>
        <Text style={[styles.undoLabel, { color: c.accentText }]}>Undo</Text>
      </PressableScale>
      {reduceMotion ? null : <UndoCountdown color={c.accent} isPaused={isPaused} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
  },
  message: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  undoBtn: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  undoLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  track: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progress: {
    flex: 1,
    transformOrigin: 'left',
    opacity: 0.7,
  },
});
