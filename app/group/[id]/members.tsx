import { EmptyState } from '@/components/empty-state';
import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
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
import { Animated, PressableScale, fadeIn, fadeOut, layoutTransition, listItemEntering } from '@/components/motion';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { userMessage } from '@/lib/user-message';

const INITIAL_STAGGER_WINDOW_MS = 600;

export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useAppColors();
  const { user, playerProfile } = useAuth();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [guestName, setGuestName] = useState('');
  const [guestError, setGuestError] = useState<string | null>(null);
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

  // Stagger only the first batch of rows; members added later animate in without a delay.
  const hasMembers = members.length > 0;
  const [initialStagger, setInitialStagger] = useState(true);
  useEffect(() => {
    if (!hasMembers) return;
    const t = setTimeout(() => setInitialStagger(false), INITIAL_STAGGER_WINDOW_MS);
    return () => clearTimeout(t);
  }, [hasMembers]);

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
      setGuestError(`${name} is already a member`);
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

  const canAddGuest = guestName.trim().length > 0;
  const showQuickAdd = isOwner && (friendsNotInGroup.length > 0 || (playerProfile && !selfInGroup));

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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!isOwner ? (
          <Text style={[styles.ownerNote, { color: c.textMuted }]}>
            Only the group owner can add or remove people.
          </Text>
        ) : (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.cardHeader}>
              <Icon name="person-add" size={20} color={c.textMuted} />
              <Text style={[styles.cardTitle, { color: c.text }]}>Add players</Text>
            </View>

            {showQuickAdd ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Friends</Text>
                <View style={styles.chipsWrap}>
                  {playerProfile && !selfInGroup && (
                    <Animated.View key="self" entering={fadeIn} exiting={fadeOut} layout={layoutTransition}>
                      <PressableScale
                        style={[styles.chip, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Add me (${playerProfile.name})`}
                        onPress={handleAddSelf}>
                        <Icon name="add" size={16} color={c.accentText} />
                        <Text style={[styles.chipText, { color: c.accentText }]}>Me</Text>
                      </PressableScale>
                    </Animated.View>
                  )}
                  {friendsNotInGroup.map((f) => (
                    <Animated.View key={f.playerId} entering={fadeIn} exiting={fadeOut} layout={layoutTransition}>
                      <PressableScale
                        style={[styles.chip, { backgroundColor: c.cardAlt, borderColor: c.border }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${f.name}`}
                        onPress={() => handleAddFriend(f)}>
                        <Icon name="add" size={16} color={c.textMuted} />
                        <Text style={[styles.chipText, { color: c.text }]}>{f.name}</Text>
                      </PressableScale>
                    </Animated.View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Guest</Text>
              <View style={styles.guestRow}>
                <TextInput
                  value={guestName}
                  onChangeText={(t) => {
                    setGuestName(t);
                    setGuestError(null);
                  }}
                  placeholder="Name"
                  accessibilityLabel="Guest name"
                  placeholderTextColor={c.placeholder}
                  style={[
                    styles.guestInput,
                    { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text },
                    errorBorder(c, guestError),
                  ]}
                  {...invalidProps(guestError)}
                  returnKeyType="done"
                  onSubmitEditing={handleAddGuest}
                />
                <PressableScale
                  style={[styles.guestAddBtn, { backgroundColor: c.accent }, !canAddGuest && styles.disabled]}
                  onPress={handleAddGuest}
                  disabled={!canAddGuest}
                  accessibilityRole="button"
                  accessibilityLabel="Add guest"
                  accessibilityState={{ disabled: !canAddGuest }}>
                  <Icon name="add" size={18} color={c.onAccent} />
                  <Text style={[styles.guestAddLabel, { color: c.onAccent }]}>Add</Text>
                </PressableScale>
              </View>
              <FieldError message={guestError} />
            </View>
          </View>
        )}

        <View style={[styles.card, styles.membersCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.cardHeader, styles.membersHeader]}>
            <Icon name="group" size={20} color={c.textMuted} />
            <Text style={[styles.cardTitle, { color: c.text }]}>Members</Text>
            <View style={[styles.countPill, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
              <Text style={[styles.countText, { color: c.textMuted }]}>{members.length}</Text>
            </View>
          </View>
          {members.length === 0 ? (
            <EmptyState
              compact
              icon="people"
              title="No members yet"
              message={isOwner ? 'Add friends or guests above.' : 'The owner hasn’t added anyone yet.'}
            />
          ) : (
            members.map((member, i) => (
              <Animated.View
                key={member.id}
                entering={listItemEntering(initialStagger ? i : 0)}
                exiting={fadeOut}
                layout={layoutTransition}
                style={[styles.memberRow, { borderTopColor: c.border }]}>
                <View style={styles.memberInfo}>
                  <GroupMemberAvatar member={member} viewerProfile={playerProfile} />
                  <Text style={[styles.memberName, { color: c.text }]} numberOfLines={1}>
                    {member.id === playerProfile?.id ? (playerProfile?.name ?? member.name) : member.name}
                    {member.id === playerProfile?.id ? ' (You)' : ''}
                  </Text>
                  {!member.isRegistered && (
                    <View style={[styles.guestBadge, { backgroundColor: c.chipBg }]}>
                      <Text style={[styles.guestBadgeText, { color: c.chipText }]}>GUEST</Text>
                    </View>
                  )}
                </View>
                {isOwner ? (
                  <PressableScale
                    pressedScale={0.9}
                    style={styles.removeBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${member.name} from group`}
                    onPress={() => handleRemove(member.id, member.name)}>
                    <Icon name="close" size={18} color={c.textHint} />
                  </PressableScale>
                ) : null}
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.bg }]}>
        <PressableScale
          style={[styles.doneBtn, { backgroundColor: c.accent }]}
          accessibilityRole="button"
          onPress={() => router.back()}>
          <Text style={[styles.doneLabel, { color: c.onAccent }]}>Done</Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  ownerNote: {
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 16,
  },
  membersCard: {
    paddingBottom: 4,
    gap: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  membersHeader: {
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  countPill: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
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
    paddingLeft: 12,
    paddingRight: 14,
  },
  chipText: {
    fontWeight: '600',
    fontSize: 14,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  guestAddLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    flexShrink: 1,
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
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  doneBtn: {
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
