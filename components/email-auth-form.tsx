import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { Animated, PressableScale, fadeIn } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  MAX_PASSWORD_LENGTH,
  PASSWORD_RULES,
  authErrorInfo,
  emailInputError,
  passwordInputError,
} from '@/lib/auth-errors';
import { Icon } from '@/components/icon';
import { EyeIcon } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlashIcon } from 'phosphor-react-native/src/icons/EyeSlash';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

export type EmailAuthMode = 'signin' | 'create';

type Props = {
  mode: EmailAuthMode;
  onModeChange?: (mode: EmailAuthMode) => void;
  onSubmit: (email: string, password: string) => Promise<void>;
  busy?: boolean;
  showForgot?: boolean;
};

export function EmailAuthForm({ mode, onModeChange, onSubmit, busy = false, showForgot = false }: Props) {
  const c = useAppColors();
  const { sendPasswordReset } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetNote, setResetNote] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [prevMode, setPrevMode] = useState(mode);

  if (prevMode !== mode) {
    setPrevMode(mode);
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
    setResetNote(null);
  }

  const isCreate = mode === 'create';
  const isBusy = busy || isSubmitting || isSendingReset;

  function clearMessages() {
    setFormError(null);
    setResetNote(null);
  }

  async function handleSubmit() {
    if (isBusy) return;
    clearMessages();
    const nextEmailError = emailInputError(email);
    const nextPasswordError = passwordInputError(password, mode);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    setIsSubmitting(true);
    try {
      await onSubmit(email.trim(), password);
    } catch (error) {
      const info = authErrorInfo(error);
      if (info.field === 'email') setEmailError(info.message);
      else if (info.field === 'password') setPasswordError(info.message);
      else setFormError(info.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgot() {
    if (isBusy) return;
    clearMessages();
    setPasswordError(null);
    const nextEmailError = emailInputError(email);
    setEmailError(nextEmailError);
    if (nextEmailError) return;

    const trimmed = email.trim();
    const sentNote = `If an account exists for ${trimmed}, we've sent a reset link.`;
    setIsSendingReset(true);
    try {
      await sendPasswordReset(trimmed);
      setResetNote(sentNote);
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'auth/user-not-found') {
        setResetNote(sentNote);
        return;
      }
      const info = authErrorInfo(error);
      if (info.field === 'email') setEmailError(info.message);
      else setFormError(info.message);
    } finally {
      setIsSendingReset(false);
    }
  }

  const inputStyle = [styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }];
  const EyeGlyph = isPasswordVisible ? EyeSlashIcon : EyeIcon;
  const submitLabel = isCreate ? 'Create account' : 'Sign in';

  return (
    <View style={styles.root}>
      <View>
        <Text style={[styles.label, { color: c.textSecondary }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setEmailError(null);
            clearMessages();
          }}
          accessibilityLabel="Email"
          placeholder="you@example.com"
          placeholderTextColor={c.placeholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType={isCreate ? 'emailAddress' : 'username'}
          inputMode="email"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!isBusy}
          style={[inputStyle, errorBorder(c, emailError)]}
          {...invalidProps(emailError)}
        />
        <FieldError message={emailError} />
      </View>

      <View>
        <Text style={[styles.label, { color: c.textSecondary }]}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            ref={passwordRef}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setPasswordError(null);
              clearMessages();
            }}
            accessibilityLabel="Password"
            placeholder={isCreate ? 'Create a password' : 'Your password'}
            placeholderTextColor={c.placeholder}
            secureTextEntry={!isPasswordVisible}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={isCreate ? 'new-password' : 'current-password'}
            textContentType={isCreate ? 'newPassword' : 'password'}
            passwordRules={
              isCreate
                ? `minlength: 8; maxlength: ${MAX_PASSWORD_LENGTH}; required: upper; required: lower; required: digit; required: special;`
                : undefined
            }
            maxLength={isCreate ? MAX_PASSWORD_LENGTH : undefined}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            editable={!isBusy}
            style={[inputStyle, styles.passwordInput, errorBorder(c, passwordError)]}
            {...invalidProps(passwordError)}
          />
          <PressableScale
            onPress={() => setIsPasswordVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
            hitSlop={8}
            style={styles.eyeButton}>
            <EyeGlyph size={20} color={c.textMuted} {...eyeA11yHidden} />
          </PressableScale>
        </View>
        <FieldError message={passwordError} />
        {isCreate ? (
          <View style={styles.rules} accessibilityLabel="Password requirements">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(password);
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
        {showForgot && !isCreate ? (
          <PressableScale
            onPress={handleForgot}
            disabled={isBusy}
            accessibilityRole="link"
            accessibilityState={{ disabled: isBusy, busy: isSendingReset }}
            style={styles.forgotButton}>
            {isSendingReset ? (
              <ActivityIndicator size="small" color={c.accentText} />
            ) : (
              <Text style={[styles.forgotLabel, { color: c.accentText }]}>Forgot password?</Text>
            )}
          </PressableScale>
        ) : null}
        {resetNote ? (
          <Animated.View
            entering={fadeIn}
            style={[styles.note, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert">
            <Text style={[styles.noteText, { color: c.text }]}>{resetNote}</Text>
          </Animated.View>
        ) : null}
      </View>

      <FieldError message={formError} />

      <PressableScale
        onPress={handleSubmit}
        disabled={isBusy}
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: isBusy, busy: isSubmitting }}
        style={({ pressed }) => [
          styles.primary,
          { backgroundColor: c.accent },
          isBusy && styles.disabled,
          pressed && !isBusy && styles.pressed,
        ]}>
        {isSubmitting ? (
          <ActivityIndicator color={c.onAccent} />
        ) : (
          <Text style={[styles.primaryLabel, { color: c.onAccent }]}>{submitLabel}</Text>
        )}
      </PressableScale>

      {onModeChange ? (
        <PressableScale
          onPress={() => onModeChange(isCreate ? 'signin' : 'create')}
          disabled={isBusy}
          accessibilityRole="link"
          style={styles.switchButton}>
          <Text style={[styles.switchLabel, { color: c.textMuted }]}>
            {isCreate ? 'Already have an account? ' : 'New to Nonsense? '}
            <Text style={{ color: c.accentText, fontWeight: '600' }}>{isCreate ? 'Sign in' : 'Create an account'}</Text>
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const eyeA11yHidden: object =
  Platform.OS === 'web' ? { 'aria-hidden': true } : { importantForAccessibility: 'no', accessibilityElementsHidden: true };

const styles = StyleSheet.create({
  rules: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  rule: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  ruleText: { fontSize: 12, lineHeight: 16 },
  root: { gap: 14 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500', marginBottom: 6 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  eyeButton: {
    position: 'absolute',
    right: 6,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  forgotButton: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center', paddingHorizontal: 4, marginTop: 4 },
  forgotLabel: { fontSize: 13, fontWeight: '600' },
  note: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 },
  noteText: { fontSize: 13, lineHeight: 18 },
  primary: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 2,
  },
  primaryLabel: { fontSize: 15, fontWeight: '600' },
  switchButton: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  switchLabel: { fontSize: 13, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
