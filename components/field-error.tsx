import { Icon } from '@/components/icon';
import { Animated, fadeIn } from '@/components/motion';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { Platform, StyleSheet, Text, View } from 'react-native';

type FieldErrorProps = {
  message?: string | null;
  nativeID?: string;
};

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
