import { Icon } from '@/components/icon';
import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { createGroup } from '@/lib/firestore';
import { userMessage } from '@/lib/user-message';
import { useId, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

const MIN_NAME_LEN = 2;
const MAX_OWNED_GROUPS = 10;

type Props = { onClose: () => void; ownedCount: number; onCreated: (groupId: string) => void };

export function NewGroupModal({ onClose, ownedCount, onCreated }: Props) {
  const c = useAppColors();
  const { playerProfile } = useAuth();
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const trimmed = name.trim();
  const isAtLimit = ownedCount >= MAX_OWNED_GROUPS;
  const limitMessage = `You own ${MAX_OWNED_GROUPS} of ${MAX_OWNED_GROUPS} groups. Delete one to create another.`;
  const errorId = `${useId()}-group-name-error`;

  async function create() {
    if (!playerProfile || isSaving) return;
    if (isAtLimit) {
      setNameError(limitMessage);
      return;
    }
    if (trimmed.length < MIN_NAME_LEN) {
      setNameError(trimmed ? `Use at least ${MIN_NAME_LEN} characters` : 'Enter a group name');
      return;
    }
    setIsSaving(true);
    try {
      const groupId = await createGroup(playerProfile.id, trimmed);
      onCreated(groupId);
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
      titleIcon={{ name: 'group', color: c.textMuted }}
      primary={{ label: 'Create', onPress: () => void create(), busy: isSaving, icon: 'add' }}>
      <View>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            setNameError(null);
          }}
          placeholder="Friday Boys"
          accessibilityLabel="Group name"
          autoFocus={Platform.OS !== 'web'}
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
          {...invalidProps(nameError, errorId)}
        />
        <FieldError message={nameError} nativeID={errorId} />
        {nameError ? null : (
          // One line: muted label, bold count (red once the allowance is used up).
          <View style={styles.usage}>
            <Icon name={isAtLimit ? 'error-outline' : 'group'} size={14} color={isAtLimit ? c.loss : c.textMuted} />
            <Text style={[styles.usageLabel, { color: isAtLimit ? c.loss : c.textMuted }]}>
              {isAtLimit ? 'Limit reached. Delete a group to create another' : 'Groups you own'}
              {isAtLimit ? null : (
                <Text style={[styles.usageCount, { color: c.text }]}>
                  {'  '}
                  {ownedCount} / {MAX_OWNED_GROUPS}
                </Text>
              )}
            </Text>
          </View>
        )}
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  usage: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  usageLabel: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  usageCount: { fontWeight: '700', fontVariant: ['tabular-nums'] },
});
