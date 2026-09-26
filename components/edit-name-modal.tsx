import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { userMessage } from '@/lib/user-message';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

/** Same limits as the first-launch name screen (app/(auth)/name.tsx). */
const MIN_NAME_LEN = 2;
const MAX_NAME_LEN = 15;

type Props = {
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
};

/** Mount only while open, so each open starts from the current name. */
export function EditNameModal({ initialName, onClose, onSave }: Props) {
  const c = useAppColors();
  const [name, setName] = useState(initialName.slice(0, MAX_NAME_LEN));
  const [isSaving, setIsSaving] = useState(false);
  const trimmed = name.trim();
  const canSave = trimmed.length >= MIN_NAME_LEN && trimmed !== initialName && !isSaving;

  async function save() {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await onSave(trimmed);
      onClose();
    } catch (e) {
      appAlert('Unable to save name', userMessage(e, 'Please try again.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalShell
      visible
      onClose={onClose}
      title="Display name"
      primary={{ label: 'Save', onPress: () => void save(), disabled: !canSave, busy: isSaving }}>
      <View style={styles.body}>
        <Text style={[styles.hint, { color: c.textMuted }]}>Shown to everyone in your poker sessions.</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={MAX_NAME_LEN}
          placeholder="Enter display name"
          accessibilityLabel="Display name"
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          placeholderTextColor={c.placeholder}
          style={[formStyles.input, { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text }]}
        />
        <Text style={[styles.counter, { color: c.textMuted }]}>
          {name.length} / {MAX_NAME_LEN}
        </Text>
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 8,
  },
  hint: {
    fontSize: 13,
  },
  counter: {
    alignSelf: 'flex-end',
    fontSize: 12,
  },
});
