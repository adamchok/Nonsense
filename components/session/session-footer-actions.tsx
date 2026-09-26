import { useAppColors } from '@/lib/app-theme';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  /** Host viewing an active session. */
  canManage: boolean;
  isFinished: boolean;
  onEndSession: () => void;
  onViewSummary: () => void;
};

/** End Session (host) or View Summary (finished). Delete lives in the header, away from this thumb zone. */
export function SessionFooterActions({ canManage, isFinished, onEndSession, onViewSummary }: Props) {
  const c = useAppColors();
  return (
    <View style={styles.actions}>
      {canManage ? (
        <Pressable
          style={[styles.button, { backgroundColor: c.destructive }]}
          onPress={onEndSession}
          accessibilityRole="button"
          accessibilityHint="Opens the cash-out screen. You can go back.">
          <Text style={styles.label}>End Session & Cash Out</Text>
        </Pressable>
      ) : null}
      {isFinished ? (
        <Pressable
          style={[styles.button, { backgroundColor: c.accent }]}
          onPress={onViewSummary}
          accessibilityRole="button">
          <Text style={[styles.label, { color: c.onAccent }]}>View Summary</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
  },
  button: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  label: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
