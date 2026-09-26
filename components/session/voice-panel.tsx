import type { VoiceSession } from '@/hooks/use-voice-session';
import { useAppColors } from '@/lib/app-theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function VoiceMicButton({ voice }: { voice: VoiceSession }) {
  const c = useAppColors();
  if (!voice.showMic) return null;
  return (
    <Pressable
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
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}>
      <MaterialIcons
        name={voice.isListening ? 'stop' : 'mic'}
        size={20}
        color={voice.isListening ? c.loss : c.accentText}
      />
    </Pressable>
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
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.banner, { backgroundColor: c.card, borderColor: c.borderAccent }]}>
        <MaterialIcons name="mic" size={20} color={c.accentText} importantForAccessibility="no" />
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
        <Pressable
          onPress={voice.cancel}
          style={styles.cancelBtn}
          accessibilityRole="button"
          accessibilityLabel="Cancel voice input">
          <Text style={[styles.cancelLabel, { color: c.lossLight }]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
