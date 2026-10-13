import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { Icon } from '@/components/icon';
import { Animated, PressableScale, fadeIn } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { authErrorInfo, emailInputError } from '@/lib/auth-errors';
import { radius } from '@/lib/spacing';
import { text } from '@/lib/ui';
import { useEffect, useId, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

const RESEND_COOLDOWN_SECONDS = 60;

let nextSendAllowedAt = 0;

function secondsUntilNextSend(): number {
  return Math.max(0, Math.ceil((nextSendAllowedAt - Date.now()) / 1000));
}

type Props = { initialEmail: string; onBack: (email: string) => void };

export function ForgotPasswordForm({ initialEmail, onBack }: Props) {
  const c = useAppColors();
  const { sendPasswordReset } = useAuth();
  const errorId = `${useId()}-reset-email-error`;
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(secondsUntilNextSend);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(secondsUntilNextSend()), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function markSent(target: string) {
    nextSendAllowedAt = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
    setSentTo(target);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function send(target: string) {
    if (isSending || cooldown > 0) return;
    const nextError = emailInputError(target);
    setError(nextError);
    if (nextError) return;
    const trimmed = target.trim();
    setIsSending(true);
    try {
      await sendPasswordReset(trimmed);
      markSent(trimmed);
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code;
      if (code === 'auth/user-not-found') markSent(trimmed);
      else setError(authErrorInfo(err).message);
    } finally {
      setIsSending(false);
    }
  }

  if (sentTo) {
    return (
      <Animated.View entering={fadeIn} style={styles.root} accessibilityLiveRegion="polite">
        <View style={[styles.badge, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
          <Icon name="mail" size={24} color={c.accentText} />
        </View>
        <View style={styles.header}>
          <Text style={[text.title, styles.center, { color: c.text }]} accessibilityRole="header">
            Check your email
          </Text>
          <Text style={[styles.body, { color: c.textMuted }]}>
            If <Text style={{ color: c.text, fontWeight: '600' }}>{sentTo}</Text> has an account, a reset link is on its
            way.
          </Text>
        </View>
        <PressableScale
          onPress={() => onBack(sentTo)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, { backgroundColor: c.accent }, pressed && styles.pressed]}>
          <Icon name="arrow-left" size={18} color={c.onAccent} />
          <Text style={[styles.primaryLabel, { color: c.onAccent }]}>Back to sign in</Text>
        </PressableScale>
        <View style={styles.resendRow}>
          <Text style={[styles.textButtonLabel, { color: c.textMuted }]}>Not there? Check spam or</Text>
          {cooldown > 0 ? (
            <Text
              style={[styles.textButtonLabel, styles.resendWait, { color: c.textMuted }]}
              accessibilityLabel={`You can resend in ${cooldown} seconds`}>
              resend in {cooldown}s
            </Text>
          ) : (
            <PressableScale
              onPress={() => void send(sentTo)}
              disabled={isSending}
              accessibilityRole="button"
              accessibilityLabel="Resend reset link"
              accessibilityState={{ disabled: isSending, busy: isSending }}
              {...({ dataSet: { textButton: 'true' } } as object)}
              style={styles.resendButton}>
              {isSending ? (
                <ActivityIndicator size="small" color={c.accentText} />
              ) : (
                <Text style={[styles.textButtonLabel, { color: c.accentText }]}>Resend</Text>
              )}
            </PressableScale>
          )}
        </View>
        <FieldError message={error} />
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={fadeIn} style={styles.root}>
      <View style={[styles.badge, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
        <Icon name="lock" size={24} color={c.accentText} />
      </View>
      <View style={styles.header}>
        <Text style={[text.title, styles.center, { color: c.text }]} accessibilityRole="header">
          Reset your password
        </Text>
        <Text style={[styles.body, { color: c.textMuted }]}>We&apos;ll email you a link to set a new one.</Text>
      </View>
      <View>
        <Text style={[styles.label, { color: c.textSecondary }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError(null);
          }}
          accessibilityLabel="Email"
          placeholder="you@example.com"
          placeholderTextColor={c.placeholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          inputMode="email"
          autoFocus={!initialEmail}
          returnKeyType="send"
          onSubmitEditing={() => void send(email)}
          editable={!isSending}
          style={[
            styles.input,
            { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
            errorBorder(c, error),
          ]}
          {...invalidProps(error, errorId)}
        />
        <FieldError message={error} nativeID={errorId} />
      </View>
      <PressableScale
        onPress={() => void send(email)}
        disabled={isSending || cooldown > 0}
        accessibilityRole="button"
        accessibilityState={{ disabled: isSending, busy: isSending }}
        style={({ pressed }) => [
          styles.primary,
          { backgroundColor: c.accent },
          (isSending || cooldown > 0) && styles.disabled,
          pressed && !isSending && styles.pressed,
        ]}>
        {isSending ? (
          <ActivityIndicator color={c.onAccent} />
        ) : (
          <Text style={[styles.primaryLabel, styles.tabular, { color: c.onAccent }]}>
            {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send reset link'}
          </Text>
        )}
      </PressableScale>
      <PressableScale
        onPress={() => onBack(email.trim())}
        disabled={isSending}
        accessibilityRole="button"
        {...({ dataSet: { textButton: 'true' } } as object)}
        style={styles.textButton}>
        <Icon name="arrow-left" size={16} color={c.accentText} />
        <Text style={[styles.textButtonLabel, { color: c.accentText }]}>Back to sign in</Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  header: { gap: 6, alignItems: 'center', marginBottom: 8 },
  center: { textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500', marginBottom: 6 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  primary: {
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  resendRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
  resendButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  resendWait: { paddingHorizontal: 4, fontVariant: ['tabular-nums'] },
  tabular: { fontVariant: ['tabular-nums'] },
  primaryLabel: { fontSize: 15, fontWeight: '600' },
  textButton: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'center',
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  textButtonLabel: { fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
