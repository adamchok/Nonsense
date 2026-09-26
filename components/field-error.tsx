import { Icon } from '@/components/icon';
import { Animated, fadeIn } from '@/components/motion';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { Platform, StyleSheet, Text } from 'react-native';

/**
 * Inline validation, used instead of an alert for input mistakes (missing or invalid values):
 * show <FieldError> under the field, and give the field errorBorder() + invalidProps().
 * Alerts stay for things that aren't a single field's fault (server errors, permissions).
 */
export function FieldError({ message }: { message?: string | null }) {
  const c = useAppColors();
  if (!message) return null;
  return (
    <Animated.View entering={fadeIn} style={styles.row} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name="error-outline" size={14} color={c.lossLight} />
      <Text style={[styles.text, { color: c.lossLight }]}>{message}</Text>
    </Animated.View>
  );
}

/** Red border for a field (or its bordered wrapper) while it has an error. */
export function errorBorder(c: AppColors, message?: string | null): { borderColor: string } | null {
  return message ? { borderColor: c.lossLight } : null;
}

/**
 * Web: aria-invalid on the input, so screen readers announce it and web-interactions.css keeps
 * the red border instead of the gold focus border. Spread onto the TextInput.
 */
export function invalidProps(message?: string | null): object {
  return Platform.OS === 'web' && message ? { 'aria-invalid': true } : {};
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});
