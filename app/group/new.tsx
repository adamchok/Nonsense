import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { createGroup } from '@/lib/firestore';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { userMessage } from '@/lib/user-message';
import { PressableScale } from '@/components/motion';

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

      <TextInput
        value={name}
        onChangeText={setName}
        accessibilityLabel="Group name"
        placeholder="Friday Boys"
        placeholderTextColor={c.placeholder}
        autoFocus
        style={[styles.input, { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text }]}
      />

      <PressableScale
        onPress={handleNext}
        disabled={!canSubmit}
        style={[styles.nextBtn, { backgroundColor: c.accent }, !canSubmit && styles.disabled]}>
        {isSaving ? (
          <ActivityIndicator size="small" color={c.onAccent} />
        ) : (
          <Text style={[styles.nextLabel, { color: c.onAccent }]}>Next</Text>
        )}
      </PressableScale>
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
    fontWeight: '600',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
});
