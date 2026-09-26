import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { createGroup } from '@/lib/firestore';
import { userMessage } from '@/lib/user-message';
import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';

const MIN_NAME_LEN = 2;

type Props = { onClose: () => void };

/** Name a new group, then continue to its members screen. Mount only while open. */
export function NewGroupModal({ onClose }: Props) {
  const c = useAppColors();
  const { playerProfile } = useAuth();
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const canCreate = name.trim().length >= MIN_NAME_LEN && !isSaving;

  async function create() {
    if (!playerProfile || !canCreate) return;
    setIsSaving(true);
    try {
      const groupId = await createGroup(playerProfile.id, name.trim());
      onClose();
      router.push(`../group/${groupId}/members`);
    } catch (e) {
      appAlert('Unable to create group', userMessage(e, 'Please try again.'));
      setIsSaving(false);
    }
  }

  return (
    <ModalShell
      visible
      onClose={onClose}
      title="New group"
      primary={{ label: 'Create', onPress: () => void create(), disabled: !canCreate, busy: isSaving }}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Friday Boys"
        accessibilityLabel="Group name"
        autoFocus
        autoCapitalize="words"
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={() => void create()}
        placeholderTextColor={c.placeholder}
        style={[formStyles.input, { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text }]}
      />
    </ModalShell>
  );
}
