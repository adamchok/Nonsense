import { LegalLink } from '@/components/consent-checkbox';
import { EmailAuthForm, type EmailAuthMode } from '@/components/email-auth-form';
import { FieldError } from '@/components/field-error';
import { ForgotPasswordForm } from '@/components/forgot-password-form';
import { GoogleButton } from '@/components/google-button';
import { Animated } from '@/components/motion';
import { SegmentedTabs, type SegmentedTab } from '@/components/segmented-tabs';
import { AccountLinkError } from '@/lib/account-link';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { authErrorInfo } from '@/lib/auth-errors';
import { useResolvedColorScheme } from '@/lib/theme-context';
import { radius } from '@/lib/spacing';
import { text } from '@/lib/ui';
import { Link, Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AuthBrandPanel } from '@/components/auth-brand-panel';
import { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const IS_WEB = Platform.OS === 'web';

const SPLIT_MIN_WIDTH = 960;
const FORM_SIDE_MIN_WIDTH = 520;
const FORM_SIDE_MAX_WIDTH = 680;
const FORM_SIDE_SHARE = 0.4;

const cardEntering = FadeInDown.duration(360).reduceMotion(ReduceMotion.System);

const MODE_TABS: readonly SegmentedTab<EmailAuthMode>[] = [
  { key: 'signin', label: 'Sign in', icon: 'person' },
  { key: 'create', label: 'Create account', icon: 'person-add' },
];

export default function WelcomeScreen() {
  const c = useAppColors();
  const scheme = useResolvedColorScheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSplit = width >= SPLIT_MIN_WIDTH;
  const { isReady, user, isAnonymous, signInWithGoogle, signInWithEmail, createAccountWithEmail } = useAuth();
  const [mode, setMode] = useState<EmailAuthMode>('signin');
  const [isGoogleBusy, setIsGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const isResetting = resetEmail !== null;
  const [lastEmail, setLastEmail] = useState('');

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

  const logoSource =
    scheme === 'dark' ? require('@/assets/images/logo-large.png') : require('@/assets/images/logo-light-large.png');

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

  const form = (
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
          {isSplit ? null : IS_WEB ? (
            <Link href="/" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Nonsense home"
                {...({ dataSet: { plainLink: 'true' } } as object)}
                style={styles.logoLink}>
                <Animated.Image source={logoSource} style={styles.logo} resizeMode="contain" accessible={false} />
              </Pressable>
            </Link>
          ) : (
            <Animated.Image
              source={logoSource}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Nonsense"
            />
          )}
          {isResetting ? null : (
            <View style={styles.header}>
              <Text style={[text.modalTitle, styles.center, { color: c.text }]} accessibilityRole="header">
                Welcome to Nonsense
              </Text>
              <Text style={[styles.subtitle, { color: c.textMuted }]}>
                Sign in to keep your games, friends and stats in sync across devices.
              </Text>
            </View>
          )}

          {isResetting ? (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <ForgotPasswordForm
                initialEmail={resetEmail}
                onBack={(email) => {
                  setLastEmail(email);
                  setResetEmail(null);
                }}
              />
            </View>
          ) : (
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

              <EmailAuthForm
                mode={mode}
                onSubmit={handleEmailSubmit}
                busy={isGoogleBusy}
                onForgotPassword={setResetEmail}
                initialEmail={lastEmail}
              />
            </View>
          )}

          {mode === 'signin' && !isResetting ? (
            <Text style={[styles.legal, { color: c.textMuted }]}>
              By continuing, you agree to the <LegalLink label="Terms of Service" path="/terms" color={c.accentText} />{' '}
              and <LegalLink label="Privacy Policy" path="/privacy" color={c.accentText} />.
            </Text>
          ) : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (!isSplit) return form;

  return (
    <View style={styles.split}>
      <View style={styles.panelSide}>
        <AuthBrandPanel />
      </View>
      <View style={{ width: Math.min(FORM_SIDE_MAX_WIDTH, Math.max(FORM_SIDE_MIN_WIDTH, width * FORM_SIDE_SHARE)) }}>
        {form}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  panelSide: { flex: 1, minWidth: 0 },
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
  logo: { width: 120, height: 120, alignSelf: 'center' },
  logoLink: { alignSelf: 'center', borderRadius: radius.lg },
  header: { gap: 6, alignItems: 'center' },
  center: { textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 340 },
  card: { borderRadius: 14, padding: 20, gap: 16, borderWidth: 1 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 13 },
  legal: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
