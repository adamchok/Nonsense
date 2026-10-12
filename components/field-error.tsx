import { Icon } from '@/components/icon';
import { Animated, fadeIn } from '@/components/motion';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { Platform, StyleSheet, Text, View } from 'react-native';

type FieldErrorProps = {
  message?: string | null;
  /** Element id (web) so an input can point at this message with aria-describedby. */
  nativeID?: string;
};

/**
 * The polite live region stays mounted so screen readers announce a message the
 * moment it appears; only the text inside it comes and goes. While empty it is
 * taken out of flow so it never adds spacing to the parent layout.
 */
export function FieldError({ message, nativeID }: FieldErrorProps) {
  const c = useAppColors();
  return (
    <View nativeID={nativeID} accessibilityLiveRegion="polite" style={message ? null : styles.empty}>
      {message ? (
        <Animated.View entering={fadeIn} style={styles.row}>
          <Icon name="error-outline" size={14} color={c.lossLight} style={styles.icon} />
          <Text style={[styles.text, { color: c.lossLight }]}>{message}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export function errorBorder(c: AppColors, message?: string | null): { borderColor: string } | null {
  return message ? { borderColor: c.lossLight } : null;
}

/** Web-only ARIA for an input: marks it invalid and links it to its FieldError when an id is given. */
export function invalidProps(message?: string | null, describedBy?: string): object {
  if (Platform.OS !== 'web' || !message) return {};
  return describedBy ? { 'aria-invalid': true, 'aria-describedby': describedBy } : { 'aria-invalid': true };
}

const styles = StyleSheet.create({
  empty: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  icon: { marginTop: 2 },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});
