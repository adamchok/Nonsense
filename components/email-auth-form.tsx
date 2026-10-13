import { ConsentCheckbox } from '@/components/consent-checkbox';
import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { PasswordField } from '@/components/password-field';
import { PressableScale } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { authErrorInfo, emailInputError, passwordInputError } from '@/lib/auth-errors';
import { useId, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

export type EmailAuthMode = 'signin' | 'create';

type Props = {
  mode: EmailAuthMode;
  onModeChange?: (mode: EmailAuthMode) => void;
  onSubmit: (email: string, password: string) => Promise<void>;
  busy?: boolean;
  onForgotPassword?: (email: string) => void;
  initialEmail?: string;
  requireConsent?: boolean;
};

export function EmailAuthForm({
  mode,
  onModeChange,
  onSubmit,
  busy = false,
  onForgotPassword,
  initialEmail = '',
  requireConsent = true,
}: Props) {
  const c = useAppColors();
  const { termsAccepted, setTermsAccepted } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const idBase = useId();
  const emailErrorId = `${idBase}-email-error`;
  const passwordErrorId = `${idBase}-password-error`;
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prevMode, setPrevMode] = useState(mode);

  if (prevMode !== mode) {
    setPrevMode(mode);
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
    setConsentError(null);
  }

  const isCreate = mode === 'create';
  const isBusy = busy || isSubmitting;
  const needsConsent = isCreate && requireConsent;

  function focusInvalid(field: 'email' | 'password') {
    if (Platform.OS !== 'web') return;
    (field === 'email' ? emailRef : passwordRef).current?.focus();
  }

  async function handleSubmit() {
    if (isBusy) return;
    setFormError(null);
    const nextEmailError = emailInputError(email);
    const nextPasswordError = passwordInputError(password, mode);
    const nextConsentError = needsConsent && !termsAccepted ? CONSENT_REQUIRED : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setConsentError(nextConsentError);
    if (nextEmailError || nextPasswordError) {
      focusInvalid(nextEmailError ? 'email' : 'password');
      return;
    }
    if (nextConsentError) return;

    setIsSubmitting(true);
    try {
      await onSubmit(email.trim(), password);
    } catch (error) {
      const info = authErrorInfo(error);
      if (info.field === 'email') {
        setEmailError(info.message);
        focusInvalid('email');
      } else if (info.field === 'password') {
        setPasswordError(info.message);
        focusInvalid('password');
      } else setFormError(info.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputStyle = [styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }];
  const submitLabel = isCreate ? 'Create account' : 'Sign in';

  return (
    <View style={styles.root}>
      <View>
        <Text style={[styles.label, { color: c.textSecondary }]}>Email</Text>
        <TextInput
          ref={emailRef}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setEmailError(null);
            setFormError(null);
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
          {...invalidProps(emailError, emailErrorId)}
        />
        <FieldError message={emailError} nativeID={emailErrorId} />
      </View>

      <PasswordField
        label="Password"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          setPasswordError(null);
          setFormError(null);
        }}
        kind={isCreate ? 'new' : 'current'}
        placeholder={isCreate ? 'Create a password' : 'Your password'}
        error={passwordError}
        errorId={passwordErrorId}
        inputRef={passwordRef}
        editable={!isBusy}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        footer={
          onForgotPassword && !isCreate ? (
            <PressableScale
              onPress={() => onForgotPassword(email.trim())}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              {...({ dataSet: { textButton: 'true' } } as object)}
              style={styles.forgotButton}>
              <Text style={[styles.forgotLabel, { color: c.accentText }]}>Forgot password?</Text>
            </PressableScale>
          ) : null
        }
      />

      {needsConsent ? (
        <ConsentCheckbox
          checked={termsAccepted}
          onChange={(next) => {
            setTermsAccepted(next);
            if (next) setConsentError(null);
          }}
          error={consentError}
          disabled={isBusy}
        />
      ) : null}

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
          accessibilityRole="button"
          {...({ dataSet: { textButton: 'true' } } as object)}
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

export const CONSENT_REQUIRED = 'Tick the box to accept the Terms of Service and Privacy Policy.';

const styles = StyleSheet.create({
  root: { gap: 14 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500', marginBottom: 6 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  forgotButton: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, marginTop: 4 },
  forgotLabel: { fontSize: 13, fontWeight: '600' },
  primary: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 2,
  },
  primaryLabel: { fontSize: 15, fontWeight: '600' },
  switchButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  switchLabel: { fontSize: 13, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
