import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_RULES } from '@/lib/auth-errors';
import { EyeIcon } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlashIcon } from 'phosphor-react-native/src/icons/EyeSlash';
import { useState, type ReactNode, type Ref } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, type ReturnKeyTypeOptions } from 'react-native';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  kind: 'current' | 'new';
  placeholder?: string;
  error?: string | null;
  errorId: string;
  inputRef?: Ref<TextInput>;
  editable?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  footer?: ReactNode;
};

export function PasswordField({
  label,
  value,
  onChangeText,
  kind,
  placeholder,
  error,
  errorId,
  inputRef,
  editable = true,
  returnKeyType,
  onSubmitEditing,
  footer,
}: Props) {
  const c = useAppColors();
  const [isVisible, setIsVisible] = useState(false);
  const isNew = kind === 'new';
  const EyeGlyph = isVisible ? EyeSlashIcon : EyeIcon;

  return (
    <View>
      <Text style={[styles.label, { color: c.textSecondary }]}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          placeholder={placeholder}
          placeholderTextColor={c.placeholder}
          secureTextEntry={!isVisible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isNew ? 'new-password' : 'current-password'}
          textContentType={isNew ? 'newPassword' : 'password'}
          passwordRules={
            isNew
              ? `minlength: ${MIN_PASSWORD_LENGTH}; maxlength: ${MAX_PASSWORD_LENGTH}; required: upper; required: lower; required: digit; required: special;`
              : undefined
          }
          maxLength={isNew ? MAX_PASSWORD_LENGTH : undefined}
          returnKeyType={returnKeyType}
          submitBehavior={returnKeyType === 'next' ? 'submit' : undefined}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          style={[
            styles.input,
            { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
            errorBorder(c, error),
          ]}
          {...invalidProps(error, errorId)}
        />
        <PressableScale
          onPress={() => setIsVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={isVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          hitSlop={8}
          style={styles.eyeButton}>
          <EyeGlyph size={20} color={c.textMuted} {...eyeA11yHidden} />
        </PressableScale>
      </View>
      <FieldError message={error} nativeID={errorId} />
      {isNew ? (
        <View style={styles.rules} accessibilityLabel="Password requirements">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(value);
            return (
              <View
                key={rule.key}
                style={styles.rule}
                accessible
                accessibilityLabel={`${rule.label}, ${met ? 'done' : 'not yet'}`}>
                <Icon
                  name={met ? 'check-circle' : 'check-circle-outline'}
                  size={14}
                  color={met ? c.profit : c.textHint}
                  weight={met ? 'fill' : 'regular'}
                />
                <Text style={[styles.ruleText, { color: met ? c.text : c.textMuted }]}>{rule.label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {footer}
    </View>
  );
}

const eyeA11yHidden: object =
  Platform.OS === 'web' ? { 'aria-hidden': true } : { importantForAccessibility: 'no', accessibilityElementsHidden: true };

const styles = StyleSheet.create({
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500', marginBottom: 6 },
  row: { justifyContent: 'center' },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingRight: 52,
    paddingVertical: 12,
    fontSize: 16,
  },
  eyeButton: {
    position: 'absolute',
    right: 2,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  rules: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  rule: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  ruleText: { fontSize: 12, lineHeight: 16 },
});
