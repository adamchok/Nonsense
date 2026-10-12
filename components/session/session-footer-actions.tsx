import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { space } from '@/lib/spacing';
import { text, ui } from '@/lib/ui';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  canManage: boolean;
  isFinished: boolean;
  onEndSession: () => void;
  onViewSummary: () => void;
};

export function SessionFooterActions({ canManage, isFinished, onEndSession, onViewSummary }: Props) {
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
          <Text style={[text.button, { color: c.onAccent }]}>End Session & Cash Out</Text>
        </PressableScale>
      ) : null}
      {isFinished ? (
        <PressableScale
          style={[ui.button, { backgroundColor: c.accent }]}
          onPress={onViewSummary}
          accessibilityRole="button">
          <Icon name="clipboard-text-outline" size={18} color={c.onAccent} />
          <Text style={[text.button, { color: c.onAccent }]}>View Summary</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space.md,
  },
});
