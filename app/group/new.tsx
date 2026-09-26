import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { createGroup } from '@/lib/firestore';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { userMessage } from '@/lib/user-message';

export default function NewGroupScreen() {
  const c = useAppColors();
  const { playerProfile } = useAuth();
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = name.trim().length >= 2 && !isSaving;

  async function handleNext() {
    if (!playerProfile || !canSubmit) return;

    try {
      setIsSaving(true);
      const groupId = await createGroup(playerProfile.id, name);
      router.replace(`./${groupId}/members`);
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to create group.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <Text style={[styles.heading, { color: c.text }]}>Name your group</Text>
      <Text style={[styles.hint, { color: c.textMuted }]}>
        Choose a name for your poker group, like &ldquo;Friday Boys&rdquo; or &ldquo;High Stakes Crew&rdquo;.
      </Text>

      <TextInput
        value={name}
        onChangeText={setName}
        accessibilityLabel="Group name"
        placeholder="Group name"
        placeholderTextColor={c.placeholder}
        autoFocus
        style={[styles.input, { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text }]}
      />

      <Pressable
        onPress={handleNext}
        disabled={!canSubmit}
        style={({ pressed }) => [
          styles.nextBtn,
          { backgroundColor: c.accent },
          !canSubmit && styles.disabled,
          pressed && canSubmit && styles.pressed,
        ]}>
        {isSaving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.nextLabel}>Next</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  heading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  hint: {
    fontSize: 15,
    lineHeight: 21,
  },
  input: {
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  nextBtn: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  nextLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
