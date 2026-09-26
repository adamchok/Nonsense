import { Animated, PressableScale, EXIT_AND_LAYOUT_ANIMATIONS } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Easing,
  FadeInDown,
  FadeOutDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export const UNDO_WINDOW_MS = 5000;

const enter = FadeInDown.duration(220).reduceMotion(ReduceMotion.System);
const exit = EXIT_AND_LAYOUT_ANIMATIONS
  ? FadeOutDown.duration(180).reduceMotion(ReduceMotion.System)
  : undefined;

type Props = {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
};

function UndoCountdown({ color }: { color: string }) {
  const remaining = useSharedValue(1);
  useEffect(() => {
    remaining.value = withTiming(0, { duration: UNDO_WINDOW_MS, easing: Easing.linear });
  }, [remaining]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: remaining.value }] }));
  return (
    <View style={styles.track} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.progress, { backgroundColor: color }, style]} />
    </View>
  );
}

export function UndoSnackbar({ message, onUndo, onDismiss }: Props) {
  const c = useAppColors();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(onDismiss, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <Animated.View
      entering={enter}
      exiting={exit}
      style={[styles.bar, { backgroundColor: c.card, borderColor: c.border }]}
      accessibilityLiveRegion="polite">
      <Text style={[styles.message, { color: c.text }]} numberOfLines={2}>
        {message}
      </Text>
      <PressableScale
        onPress={onUndo}
        style={styles.undoBtn}
        accessibilityRole="button"
        accessibilityLabel={`Undo: ${message}`}>
        <Text style={[styles.undoLabel, { color: c.accentText }]}>UNDO</Text>
      </PressableScale>
      {reduceMotion ? null : <UndoCountdown color={c.accent} />}
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
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
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
