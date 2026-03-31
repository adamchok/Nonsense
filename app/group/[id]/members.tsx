import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  addGroupMember,
  removeGroupMember,
  subscribeFriends,
  subscribeGroups,
  subscribeGroupMembers,
} from '@/lib/firestore';
import type { FriendRecord, GroupMember, PokerGroup } from '@/types';

export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useAppColors();
  const { user, playerProfile } = useAuth();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [guestName, setGuestName] = useState('');
  const [groupName, setGroupName] = useState<string | null>(null);

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
    if (!user || !id) return;
    try {
      await addGroupMember(user.uid, id, {
        id: friend.playerId,
        name: friend.name,
        isRegistered: true,
      });
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Failed to add member.');
    }
  }

  async function handleAddSelf() {
    if (!user || !id || !playerProfile) return;
    try {
      await addGroupMember(user.uid, id, {
        id: playerProfile.id,
        name: playerProfile.name,
        isRegistered: true,
      });
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Failed to add yourself.');
    }
  }

  async function handleAddGuest() {
    if (!user || !id || !guestName.trim()) return;
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
      appAlert('Error', e instanceof Error ? e.message : 'Failed to add guest.');
    }
  }

  async function handleRemove(memberId: string) {
    if (!user || !id) return;
    try {
      await removeGroupMember(user.uid, id, memberId);
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Failed to remove member.');
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: c.bg }]}>
      <Stack.Screen
        options={{
          title: groupName ?? 'Group Members',
          headerBackTitle: 'Back',
        }}
      />

      <View style={styles.content}>
        <Text style={[styles.heading, { color: c.text }]}>Add members</Text>
        <Text style={[styles.hint, { color: c.textMuted }]}>
          Tap a friend to add them, or type a guest name below.
        </Text>

        {/* Quick-add chips */}
        {(friendsNotInGroup.length > 0 || !selfInGroup) && (
          <View style={styles.chipsSection}>
            <Text style={[styles.chipsSectionLabel, { color: c.textHint }]}>QUICK ADD</Text>
            <View style={styles.chipsWrap}>
              {playerProfile && !selfInGroup && (
                <Pressable
                  style={[styles.chip, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}
                  onPress={handleAddSelf}>
                  <MaterialIcons name="person" size={16} color={c.profit} />
                  <Text style={[styles.chipText, { color: c.profit }]}>Me ({playerProfile.name})</Text>
                </Pressable>
              )}
              {friendsNotInGroup.map((f) => (
                <Pressable
                  key={f.playerId}
                  style={[styles.chip, { backgroundColor: c.friendChipBg, borderColor: c.friendChipBorder }]}
                  onPress={() => handleAddFriend(f)}>
                  <MaterialIcons name="person-add" size={14} color={c.blue} />
                  <Text style={[styles.chipText, { color: c.blue }]}>{f.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Guest input */}
        <View style={styles.guestSection}>
          <Text style={[styles.chipsSectionLabel, { color: c.textHint }]}>ADD GUEST</Text>
          <View style={styles.guestRow}>
            <TextInput
              value={guestName}
              onChangeText={setGuestName}
              placeholder="Guest name"
              placeholderTextColor={c.placeholder}
              style={[styles.guestInput, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
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
              disabled={!guestName.trim()}>
              <Text style={styles.guestAddLabel}>Add</Text>
            </Pressable>
          </View>
        </View>

        {/* Member list */}
        <View style={styles.membersSection}>
          <Text style={[styles.chipsSectionLabel, { color: c.textHint }]}>
            MEMBERS ({members.length})
          </Text>
          {members.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              No members yet. Add some above.
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
                    <MaterialIcons
                      name={member.isRegistered ? 'person' : 'person-outline'}
                      size={20}
                      color={c.textMuted}
                    />
                    <Text style={[styles.memberName, { color: c.text }]}>
                      {member.id === playerProfile?.id
                        ? (playerProfile?.name ?? member.name)
                        : member.name}
                      {member.id === playerProfile?.id ? ' (You)' : ''}
                    </Text>
                    {!member.isRegistered && (
                      <View style={[styles.guestBadge, { backgroundColor: c.chipBg }]}>
                        <Text style={[styles.guestBadgeText, { color: c.textHint }]}>Guest</Text>
                      </View>
                    )}
                  </View>
                  <Pressable hitSlop={10} onPress={() => handleRemove(member.id)}>
                    <MaterialIcons name="close" size={20} color={c.textHint} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <Pressable
          style={[styles.doneBtn, { backgroundColor: c.accent }]}
          onPress={() => router.back()}>
          <Text style={styles.doneLabel}>Done</Text>
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
    padding: 20,
    gap: 18,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
  },
  hint: {
    fontSize: 14,
  },
  chipsSection: {
    gap: 8,
  },
  chipsSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
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
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 8,
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
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  guestAddBtn: {
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestAddLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
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
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 4,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
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
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
  },
  doneLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
