import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { createGroup } from '@/lib/firestore';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
      appAlert('Error', e instanceof Error ? e.message : 'Failed to create group.');
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
        placeholder="Group name"
        placeholderTextColor={c.placeholder}
        autoFocus
        style={[styles.input, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
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
    padding: 20,
    gap: 14,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
  },
  hint: {
    fontSize: 14,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  nextBtn: {
    marginTop: 8,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
  },
  nextLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
