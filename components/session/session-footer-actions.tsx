import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { space } from '@/lib/spacing';
import { text, ui } from '@/lib/ui';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type Props = {
  canManage: boolean;
  isFinished: boolean;
  isDeleting: boolean;
  onEndSession: () => void;
  onDelete: () => void;
  onViewSummary: () => void;
};

export function SessionFooterActions({ canManage, isFinished, isDeleting, onEndSession, onDelete, onViewSummary }: Props) {
  const c = useAppColors();
  if (!canManage && !isFinished) return null;
  return (
    <View style={styles.actions}>
      {canManage ? (
        <PressableScale
          style={[ui.button, { backgroundColor: c.accent }]}
          onPress={onEndSession}
          accessibilityRole="button"
          accessibilityHint="Opens the cash-out screen. You can go back.">
          <Icon name="receipt" size={18} color={c.onAccent} />
          <Text style={[text.button, { color: c.onAccent }]}>End session & cash out</Text>
        </PressableScale>
      ) : null}
      {canManage ? (
        <PressableScale
          style={styles.deleteBtn}
          onPress={onDelete}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Delete session"
          accessibilityState={{ disabled: isDeleting, busy: isDeleting }}>
          {isDeleting ? (
            <ActivityIndicator size="small" color={c.loss} />
          ) : (
            <Text style={[text.label, styles.deleteLabel, { color: c.loss }]}>Delete session</Text>
          )}
        </PressableScale>
      ) : null}
      {isFinished ? (
        <PressableScale
          style={[ui.button, { backgroundColor: c.accent }]}
          onPress={onViewSummary}
          accessibilityRole="button">
          <Icon name="clipboard-text-outline" size={18} color={c.onAccent} />
          <Text style={[text.button, { color: c.onAccent }]}>View summary</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space.md,
  },
  deleteBtn: {
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
  deleteLabel: {
    textDecorationLine: 'underline',
  },
});
