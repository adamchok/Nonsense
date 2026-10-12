import { ConsentCheckbox } from '@/components/consent-checkbox';
import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { PasswordField } from '@/components/password-field';
import { Animated, PressableScale, fadeIn } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  authErrorInfo,
  emailInputError,
  passwordInputError,
} from '@/lib/auth-errors';
import { useId, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

export type EmailAuthMode = 'signin' | 'create';

type Props = {
  mode: EmailAuthMode;
  onModeChange?: (mode: EmailAuthMode) => void;
  onSubmit: (email: string, password: string) => Promise<void>;
  busy?: boolean;
  showForgot?: boolean;
  /** Create mode asks for Terms/Privacy agreement unless the screen collects it elsewhere. */
  requireConsent?: boolean;
};

export function EmailAuthForm({
  mode,
  onModeChange,
  onSubmit,
  busy = false,
  showForgot = false,
  requireConsent = true,
}: Props) {
  const c = useAppColors();
  const { sendPasswordReset, termsAccepted, setTermsAccepted } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const idBase = useId();
  const emailErrorId = `${idBase}-email-error`;
  const passwordErrorId = `${idBase}-password-error`;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
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
    setConsentError(null);
  }

  const isCreate = mode === 'create';
  const isBusy = busy || isSubmitting || isSendingReset;
  const needsConsent = isCreate && requireConsent;

  // Web: send keyboard and screen-reader users straight to the field that needs fixing.
  function focusInvalid(field: 'email' | 'password') {
    if (Platform.OS !== 'web') return;
    (field === 'email' ? emailRef : passwordRef).current?.focus();
  }

  function clearMessages() {
    setFormError(null);
    setResetNote(null);
  }

  async function handleSubmit() {
    if (isBusy) return;
    clearMessages();
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

  async function handleForgot() {
    if (isBusy) return;
    clearMessages();
    setPasswordError(null);
    const nextEmailError = emailInputError(email);
    setEmailError(nextEmailError);
    if (nextEmailError) {
      focusInvalid('email');
      return;
    }

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
      if (info.field === 'email') {
        setEmailError(info.message);
        focusInvalid('email');
      } else setFormError(info.message);
    } finally {
      setIsSendingReset(false);
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
          clearMessages();
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
          <>
            {showForgot && !isCreate ? (
              <PressableScale
                onPress={handleForgot}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityState={{ disabled: isBusy, busy: isSendingReset }}
                {...({ dataSet: { textButton: 'true' } } as object)}
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
                accessibilityLiveRegion="polite">
                <Text style={[styles.noteText, { color: c.text }]}>{resetNote}</Text>
              </Animated.View>
            ) : null}
          </>
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
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  forgotButton: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, marginTop: 4 },
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
  switchButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  switchLabel: { fontSize: 13, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
