import { AccountLinkError } from '@/lib/account-link';
import { appAlert } from '@/lib/app-alert';
import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { scrollModalFieldToTop } from '@/lib/modal-keyboard-scroll';
import { Redirect, router, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { userMessage } from '@/lib/user-message';
import { GoogleButton } from '@/components/google-button';
import { Animated } from '@/components/motion';
import { FadeInDown, ReduceMotion } from 'react-native-reanimated';

/** First-launch card: a single, slightly longer fade-up than list rows. */
const cardEntering = FadeInDown.duration(360).reduceMotion(ReduceMotion.System);

export default function NameScreen() {
  const c = useAppColors();
  const insets = useSafeAreaInsets();
  const nameScrollRef = useRef<ScrollView>(null);
  const navigation = useNavigation();
  const { isReady, user, playerProfile, saveDisplayName, isLinked, linkedEmail, signInWithGoogle } =
    useAuth();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  // Set once Google sign-in succeeds; the profile may arrive a moment later via the auth listener.
  const [didGoogleSignIn, setDidGoogleSignIn] = useState(false);

  const isEditing = !!playerProfile?.name;
  const MAX_NAME_LEN = 15;

  useEffect(() => {
    if (playerProfile?.name) {
      setName(playerProfile.name.slice(0, MAX_NAME_LEN));
    }
  }, [playerProfile?.name]);

  // Returning user: once their existing profile loads, go home. No profile → stay and ask for a name.
  useEffect(() => {
    if (didGoogleSignIn && playerProfile?.name) {
      router.replace('/(tabs)');
    }
  }, [didGoogleSignIn, playerProfile?.name]);

  const trimmed = name.trim();
  const isBusy = isSaving || isSigningIn;
  // Stays enabled for bad input so a tap can explain what's wrong under the field.
  const canSubmit = !isBusy;

  if (!isReady) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.textMuted} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  async function onSave() {
    if (!canSubmit) {
      return;
    }
    if (trimmed.length === 0) {
      setNameError('Enter a display name');
      return;
    }
    if (trimmed.length < 2) {
      setNameError('Use at least 2 characters');
      return;
    }
    if (trimmed.length > MAX_NAME_LEN) {
      setNameError(`Use at most ${MAX_NAME_LEN} characters`);
      return;
    }

    try {
      setIsSaving(true);
      // onSave navigates itself; stop the post-sign-in effect from navigating a second time.
      setDidGoogleSignIn(false);
      await saveDisplayName(trimmed);

      if (isEditing && navigation.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      appAlert(
        'Unable to save name',
        userMessage(error, 'Please try again.')
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function onSignInWithGoogle() {
    if (isBusy) return;
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
      setDidGoogleSignIn(true);
    } catch (error) {
      if (error instanceof AccountLinkError && error.code === 'cancelled') return;
      appAlert(
        'Unable to sign in',
        userMessage(error, 'Please try again.')
      );
    } finally {
      setIsSigningIn(false);
    }
  }

  function onCancelEdit() {
    if (isSaving) return;
    if (navigation.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardRoot, { backgroundColor: c.bg }]}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
      <ScrollView
        ref={nameScrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 20) + 16 },
        ]}>
        <Animated.View entering={cardEntering} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.title, { color: c.text }]}>
            {isEditing && !didGoogleSignIn ? 'Edit display name' : 'What should we call you?'}
          </Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>
            This name is shown to everyone in your poker sessions.
          </Text>
          {didGoogleSignIn && !playerProfile ? (
            <Text style={[styles.subtitle, { color: c.textMuted }]} accessibilityLiveRegion="polite">
              Signed in{linkedEmail ? ` as ${linkedEmail}` : ''}. No existing profile was found, so
              choose a display name to finish setting up.
            </Text>
          ) : null}
          <View style={styles.inputBlock}>
            <View>
              <TextInput
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setNameError(null);
                }}
                accessibilityLabel="Display name"
                placeholder="Enter display name"
                placeholderTextColor={c.placeholder}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={MAX_NAME_LEN}
                onFocus={() => scrollModalFieldToTop(nameScrollRef)}
                style={[
                  styles.input,
                  { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
                  errorBorder(c, nameError),
                ]}
                editable={!isBusy}
                {...invalidProps(nameError)}
              />
              <FieldError message={nameError} />
            </View>
            <Text
              style={[
                styles.charCounter,
                {
                  color: name.length >= MAX_NAME_LEN ? c.textSecondary : c.textMuted,
                },
              ]}
              accessibilityLiveRegion="polite">
              {name.length} / {MAX_NAME_LEN}
            </Text>
          </View>
          {isEditing ? (
            <View style={styles.buttonRow}>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.buttonSecondary,
                  { borderColor: c.border },
                  isSaving && styles.buttonDisabled,
                  pressed && !isSaving && styles.buttonPressed,
                ]}
                onPress={onCancelEdit}
                disabled={isSaving}>
                <Text style={[styles.buttonSecondaryLabel, { color: c.lossLight }]}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.buttonPrimary,
                  { backgroundColor: c.accent },
                  !canSubmit && styles.buttonDisabled,
                  pressed && canSubmit && styles.buttonPressed,
                ]}
                onPress={onSave}
                disabled={!canSubmit}>
                {isSaving ? (
                  <ActivityIndicator color={c.onAccent} />
                ) : (
                  <Text style={[styles.buttonLabel, { color: c.onAccent }]}>Save</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: c.accent },
                !canSubmit && styles.buttonDisabled,
                pressed && canSubmit && styles.buttonPressed,
              ]}
              onPress={onSave}
              disabled={!canSubmit}
              accessibilityState={{ disabled: !canSubmit, busy: isSaving }}>
              {isSaving ? (
                <ActivityIndicator color={c.onAccent} />
              ) : (
                <Text style={[styles.buttonLabel, { color: c.onAccent }]}>Continue</Text>
              )}
            </Pressable>
          )}
          {!isEditing && !isLinked ? (
            <View style={styles.googleBlock}>
              <View style={styles.dividerRow} importantForAccessibility="no-hide-descendants">
                <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
                <Text style={[styles.dividerText, { color: c.textMuted }]}>Already have an account?</Text>
                <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
              </View>
              <GoogleButton
                label="Sign in with Google"
                accessibilityLabel="Already have an account? Sign in with Google"
                onPress={onSignInWithGoogle}
                busy={isSigningIn}
                disabled={isBusy}
              />
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: 14,
    padding: 20,
    gap: 16,
    borderWidth: 1,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  inputBlock: {
    gap: 7,
  },
  charCounter: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  input: {
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  buttonPrimary: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonSecondary: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonSecondaryLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  googleBlock: {
    gap: 12,
    marginTop: 8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 12,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
});
