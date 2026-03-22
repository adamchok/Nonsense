import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router, useNavigation } from 'expo-router';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';

export default function NameScreen() {
  const c = useAppColors();
  const navigation = useNavigation();
  const { isReady, user, playerProfile, saveDisplayName } = useAuth();
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!playerProfile?.name;

  useEffect(() => {
    if (playerProfile?.name) {
      setName(playerProfile.name);
    }
  }, [playerProfile?.name]);

  const canSubmit = useMemo(() => name.trim().length >= 2 && !isSaving, [name, isSaving]);

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

    try {
      setIsSaving(true);
      await saveDisplayName(name.trim());

      if (isEditing && navigation.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      Alert.alert(
        'Unable to save name',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.title, { color: c.text }]}>
          {isEditing ? 'Edit display name' : 'What should we call you?'}
        </Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>
          This name is shown to everyone in your poker sessions.
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Enter display name"
          placeholderTextColor={c.placeholder}
          autoCapitalize="words"
          autoCorrect={false}
          style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
          editable={!isSaving}
        />
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
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonLabel}>
              {isEditing ? 'Save' : 'Continue'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
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
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
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
