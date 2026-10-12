import { FieldError } from '@/components/field-error';
import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { PasswordField } from '@/components/password-field';
import { DANGER_FILL } from '@/components/session/modal-shell';
import { CONTACT_EMAIL } from '@/components/web/site-chrome';
import { AccountLinkError } from '@/lib/account-link';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { authErrorInfo } from '@/lib/auth-errors';
import { text } from '@/lib/ui';
import { router } from 'expo-router';
import { useId, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

const FORM_MAX_WIDTH = 520;
const WRONG_PASSWORD = new Set(['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials']);

const DELETED: { icon: IconName; label: string }[] = [
  { icon: 'person', label: 'Your profile, avatar and friend code' },
  { icon: 'people', label: 'Your friends list and friend requests' },
  { icon: 'groups', label: 'Groups you own, and your place in other groups' },
  { icon: 'location-on', label: 'Your saved locations' },
  { icon: 'history', label: 'Sessions only you and your guests played' },
];

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

function refusalReason(err: unknown): string | null {
  const details = (err as { details?: { reason?: unknown } } | null)?.details;
  return typeof details?.reason === 'string' ? details.reason : null;
}

export default function DeleteAccountScreen() {
  const c = useAppColors();
  const { user, isAnonymous, hasPassword, deleteAccount } = useAuth();
  const idBase = useId();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function runDelete() {
    setIsDeleting(true);
    try {
      await deleteAccount(hasPassword ? password : undefined);
      appAlert('Account deleted', 'Your account and personal data have been removed.');
      router.replace('/sign-in');
    } catch (err) {
      if (err instanceof AccountLinkError && err.code === 'cancelled') return;
      if (WRONG_PASSWORD.has(errorCode(err))) {
        setPasswordError('That is not your password');
        return;
      }
      const reason = refusalReason(err);
      if (reason === 'live-session') setFormError((err as Error).message);
      else if (reason === 'recent-login') setFormError('Please confirm it is you again, then retry.');
      else if (err instanceof AccountLinkError) setFormError(err.message);
      else if (errorCode(err).startsWith('auth/')) setFormError(authErrorInfo(err).message);
      else setFormError('Could not delete your account. Check your connection and try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  function handleDelete() {
    if (isDeleting) return;
    setFormError(null);
    if (hasPassword && !password) {
      setPasswordError('Enter your password to confirm');
      return;
    }
    appAlert('Delete your account?', 'This removes your account for good. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: () => void runDelete() },
    ]);
  }

  const card = [styles.card, { backgroundColor: c.card, borderColor: c.border }];

  if (!user) {
    return (
      <ScrollView style={[styles.screen, { backgroundColor: c.bg }]} contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={card}>
            <Text style={[text.heading, { color: c.text }]}>Delete your Nonsense account</Text>
            <Text style={[text.body, { color: c.textMuted }]}>
              Sign in and open Profile, then Delete account. It takes effect straight away.
            </Text>
            <Text style={[text.body, { color: c.textMuted }]}>
              Can&apos;t sign in? Email{' '}
              <Text
                style={{ color: c.accentText, fontWeight: '600' }}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>
                {CONTACT_EMAIL}
              </Text>{' '}
              from your account&apos;s email address and we will delete it within 30 days.
            </Text>
            <PressableScale
              onPress={() => router.push('/sign-in')}
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: c.accent }]}>
              <Text style={[styles.buttonLabel, { color: c.onAccent }]}>Sign in</Text>
            </PressableScale>
          </View>
        </View>
      </ScrollView>
    );
  }

  const confirmHint = !hasPassword && !isAnonymous ? 'You will be asked to sign in with Google again to confirm.' : null;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: `${DANGER_FILL}1f` }]}>
            <Icon name="warning" size={22} color={c.loss} />
          </View>
          <Text style={[text.body, styles.introText, { color: c.text }]}>
            This permanently deletes your account. It cannot be undone.
          </Text>
        </View>

        <View style={card}>
          <Text style={[styles.cardTitle, { color: c.textMuted }]}>Deleted</Text>
          {DELETED.map((item) => (
            <View key={item.label} style={styles.listRow}>
              <Icon name={item.icon} size={18} color={c.textMuted} />
              <Text style={[text.body, styles.listText, { color: c.text }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={card}>
          <Text style={[styles.cardTitle, { color: c.textMuted }]}>Kept for other players</Text>
          <View style={styles.listRow}>
            <Icon name="people" size={18} color={c.textMuted} />
            <Text style={[text.body, styles.listText, { color: c.text }]}>
              Sessions other players were in keep their amounts so their history stays right. Your name is replaced
              with &quot;Deleted player&quot;.
            </Text>
          </View>
        </View>

        <View style={[card, styles.confirmCard]}>
          {hasPassword ? (
            <PasswordField
              label="Password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setPasswordError(null);
                setFormError(null);
              }}
              kind="current"
              placeholder="Enter your password to confirm"
              error={passwordError}
              errorId={`${idBase}-password`}
              editable={!isDeleting}
              returnKeyType="go"
              onSubmitEditing={handleDelete}
            />
          ) : null}
          {confirmHint ? <Text style={[text.caption, { color: c.textMuted }]}>{confirmHint}</Text> : null}

          <FieldError message={formError} />

          <PressableScale
            onPress={handleDelete}
            disabled={isDeleting}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            accessibilityState={{ disabled: isDeleting, busy: isDeleting }}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: DANGER_FILL },
              isDeleting && styles.disabled,
              pressed && !isDeleting && styles.pressed,
            ]}>
            {isDeleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.buttonContent}>
                <Icon name="delete-outline" size={18} color="#fff" />
                <Text style={[styles.buttonLabel, styles.dangerLabel]}>Delete account</Text>
              </View>
            )}
          </PressableScale>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingTop: 28, paddingBottom: 32 },
  column: { width: '100%', maxWidth: FORM_MAX_WIDTH, alignSelf: 'center', gap: 16 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  introIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  introText: { flex: 1, minWidth: 0 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  confirmCard: { gap: 20 },
  cardTitle: { ...text.section },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  listText: { flex: 1, minWidth: 0 },
  button: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  dangerLabel: { color: '#fff' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
