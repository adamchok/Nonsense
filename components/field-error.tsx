import { Icon } from '@/components/icon';
import { Animated, fadeIn } from '@/components/motion';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { Platform, StyleSheet, Text } from 'react-native';

export function FieldError({ message }: { message?: string | null }) {
  const c = useAppColors();
  if (!message) return null;
  return (
    <Animated.View entering={fadeIn} style={styles.row} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name="error-outline" size={14} color={c.lossLight} style={styles.icon} />
      <Text style={[styles.text, { color: c.lossLight }]}>{message}</Text>
    </Animated.View>
  );
}

export function errorBorder(c: AppColors, message?: string | null): { borderColor: string } | null {
  return message ? { borderColor: c.lossLight } : null;
}

export function invalidProps(message?: string | null): object {
  return Platform.OS === 'web' && message ? { 'aria-invalid': true } : {};
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  icon: { marginTop: 2 },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});
