import type { VoiceSession } from '@/hooks/use-voice-session';
import { useAppColors } from '@/lib/app-theme';
import { Icon } from '@/components/icon';
import { Animated, fadeIn, fadeOut, PressableScale } from '@/components/motion';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const PULSE_MS = 1400;

/** A soft ring that swells out from the mic and fades while it is listening. */
function ListeningPulse({ color }: { color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }),
      -1,
      false,
      undefined,
      ReduceMotion.System
    );
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - t.value),
    transform: [{ scale: 1 + 0.45 * t.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pulse, { borderColor: color }, style]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    />
  );
}

export function VoiceMicButton({ voice }: { voice: VoiceSession }) {
  const c = useAppColors();
  const reduceMotion = useReducedMotion();
  if (!voice.showMic) return null;
  return (
    <View style={styles.micWrap}>
      {voice.isListening && !reduceMotion ? <ListeningPulse color={c.loss} /> : null}
      <PressableScale
        onPress={voice.onMicPress}
        accessibilityRole="button"
        accessibilityLabel={voice.isListening ? 'Stop listening' : 'Add buy-in by voice'}
        accessibilityHint={`Say a command like ${voice.example}`}
        style={({ pressed }) => [
          styles.micButton,
          {
            backgroundColor: voice.isListening ? c.card : c.accentBg,
            borderColor: voice.isListening ? c.loss : c.accentBorder,
            opacity: pressed ? 0.9 : 1,
          },
        ]}>
        <Icon
          name={voice.isListening ? 'stop' : 'mic'}
          size={20}
          color={voice.isListening ? c.loss : c.accentText}
        />
      </PressableScale>
    </View>
  );
}

/**
 * A banner rather than a Modal: an RN Modal takes window focus on Android and can pull audio
 * focus away from the recogniser, and this screen's invariant is that only one Modal is ever
 * on screen at a time.
 */
export function VoiceBanner({ voice }: { voice: VoiceSession }) {
  const c = useAppColors();
  if (voice.status === 'idle') return null;
  return (
    <Animated.View
      entering={fadeIn}
      exiting={fadeOut}
      style={[styles.banner, { backgroundColor: c.card, borderColor: c.borderAccent }]}>
      <Icon name="mic" size={20} color={c.accentText} importantForAccessibility="no" />
      <View style={styles.bannerText}>
        {voice.transcript ? (
          // No live region here: partial results update many times a second and TalkBack would chatter.
          <Text style={[styles.transcript, { color: c.textSecondary }]} numberOfLines={2}>
            {voice.transcript}
          </Text>
        ) : (
          <Text
            style={[styles.transcript, { color: c.textSecondary }]}
            numberOfLines={2}
            accessibilityLiveRegion="polite">
            {voice.isListening ? 'Listening…' : 'Starting…'}
          </Text>
        )}
        <Text style={[styles.hint, { color: c.textHint }]} numberOfLines={1}>
          {`e.g. “${voice.example}”`}
        </Text>
      </View>
      <PressableScale
        onPress={voice.cancel}
        style={styles.cancelBtn}
        accessibilityRole="button"
        accessibilityLabel="Cancel voice input">
        <Text style={[styles.cancelLabel, { color: c.lossLight }]}>Cancel</Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  micWrap: {
    width: 44,
    height: 44,
  },
  pulse: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 2,
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bannerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  transcript: {
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 11,
  },
  cancelBtn: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
