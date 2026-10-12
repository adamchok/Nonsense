import { FieldError } from '@/components/field-error';
import { Icon } from '@/components/icon';
import { useAppColors } from '@/lib/app-theme';
import { SITE_URL } from '@/lib/legal-content';
import { Linking, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

const IS_WEB = Platform.OS === 'web';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
  disabled?: boolean;
};

export function LegalLink({ label, path, color }: { label: string; path: string; color: string }) {
  const url = `${SITE_URL}${path}`;
  const props = IS_WEB
    ? { href: url, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' }, dataSet: { textLink: 'true' } }
    : {};
  return (
    <Text
      role="link"
      {...(props as object)}
      onPress={(e: GestureResponderEvent) => {
        e.stopPropagation();
        if (!IS_WEB) Linking.openURL(url).catch(() => {});
      }}
      style={[styles.link, { color }]}>
      {label}
    </Text>
  );
}

export function ConsentCheckbox({ checked, onChange, error, disabled = false }: Props) {
  const c = useAppColors();
  const toggle = () => {
    if (!disabled) onChange(!checked);
  };
  const boxColor = error ? c.lossLight : checked ? c.accent : c.inputBorder;

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          role="checkbox"
          aria-checked={checked}
          aria-label="I agree to the Terms of Service and Privacy Policy"
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          onPress={toggle}
          hitSlop={4}
          {...({ dataSet: { hoverRing: 'true' } } as object)}
          style={styles.hit}>
          <View style={[styles.box, { borderColor: boxColor, backgroundColor: checked ? c.accent : c.inputBg }]}>
            {checked ? (
              <Icon name="check" size={14} color={c.onAccent} weight="bold" importantForAccessibility="no" />
            ) : null}
          </View>
        </Pressable>
        <Text onPress={toggle} style={[styles.label, { color: c.textSecondary }]}>
          I agree to the <LegalLink label="Terms of Service" path="/terms" color={c.accentText} /> and{' '}
          <LegalLink label="Privacy Policy" path="/privacy" color={c.accentText} />.
        </Text>
      </View>
      <FieldError message={error ?? null} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -12 },
  hit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 13, lineHeight: 19 },
  link: { fontWeight: '600', textDecorationLine: 'underline' },
});
