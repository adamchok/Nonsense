import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { userMessage } from '@/lib/user-message';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

const MIN_NAME_LEN = 2;
const MAX_NAME_LEN = 15;

type Props = {
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
};

export function EditNameModal({ initialName, onClose, onSave }: Props) {
  const c = useAppColors();
  const [name, setName] = useState(initialName.slice(0, MAX_NAME_LEN));
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const trimmed = name.trim();
  const canSave = trimmed !== initialName && !isSaving;

  async function save() {
    if (!canSave) return;
    if (trimmed.length < MIN_NAME_LEN) {
      setNameError(trimmed ? `Use at least ${MIN_NAME_LEN} characters` : 'Enter a display name');
      return;
    }
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
        <View>
          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(t);
              setNameError(null);
            }}
            maxLength={MAX_NAME_LEN}
            placeholder="Enter display name"
            accessibilityLabel="Display name"
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            placeholderTextColor={c.placeholder}
            style={[
              formStyles.input,
              { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text },
              errorBorder(c, nameError),
            ]}
            {...invalidProps(nameError)}
          />
          <FieldError message={nameError} />
        </View>
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
