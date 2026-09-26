import { GroupMemberAvatar } from '@/components/group-member-avatar';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  addGroupMember,
  removeGroupMember,
  subscribeFriends,
  subscribeGroupMembers,
  subscribeGroups,
} from '@/lib/firestore';
import type { FriendRecord, GroupMember, PokerGroup } from '@/types';
import { Icon } from '@/components/icon';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { userMessage } from '@/lib/user-message';

export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useAppColors();
  const { user, playerProfile } = useAuth();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [guestName, setGuestName] = useState('');
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupMeta, setGroupMeta] = useState<PokerGroup | null>(null);

  const isOwner = Boolean(
    user && groupMeta && (groupMeta.ownerId === user.uid || groupMeta.myRole === 'owner')
  );

  useEffect(() => {
    if (!user || !id) return;
    return subscribeGroupMembers(user.uid, id, setMembers, (e) =>
      console.error('Group members error:', e)
    );
  }, [user, id]);

  useEffect(() => {
    if (!user || !id) return;
    return subscribeGroups(
      user.uid,
      (groups: PokerGroup[]) => {
        const match = groups.find((g) => g.id === id);
        setGroupMeta(match ?? null);
        setGroupName(match?.name ?? null);
      },
      (e) => console.error('Groups error:', e)
    );
  }, [user, id]);

  useEffect(() => {
    if (!user) return;
    return subscribeFriends(user.uid, setFriends, () => {});
  }, [user]);

  const friendsNotInGroup = friends.filter(
    (f) => !members.some((m) => m.id === f.playerId)
  );
  const selfInGroup = playerProfile
    ? members.some((m) => m.id === playerProfile.id)
    : true;

  async function handleAddFriend(friend: FriendRecord) {
    if (!user || !id || !isOwner) return;
    try {
      await addGroupMember(user.uid, id, {
        id: friend.playerId,
        name: friend.name,
        isRegistered: true,
        avatarEmoji: friend.avatarEmoji,
      });
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to add member.'));
    }
  }

  async function handleAddSelf() {
    if (!user || !id || !playerProfile || !isOwner) return;
    try {
      await addGroupMember(user.uid, id, {
        id: playerProfile.id,
        name: playerProfile.name,
        isRegistered: true,
        avatarEmoji: playerProfile.avatarEmoji,
      });
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to add yourself.'));
    }
  }

  async function handleAddGuest() {
    if (!user || !id || !guestName.trim() || !isOwner) return;
    const name = guestName.trim();
    const memberId = name.toLowerCase().replace(/\s+/g, '_');
    if (members.some((m) => m.id === memberId)) {
      appAlert('Already in group', `${name} is already a member.`);
      return;
    }
    try {
      await addGroupMember(user.uid, id, { id: memberId, name, isRegistered: false });
      setGuestName('');
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to add guest.'));
    }
  }

  function handleRemove(memberId: string, memberName: string) {
    if (!user || !id || !isOwner) return;
    const uid = user.uid;
    appAlert(`Remove ${memberName}?`, 'They will be removed from this group. You can add them again later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await removeGroupMember(uid, id, memberId);
            } catch (e) {
              appAlert('Error', userMessage(e, 'Failed to remove member.'));
            }
          })();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: groupName ?? 'Group Members',
          headerBackTitle: 'Back',
        }}
      />

      <View style={styles.content}>
        <Text style={[styles.heading, { color: c.text }]}>
          {isOwner ? 'Add members' : 'Members'}
        </Text>
        <Text style={[styles.hint, { color: c.textMuted }]}>
          {isOwner
            ? 'Tap a friend to add them, or type a guest name below.'
            : 'Only the group owner can add or remove people. You can review who is in this group.'}
        </Text>

        {/* Quick-add chips */}
        {isOwner && (friendsNotInGroup.length > 0 || !selfInGroup) && (
          <View style={styles.chipsSection}>
            <Text style={[styles.chipsSectionLabel, { color: c.textHint }]}>QUICK ADD</Text>
            <View style={styles.chipsWrap}>
              {playerProfile && !selfInGroup && (
                <Pressable
                  style={[styles.chip, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add me (${playerProfile.name})`}
                  onPress={handleAddSelf}>
                  <Icon name="person" size={16} color={c.accentText} />
                  <Text style={[styles.chipText, { color: c.accentText }]}>Me ({playerProfile.name})</Text>
                </Pressable>
              )}
              {friendsNotInGroup.map((f) => (
                <Pressable
                  key={f.playerId}
                  style={[styles.chip, { backgroundColor: c.friendChipBg, borderColor: c.friendChipBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${f.name}`}
                  onPress={() => handleAddFriend(f)}>
                  <Icon name="person-add" size={14} color={c.blue} />
                  <Text style={[styles.chipText, { color: c.blue }]}>{f.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Guest input */}
        {isOwner ? (
        <View style={styles.guestSection}>
          <Text style={[styles.chipsSectionLabel, { color: c.textHint }]}>ADD GUEST</Text>
          <View style={styles.guestRow}>
            <TextInput
              value={guestName}
              onChangeText={setGuestName}
              placeholder="Guest name"
              accessibilityLabel="Guest name"
              placeholderTextColor={c.placeholder}
              style={[styles.guestInput, { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text }]}
              returnKeyType="done"
              onSubmitEditing={handleAddGuest}
            />
            <Pressable
              style={[
                styles.guestAddBtn,
                { backgroundColor: c.accent },
                !guestName.trim() && styles.disabled,
              ]}
              onPress={handleAddGuest}
              disabled={!guestName.trim()}
              accessibilityRole="button"
              accessibilityLabel="Add guest"
              accessibilityState={{ disabled: !guestName.trim() }}>
              <Text style={[styles.guestAddLabel, { color: c.onAccent }]}>Add</Text>
            </Pressable>
          </View>
        </View>
        ) : null}

        {/* Member list */}
        <View style={styles.membersSection}>
          <Text style={[styles.chipsSectionLabel, { color: c.textHint }]}>
            MEMBERS ({members.length})
          </Text>
          {members.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              {isOwner ? 'No members yet. Add some above.' : 'No members in this group yet.'}
            </Text>
          ) : (
            <ScrollView
              style={styles.memberList}
              contentContainerStyle={styles.memberListContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator>
              {members.map((member) => (
                <View
                  key={member.id}
                  style={[styles.memberRow, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={styles.memberInfo}>
                    <GroupMemberAvatar member={member} viewerProfile={playerProfile} />
                    <Text style={[styles.memberName, { color: c.text }]}>
                      {member.id === playerProfile?.id
                        ? (playerProfile?.name ?? member.name)
                        : member.name}
                      {member.id === playerProfile?.id ? ' (You)' : ''}
                    </Text>
                    {!member.isRegistered && (
                      <View style={[styles.guestBadge, { backgroundColor: c.chipBg }]}>
                        <Text style={[styles.guestBadgeText, { color: c.chipText }]}>Guest</Text>
                      </View>
                    )}
                  </View>
                  {isOwner ? (
                    <Pressable
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${member.name} from group`}
                      onPress={() => handleRemove(member.id, member.name)}>
                      <Icon name="close" size={20} color={c.textHint} />
                    </Pressable>
                  ) : (
                    <View style={{ width: 20 }} />
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <Pressable
          style={[styles.doneBtn, { backgroundColor: c.accent }]}
          accessibilityRole="button"
          onPress={() => router.back()}>
          <Text style={[styles.doneLabel, { color: c.onAccent }]}>Done</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 24,
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
    marginTop: -16,
  },
  chipsSection: {
    gap: 8,
  },
  chipsSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  chipText: {
    fontWeight: '600',
    fontSize: 13,
  },
  guestSection: {
    gap: 8,
  },
  guestRow: {
    flexDirection: 'row',
    gap: 8,
  },
  guestInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  guestAddBtn: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  guestAddLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.4,
  },
  membersSection: {
    flex: 1,
    height: '55%',
    gap: 8,
  },
  memberList: {
    flex: 1,
  },
  memberListContent: {
    paddingBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontWeight: '600',
    fontSize: 15,
  },
  guestBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  guestBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  doneBtn: {
    marginTop: 8,
    marginBottom: 16,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  doneLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
});
