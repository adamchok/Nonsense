import { FieldError } from '@/components/field-error';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { PasswordField } from '@/components/password-field';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { authErrorInfo, passwordInputError } from '@/lib/auth-errors';
import { text } from '@/lib/ui';
import { Redirect, router } from 'expo-router';
import { useId, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

const WRONG_CURRENT = new Set(['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials']);
const FORM_MAX_WIDTH = 480;

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

export default function ChangePasswordScreen() {
  const c = useAppColors();
  const { hasPassword, email, changePassword } = useAuth();
  const idBase = useId();
  const currentRef = useRef<TextInput>(null);
  const nextRef = useRef<TextInput>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!hasPassword || !email) return <Redirect href="/profile" />;

  function focus(ref: typeof currentRef) {
    if (Platform.OS === 'web') ref.current?.focus();
  }

  async function handleSubmit() {
    if (isSaving) return;
    setFormError(null);
    const nextCurrentError = current ? null : 'Enter your current password';
    const nextNextError =
      passwordInputError(next, 'create') ?? (next === current ? 'Choose a different password from your current one' : null);
    setCurrentError(nextCurrentError);
    setNextError(nextNextError);
    if (nextCurrentError || nextNextError) {
      focus(nextCurrentError ? currentRef : nextRef);
      return;
    }

    setIsSaving(true);
    try {
      await changePassword(current, next);
      appAlert('Password updated', 'Use your new password the next time you sign in.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err) {
      if (WRONG_CURRENT.has(errorCode(err))) {
        setCurrentError('That is not your current password');
        focus(currentRef);
        return;
      }
      const info = authErrorInfo(err);
      if (info.field === 'password') {
        setNextError(info.message);
        focus(nextRef);
      } else setFormError(info.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: c.accentBg }]}>
            <Icon name="lock" size={22} color={c.accentText} />
          </View>
          <Text style={[text.body, styles.introText, { color: c.textMuted }]}>
            Signed in as <Text style={{ color: c.text, fontWeight: '600' }}>{email}</Text>
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <PasswordField
            label="Current password"
            value={current}
            onChangeText={(v) => {
              setCurrent(v);
              setCurrentError(null);
              setFormError(null);
            }}
            kind="current"
            error={currentError}
            errorId={`${idBase}-current`}
            inputRef={currentRef}
            editable={!isSaving}
            returnKeyType="next"
            onSubmitEditing={() => nextRef.current?.focus()}
          />

          <PasswordField
            label="New password"
            value={next}
            onChangeText={(v) => {
              setNext(v);
              setNextError(null);
              setFormError(null);
            }}
            kind="new"
            placeholder="Create a new password"
            error={nextError}
            errorId={`${idBase}-next`}
            inputRef={nextRef}
            editable={!isSaving}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
          />

          <FieldError message={formError} />

          <PressableScale
            onPress={handleSubmit}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Update password"
            accessibilityState={{ disabled: isSaving, busy: isSaving }}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: c.accent },
              isSaving && styles.disabled,
              pressed && !isSaving && styles.pressed,
            ]}>
            {isSaving ? (
              <ActivityIndicator color={c.onAccent} />
            ) : (
              <View style={styles.primaryContent}>
                <Icon name="check" size={18} color={c.onAccent} />
                <Text style={[styles.primaryLabel, { color: c.onAccent }]}>Update password</Text>
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
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 18 },
  primary: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryLabel: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
