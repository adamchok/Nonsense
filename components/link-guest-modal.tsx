import { FieldError } from '@/components/field-error';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { ModalShell } from '@/components/session/modal-shell';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { requestGuestLink } from '@/lib/guest-links';
import { pressBg, text } from '@/lib/ui';
import { userMessage } from '@/lib/user-message';
import type { FriendRecord, GroupMember, PlayerProfile } from '@/types';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  guest: GroupMember;
  owner: PlayerProfile;
  friends: FriendRecord[];
  onClose: () => void;
};

export function LinkGuestModal({ guest, owner, friends, onClose }: Props) {
  const c = useAppColors();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const selected = friends.find((f) => f.playerId === selectedId) ?? null;

  async function send() {
    if (isSending) return;
    if (!selected) {
      setError('Pick a friend first');
      return;
    }
    setIsSending(true);
    try {
      await requestGuestLink({
        ownerId: owner.id,
        ownerName: owner.name,
        guestId: guest.id,
        guestName: guest.name,
        targetId: selected.playerId,
        targetName: selected.name,
      });
      onClose();
    } catch (e) {
      appAlert('Unable to send request', userMessage(e, 'Please try again.'));
      setIsSending(false);
    }
  }

  return (
    <ModalShell
      visible
      onClose={onClose}
      title={`Link ${guest.name} to a friend`}
      avoidKeyboard={false}
      primary={{
        label: 'Send request',
        onPress: () => void send(),
        disabled: friends.length === 0,
        busy: isSending,
        busyLabel: 'Sending request',
      }}>
      <Text style={[styles.sub, { color: c.textMuted }]}>
        Once they accept, {guest.name}’s past sessions you hosted move to their account.
      </Text>
      {friends.length === 0 ? (
        <Text style={[styles.empty, { color: c.textHint }]}>Add a friend first, then link {guest.name} to them.</Text>
      ) : (
        <View>
          <ScrollView
            style={[styles.list, { borderColor: c.border }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="Friends">
            {friends.map((f, i) => {
              const isSelected = f.playerId === selectedId;
              return (
                <PressableScale
                  key={f.playerId}
                  pressedScale={0.99}
                  style={(state) => [
                    styles.row,
                    i > 0 && [styles.rowDivider, { borderTopColor: c.border }],
                    pressBg(c, state, isSelected ? c.accentBg : undefined),
                  ]}
                  onPress={() => {
                    setSelectedId(f.playerId);
                    setError(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={f.name}
                  accessibilityState={{ checked: isSelected }}>
                  <View style={[styles.avatarTile, { backgroundColor: c.cardAlt }]}>
                    <Text style={styles.avatar}>{f.avatarEmoji ?? '🙂'}</Text>
                  </View>
                  <Text style={[text.rowTitle, styles.name, { color: c.text }]} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {isSelected ? <Icon name="check" size={18} color={c.accentText} /> : null}
                </PressableScale>
              );
            })}
          </ScrollView>
          <FieldError message={error} />
        </View>
      )}
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  sub: {
    fontSize: 14,
    lineHeight: 20,
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    maxHeight: 320,
    borderWidth: 1,
    borderRadius: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  avatarTile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    fontSize: 17,
    lineHeight: 22,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
});
