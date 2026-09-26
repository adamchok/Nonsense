import { EmailAuthForm, type EmailAuthMode } from '@/components/email-auth-form';
import { FieldError } from '@/components/field-error';
import { GoogleButton } from '@/components/google-button';
import { Animated } from '@/components/motion';
import { SegmentedTabs, type SegmentedTab } from '@/components/segmented-tabs';
import { AccountLinkError } from '@/lib/account-link';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { authErrorInfo } from '@/lib/auth-errors';
import { useResolvedColorScheme } from '@/lib/theme-context';
import { text } from '@/lib/ui';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const cardEntering = FadeInDown.duration(360).reduceMotion(ReduceMotion.System);

const MODE_TABS: readonly SegmentedTab<EmailAuthMode>[] = [
  { key: 'signin', label: 'Sign in', icon: 'person' },
  { key: 'create', label: 'Create account', icon: 'person-add' },
];

export default function WelcomeScreen() {
  const c = useAppColors();
  const scheme = useResolvedColorScheme();
  const insets = useSafeAreaInsets();
  const { isReady, user, isAnonymous, signInWithGoogle, signInWithEmail, createAccountWithEmail } = useAuth();
  const [mode, setMode] = useState<EmailAuthMode>('signin');
  const [isGoogleBusy, setIsGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  if (!isReady) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.textMuted} />
      </View>
    );
  }

  if (user && !isAnonymous) {
    return <Redirect href="/" />;
  }

  async function handleGoogle() {
    if (isGoogleBusy) return;
    setGoogleError(null);
    setIsGoogleBusy(true);
    try {
      await signInWithGoogle();
      router.replace('/');
    } catch (error) {
      if (error instanceof AccountLinkError) {
        if (error.code !== 'cancelled') setGoogleError(error.message);
        return;
      }
      setGoogleError(authErrorInfo(error).message);
    } finally {
      setIsGoogleBusy(false);
    }
  }

  async function handleEmailSubmit(email: string, password: string) {
    if (mode === 'create') {
      await createAccountWithEmail(email, password);
    } else {
      await signInWithEmail(email, password);
    }
    router.replace('/');
  }

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
        <Animated.View entering={cardEntering} style={styles.stack}>
          <Animated.Image
            source={
              scheme === 'dark'
                ? require('@/assets/images/logo-large.png')
                : require('@/assets/images/logo-light-large.png')
            }
            style={styles.logo}
            accessibilityLabel="Nonsense"
          />
          <View style={styles.header}>
            <Text style={[text.modalTitle, styles.center, { color: c.text }]} accessibilityRole="header">
              Welcome to Nonsense
            </Text>
            <Text style={[styles.subtitle, { color: c.textMuted }]}>
              Sign in to keep your games, friends and stats in sync across devices.
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View>
              <GoogleButton
                label="Continue with Google"
                onPress={handleGoogle}
                busy={isGoogleBusy}
                disabled={isGoogleBusy}
              />
              <FieldError message={googleError} />
            </View>

            <View style={styles.dividerRow} importantForAccessibility="no-hide-descendants">
              <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
              <Text style={[styles.dividerText, { color: c.textMuted }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
            </View>

            <SegmentedTabs tabs={MODE_TABS} value={mode} onChange={setMode} variant="radio" />

            <EmailAuthForm mode={mode} onSubmit={handleEmailSubmit} busy={isGoogleBusy} showForgot />
          </View>
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
  stack: { gap: 20 },
  logo: { width: 120, height: 120, resizeMode: 'contain', alignSelf: 'center' },
  header: { gap: 6, alignItems: 'center' },
  center: { textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 340 },
  card: { borderRadius: 14, padding: 20, gap: 16, borderWidth: 1 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12 },
});
