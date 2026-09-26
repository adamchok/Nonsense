import { EmailAuthForm, type EmailAuthMode } from '@/components/email-auth-form';
import { FieldError } from '@/components/field-error';
import { GoogleButton } from '@/components/google-button';
import { Animated, PressableScale, fadeIn } from '@/components/motion';
import { AccountLinkError } from '@/lib/account-link';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { authErrorInfo } from '@/lib/auth-errors';
import { text } from '@/lib/ui';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const cardEntering = FadeInDown.duration(360).reduceMotion(ReduceMotion.System);

const GUEST_DATA_CAVEAT =
  "This device's guest games stay on the old guest profile and won't move to that account.";

function googleErrorMessage(error: unknown): string | null {
  if (error instanceof AccountLinkError) return error.code === 'cancelled' ? null : error.message;
  return authErrorInfo(error).message;
}

export default function SecureAccountScreen() {
  const c = useAppColors();
  const insets = useSafeAreaInsets();
  const { isReady, user, isAnonymous, linkWithGoogle, signInWithGoogle, signInWithEmail, createAccountWithEmail } =
    useAuth();
  const [emailMode, setEmailMode] = useState<EmailAuthMode>('create');
  const [googleBusy, setGoogleBusy] = useState<'link' | 'signin' | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [isGoogleInUse, setIsGoogleInUse] = useState(false);

  if (!isReady) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.textMuted} />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (!isAnonymous) return <Redirect href="/" />;

  const isGoogleBusy = googleBusy !== null;

  async function runGoogle(kind: 'link' | 'signin') {
    if (isGoogleBusy) return;
    setGoogleError(null);
    setGoogleBusy(kind);
    try {
      if (kind === 'link') await linkWithGoogle();
      else await signInWithGoogle();
      router.replace('/');
    } catch (error) {
      if (kind === 'link' && error instanceof AccountLinkError && error.code === 'credential-in-use') {
        setIsGoogleInUse(true);
        return;
      }
      setGoogleError(googleErrorMessage(error));
    } finally {
      setGoogleBusy(null);
    }
  }

  async function handleEmailSubmit(email: string, password: string) {
    if (emailMode === 'signin') {
      await signInWithEmail(email, password);
    } else {
      await createAccountWithEmail(email, password);
    }
    router.replace('/');
  }

  const isSignInMode = emailMode === 'signin';

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardRoot, { backgroundColor: c.bg }]}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 20) + 8, paddingBottom: Math.max(insets.bottom, 20) + 16 },
        ]}>
        <Animated.View entering={cardEntering} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.header}>
            <Text style={[text.modalTitle, { color: c.text }]} accessibilityRole="header">
              Secure your account
            </Text>
            <Text style={[styles.body, { color: c.textMuted }]}>
              Your games are only saved on this device right now. Add a sign-in so you never lose them and can use
              Nonsense on other devices.
            </Text>
          </View>

          <View>
            <GoogleButton
              label="Continue with Google"
              onPress={() => runGoogle('link')}
              busy={googleBusy === 'link'}
              disabled={isGoogleBusy}
            />
            {isGoogleInUse ? (
              <Animated.View
                entering={fadeIn}
                style={[styles.notice, { backgroundColor: c.cardAlt, borderColor: c.border }]}
                accessibilityLiveRegion="polite">
                <Text style={[styles.noticeTitle, { color: c.text }]}>
                  That Google account already has a Nonsense profile.
                </Text>
                <PressableScale
                  onPress={() => runGoogle('signin')}
                  disabled={isGoogleBusy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isGoogleBusy, busy: googleBusy === 'signin' }}
                  style={({ pressed }) => [
                    styles.secondary,
                    { borderColor: c.accentBorder },
                    isGoogleBusy && styles.disabled,
                    pressed && !isGoogleBusy && styles.pressed,
                  ]}>
                  {googleBusy === 'signin' ? (
                    <ActivityIndicator color={c.accentText} />
                  ) : (
                    <Text style={[styles.secondaryLabel, { color: c.accentText }]}>
                      Sign in to that account instead
                    </Text>
                  )}
                </PressableScale>
                <Text style={[styles.caveat, { color: c.textMuted }]}>{GUEST_DATA_CAVEAT}</Text>
              </Animated.View>
            ) : null}
            <FieldError message={googleError} />
          </View>

          <View style={styles.dividerRow} importantForAccessibility="no-hide-descendants">
            <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
            <Text style={[styles.dividerText, { color: c.textMuted }]}>or use email</Text>
            <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
          </View>

          {isSignInMode ? (
            <Text style={[styles.caveat, { color: c.textMuted }]}>
              Signing in to an existing account switches this device to it. {GUEST_DATA_CAVEAT}
            </Text>
          ) : null}

          <EmailAuthForm
            mode={emailMode}
            onSubmit={handleEmailSubmit}
            busy={isGoogleBusy}
            showForgot={isSignInMode}
          />

          <PressableScale
            onPress={() => setEmailMode(isSignInMode ? 'create' : 'signin')}
            accessibilityRole="link"
            style={styles.linkButton}>
            <Text style={[styles.linkLabel, { color: c.accentText }]}>
              {isSignInMode ? 'Create a new sign-in instead' : 'Sign in with email instead'}
            </Text>
          </PressableScale>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { borderRadius: 14, padding: 20, gap: 16, borderWidth: 1 },
  header: { gap: 6 },
  body: { fontSize: 15, lineHeight: 21 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10, marginTop: 12 },
  noticeTitle: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  secondary: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryLabel: { fontSize: 14, fontWeight: '600' },
  caveat: { fontSize: 12, lineHeight: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12 },
  linkButton: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  linkLabel: { fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
