import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { createGroup } from '@/lib/firestore';
import { userMessage } from '@/lib/user-message';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

const MIN_NAME_LEN = 2;
const MAX_OWNED_GROUPS = 10;

type Props = { onClose: () => void; ownedCount: number };

export function NewGroupModal({ onClose, ownedCount }: Props) {
  const c = useAppColors();
  const { playerProfile } = useAuth();
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const trimmed = name.trim();
  const isAtLimit = ownedCount >= MAX_OWNED_GROUPS;
  const canCreate = !isSaving && !isAtLimit;

  async function create() {
    if (!playerProfile || !canCreate) return;
    if (trimmed.length < MIN_NAME_LEN) {
      setNameError(trimmed ? `Use at least ${MIN_NAME_LEN} characters` : 'Enter a group name');
      return;
    }
    setIsSaving(true);
    try {
      const groupId = await createGroup(playerProfile.id, trimmed);
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
      <View>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            setNameError(null);
          }}
          placeholder="Friday Boys"
          accessibilityLabel="Group name"
          autoFocus
          autoCapitalize="words"
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={() => void create()}
          placeholderTextColor={c.placeholder}
          style={[
            formStyles.input,
            { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text },
            errorBorder(c, nameError),
          ]}
          {...invalidProps(nameError)}
        />
        {nameError ? (
          <FieldError message={nameError} />
        ) : (
          <Text style={{ marginTop: 10, fontSize: 12, lineHeight: 16, color: isAtLimit ? c.loss : c.textMuted }}>
            {isAtLimit
              ? `You own ${MAX_OWNED_GROUPS} of ${MAX_OWNED_GROUPS} groups. Delete one to create another.`
              : `You own ${ownedCount} of ${MAX_OWNED_GROUPS} groups`}
          </Text>
        )}
      </View>
    </ModalShell>
  );
}
