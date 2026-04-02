import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { scrollModalFieldToTop } from '@/lib/modal-keyboard-scroll';
import { Redirect, router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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

export default function NameScreen() {
  const c = useAppColors();
  const insets = useSafeAreaInsets();
  const nameScrollRef = useRef<ScrollView>(null);
  const navigation = useNavigation();
  const { isReady, user, playerProfile, saveDisplayName } = useAuth();
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!playerProfile?.name;
  const MAX_NAME_LEN = 15;

  useEffect(() => {
    if (playerProfile?.name) {
      setName(playerProfile.name.slice(0, MAX_NAME_LEN));
    }
  }, [playerProfile?.name]);

  const trimmed = name.trim();
  const canSubmit = useMemo(() => {
    if (isSaving) return false;
    return trimmed.length >= 2 && trimmed.length <= MAX_NAME_LEN;
  }, [trimmed, isSaving]);

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
    if (trimmed.length > MAX_NAME_LEN) {
      appAlert('Name too long', `Please keep your display name within ${MAX_NAME_LEN} characters.`);
      return;
    }

    try {
      setIsSaving(true);
      await saveDisplayName(trimmed);

      if (isEditing && navigation.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      appAlert(
        'Unable to save name',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsSaving(false);
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
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.title, { color: c.text }]}>
            {isEditing ? 'Edit display name' : 'What should we call you?'}
          </Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>
            This name is shown to everyone in your poker sessions.
          </Text>
          <View style={styles.inputBlock}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter display name"
              placeholderTextColor={c.placeholder}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={MAX_NAME_LEN}
              onFocus={() => scrollModalFieldToTop(nameScrollRef)}
              style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
              editable={!isSaving}
            />
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
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonLabel}>Save</Text>
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
              disabled={!canSubmit}>
              <Text style={styles.buttonLabel}>Continue</Text>
            </Pressable>
          )}
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 14,
    borderWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  inputBlock: {
    gap: 6,
  },
  charCounter: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  buttonPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  buttonSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minWidth: 0,
  },
  buttonSecondaryLabel: {
    fontWeight: '700',
    fontSize: 15,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
