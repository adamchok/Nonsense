import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatSignedCurrency } from '@/lib/currency-format';
import {
  addFriend,
  deleteGroup,
  getFriendLeaderboard,
  getGroupLeaderboard,
  lookupPlayerByRefCode,
  removeFriend,
  subscribeFriends,
  subscribeGroupMembers,
  subscribeGroups,
} from '@/lib/firestore';
import type { FriendRecord, GroupMember, PokerGroup } from '@/types';

type LeaderboardEntry = { playerId: string; name: string; avatarEmoji?: string; totalProfit: number };
type FriendsSectionTab = 'friends' | 'leaderboard' | 'groups';

export default function FriendsScreen() {
  const c = useAppColors();
  const router = useRouter();
  const { user, playerProfile } = useAuth();
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [refCodeInput, setRefCodeInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(false);

  const [groups, setGroups] = useState<PokerGroup[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupLeaderboard, setGroupLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [groupLbLoading, setGroupLbLoading] = useState(false);
  const [groupLeaderboardModalGroup, setGroupLeaderboardModalGroup] = useState<PokerGroup | null>(null);
  const [showGroupLeaderboardModal, setShowGroupLeaderboardModal] = useState(false);
  const [activeTab, setActiveTab] = useState<FriendsSectionTab>('friends');

  useEffect(() => {
    if (!user) return;
    return subscribeFriends(user.uid, setFriends, (e) =>
      console.error('Friends subscription error:', e)
    );
  }, [user]);

  useEffect(() => {
    if (!user || friends.length === 0) {
      setLeaderboard([]);
      return;
    }
    let cancelled = false;
    setLbLoading(true);
    getFriendLeaderboard(user.uid)
      .then((lb) => {
        if (!cancelled) setLeaderboard(lb);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, friends]);

  useEffect(() => {
    if (!user) return;
    return subscribeGroups(user.uid, setGroups, (e) =>
      console.error('Groups subscription error:', e)
    );
  }, [user]);

  useEffect(() => {
    if (!user || !expandedGroupId) {
      setGroupMembers([]);
      return;
    }
    return subscribeGroupMembers(
      user.uid,
      expandedGroupId,
      setGroupMembers,
      (e) => console.error('Group members error:', e)
    );
  }, [user, expandedGroupId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!user || !expandedGroupId) {
        setGroupLeaderboard([]);
        setGroupLbLoading(false);
        return;
      }
      setGroupLbLoading(true);
      try {
        const lb = await getGroupLeaderboard(user.uid, expandedGroupId);
        if (!cancelled) setGroupLeaderboard(lb);
      } catch {
        if (!cancelled) setGroupLeaderboard([]);
      } finally {
        if (!cancelled) setGroupLbLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [user, expandedGroupId]);

  function handleDeleteGroup(groupId: string, groupName: string) {
    if (!user) return;
    Alert.alert(`Delete "${groupName}"?`, 'This group and all its members will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (expandedGroupId === groupId) setExpandedGroupId(null);
            await deleteGroup(user.uid, groupId);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete group.');
          }
        },
      },
    ]);
  }

  async function handleAddFriend() {
    if (!user || !refCodeInput.trim()) return;
    const code = refCodeInput.trim().toUpperCase();

    if (code === playerProfile?.refCode) {
      Alert.alert('Oops', "That's your own code!");
      return;
    }

    const existing = friends.find(
      (f) => f.playerId === code || f.name.toUpperCase() === code
    );
    if (existing) {
      Alert.alert('Already friends', `You're already friends with ${existing.name}.`);
      return;
    }

    try {
      setAdding(true);
      const found = await lookupPlayerByRefCode(code);
      if (!found) {
        Alert.alert('Not found', 'No player found with that code.');
        return;
      }
      if (friends.some((f) => f.playerId === found.id)) {
        Alert.alert('Already friends', `You're already friends with ${found.name}.`);
        return;
      }
      await addFriend(user.uid, found);
      setRefCodeInput('');
      setShowAddModal(false);
      Alert.alert('Added!', `${found.name} has been added to your friends.`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add friend.');
    } finally {
      setAdding(false);
    }
  }

  function handleRemoveFriend(friendId: string, friendName: string) {
    if (!user) return;
    Alert.alert(`Remove ${friendName}?`, 'They will also be removed from your friends list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeFriend(user.uid, friendId);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove friend.');
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: c.text }]}>Friends</Text>

      <View style={styles.tabsRow}>
        {(['friends', 'groups', 'leaderboard'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.tabBtn,
              { backgroundColor: c.card, borderColor: c.border },
              activeTab === tab && [styles.tabBtnActive, { borderColor: c.borderAccent }],
            ]}
            onPress={() => setActiveTab(tab)}>
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === tab ? c.text : c.textMuted },
              ]}>
              {tab === 'friends' ? 'Friends' : tab === 'leaderboard' ? 'Leaderboard' : 'Groups'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ---- Friends tab ---- */}
      {activeTab === 'friends' && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              Friends ({friends.length})
            </Text>
            <View style={styles.addBtnGroup}>
              <Pressable
                style={[styles.scanBtn, { backgroundColor: c.friendChipBg, borderColor: c.friendChipBorder }]}
                onPress={() => router.push('../qr-code?tab=scan')}>
                <MaterialIcons name="qr-code-scanner" size={20} color={c.blue} />
              </Pressable>
              <Pressable
                style={[styles.addBtn, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}
                onPress={() => setShowAddModal(true)}>
                <MaterialIcons name="person-add" size={20} color={c.profit} />
                <Text style={[styles.addBtnLabel, { color: c.profit }]}>Add</Text>
              </Pressable>
            </View>
          </View>

          {friends.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              No friends yet. Share your code or add someone with theirs!
            </Text>
          ) : (
            friends.map((item) => (
              <View
                key={item.playerId}
                style={[styles.friendRow, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendAvatar}>{item.avatarEmoji ?? '🙂'}</Text>
                  <Text style={[styles.friendName, { color: c.textSecondary }]}>{item.name}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => handleRemoveFriend(item.playerId, item.name)}>
                  <MaterialIcons name="close" size={20} color={c.textHint} />
                </Pressable>
              </View>
            ))
          )}
        </>
      )}

      {/* ---- Groups tab ---- */}
      {activeTab === 'groups' && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              My Groups ({groups.length})
            </Text>
            <Pressable
              style={[styles.addBtn, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}
              onPress={() => router.push('../group/new')}>
              <MaterialIcons name="group-add" size={20} color={c.profit} />
              <Text style={[styles.addBtnLabel, { color: c.profit }]}>New</Text>
            </Pressable>
          </View>

          {groups.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              Create a group to quickly start sessions with your regular players.
            </Text>
          ) : (
            groups.map((group) => {
              const isExpanded = expandedGroupId === group.id;

              return (
                <View
                  key={group.id}
                  style={[styles.groupCard, { backgroundColor: c.card, borderColor: isExpanded ? c.borderAccent : c.border }]}>
                  <Pressable
                    style={styles.groupHeader}
                    onPress={() => setExpandedGroupId(isExpanded ? null : group.id)}>
                    <View style={styles.groupHeaderLeft}>
                      <MaterialIcons name="group" size={20} color={c.textMuted} />
                      <Text style={[styles.groupName, { color: c.text }]}>{group.name}</Text>
                      {isExpanded && (
                        <Text style={[styles.groupCount, { color: c.textHint }]}>
                          {groupMembers.length} {groupMembers.length === 1 ? 'player' : 'players'}
                        </Text>
                      )}
                    </View>
                    <View style={styles.groupHeaderRight}>
                      <Pressable hitSlop={8} onPress={() => handleDeleteGroup(group.id, group.name)}>
                        <MaterialIcons name="delete-outline" size={20} color={c.textHint} />
                      </Pressable>
                      <MaterialIcons
                        name={isExpanded ? 'expand-less' : 'expand-more'}
                        size={22}
                        color={c.textMuted}
                      />
                    </View>
                  </Pressable>

                  {isExpanded && (
                    <View style={styles.groupBody}>
                      {groupMembers.length === 0 ? (
                        <Text style={[styles.groupEmpty, { color: c.textHint }]}>
                          No members yet. Tap below to add players.
                        </Text>
                      ) : (
                        <ScrollView
                          style={styles.groupMembersScroll}
                          showsVerticalScrollIndicator={false}
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="handled">
                          {groupMembers.map((member) => (
                            <View
                              key={member.id}
                              style={[styles.memberRow, { borderColor: c.border }]}>
                              <View style={styles.memberInfo}>
                                <MaterialIcons
                                  name={member.isRegistered ? 'person' : 'person-outline'}
                                  size={18}
                                  color={c.textMuted}
                                />
                                <Text style={[styles.memberName, { color: c.textSecondary }]}>
                                  {member.id === playerProfile?.id
                                    ? (playerProfile?.name ?? member.name)
                                    : member.name}
                                  {member.id === playerProfile?.id ? ' (You)' : ''}
                                </Text>
                                {!member.isRegistered && (
                                  <Text style={[styles.guestBadge, { color: c.textHint }]}>Guest</Text>
                                )}
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      )}
                      <View style={styles.groupActionsRow}>
                        <Pressable
                          style={[
                            styles.manageBtn,
                            { backgroundColor: c.accentBg, borderColor: c.accentBorder },
                          ]}
                          onPress={() => router.push(`../group/${group.id}/members`)}>
                          <MaterialIcons name="edit" size={16} color={c.profit} />
                          <Text style={[styles.manageBtnLabel, { color: c.profit }]}>Manage Members</Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.manageBtn,
                            { backgroundColor: c.blueBg, borderColor: c.blueBorder },
                          ]}
                          onPress={() => {
                            setGroupLeaderboardModalGroup(group);
                            setShowGroupLeaderboardModal(true);
                          }}>
                          <MaterialIcons name="leaderboard" size={16} color={c.blue} />
                          <Text style={[styles.manageBtnLabel, { color: c.blue }]}>Leaderboard</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </>
      )}

            {/* ---- Leaderboard tab ---- */}
            {activeTab === 'leaderboard' && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Leaderboard</Text>
          </View>
          {lbLoading ? (
            <Text style={[styles.emptyText, { color: c.textMuted }]}>Calculating...</Text>
          ) : leaderboard.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No session results yet.</Text>
          ) : (
            leaderboard.map((entry, idx) => {
              const isMe = entry.playerId === user?.uid;
              return (
                <View
                  key={entry.playerId}
                  style={[styles.lbRow, { backgroundColor: c.card, borderColor: isMe ? c.borderAccent : c.border }]}>
                  <View style={styles.lbLeft}>
                    <Text style={[styles.lbRank, { color: c.textMuted }]}>#{idx + 1}</Text>
                    <Text style={styles.lbAvatar}>{entry.avatarEmoji ?? '🙂'}</Text>
                    <Text style={[styles.lbName, { color: isMe ? c.text : c.textSecondary }]}>
                      {entry.name}{isMe ? ' (You)' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.lbProfit, { color: entry.totalProfit >= 0 ? c.profit : c.loss }]}>
                    {formatSignedCurrency(entry.totalProfit)}
                  </Text>
                </View>
              );
            })
          )}
        </>
      )}

      {/* ---- Add Friend Modal ---- */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={() => setShowAddModal(false)}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <View style={[styles.addCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.addCardTitle, { color: c.text }]}>Add Friend</Text>
              <Text style={[styles.addCardSub, { color: c.textMuted }]}>
                Enter their 6-character ref code
              </Text>
              <TextInput
                value={refCodeInput}
                onChangeText={(t) => setRefCodeInput(t.toUpperCase())}
                placeholder="e.g. A3X7KP"
                placeholderTextColor={c.placeholder}
                maxLength={6}
                autoCapitalize="characters"
                autoFocus
                style={[styles.codeInput, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
              />
              <View style={styles.addCardActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => { setShowAddModal(false); setRefCodeInput(''); }}>
                  <Text style={[styles.cancelLabel, { color: c.lossLight }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.confirmBtn,
                    { backgroundColor: c.accent },
                    (adding || refCodeInput.trim().length < 6) && styles.disabled,
                  ]}
                  onPress={handleAddFriend}
                  disabled={adding || refCodeInput.trim().length < 6}>
                  <Text style={[styles.confirmLabel, { color: '#fff' }]}>
                    {adding ? 'Adding...' : 'Add Friend'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---- Group Leaderboard Modal ---- */}
      <Modal
        visible={showGroupLeaderboardModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowGroupLeaderboardModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={() => setShowGroupLeaderboardModal(false)}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <View
              style={[
                styles.leaderboardCard,
                { backgroundColor: c.card, borderColor: c.border },
              ]}>
              <View style={styles.leaderboardHeaderRow}>
                <Text style={[styles.leaderboardTitle, { color: c.text }]}>
                  {groupLeaderboardModalGroup?.name ? `${groupLeaderboardModalGroup.name} Leaderboard` : 'Leaderboard'}
                </Text>
                <Pressable
                  onPress={() => setShowGroupLeaderboardModal(false)}
                  hitSlop={10}>
                  <MaterialIcons name="close" size={20} color={c.textHint} />
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.leaderboardBody}>
                {groupLbLoading ? (
                  <Text style={{ color: c.textMuted }}>Calculating...</Text>
                ) : groupLeaderboard.length === 0 ? (
                  <Text style={{ color: c.textMuted }}>No results yet.</Text>
                ) : (
                  groupLeaderboard.map((entry, idx) => {
                    const isMe = entry.playerId === user?.uid;
                    return (
                      <View
                        key={entry.playerId}
                        style={[
                          styles.lbRow,
                          { backgroundColor: c.card, borderColor: isMe ? c.borderAccent : c.border },
                        ]}>
                        <View style={styles.lbLeft}>
                          <Text style={[styles.lbRank, { color: c.textMuted }]}>#{idx + 1}</Text>
                          <Text style={styles.lbAvatar}>{entry.avatarEmoji ?? '🙂'}</Text>
                          <Text style={[styles.lbName, { color: isMe ? c.text : c.textSecondary }]}>
                            {entry.name}
                            {isMe ? ' (You)' : ''}
                          </Text>
                        </View>
                        <Text style={[styles.lbProfit, { color: entry.totalProfit >= 0 ? c.profit : c.loss }]}>
                          {formatSignedCurrency(entry.totalProfit)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabBtnActive: {
    borderWidth: 1.5,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15,
  },
  addBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 35,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  addBtnLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 16,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  friendName: {
    fontWeight: '600',
    fontSize: 15,
  },
  friendAvatar: {
    fontSize: 20,
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 3,
  },
  lbLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lbRank: {
    fontWeight: '700',
    fontSize: 14,
    width: 28,
  },
  lbName: {
    fontWeight: '600',
    fontSize: 15,
  },
  lbAvatar: {
    fontSize: 18,
  },
  lbProfit: {
    fontWeight: '700',
    fontSize: 15,
  },
  groupCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  groupName: {
    fontWeight: '600',
    fontSize: 15,
  },
  groupCount: {
    fontSize: 12,
  },
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  groupEmpty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 4,
  },
  groupLeaderboardSection: {
    gap: 8,
    marginTop: 8,
  },
  groupSectionTitleSmall: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  memberName: {
    fontWeight: '500',
    fontSize: 14,
  },
  guestBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  manageBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  manageBtnLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  groupActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  groupMembersScroll: {
    maxHeight: 200,
  },
  modalRoot: {
    flex: 1,
  },
  modalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  addCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  addCardTitle: {
    fontWeight: '700',
    fontSize: 18,
  },
  addCardSub: {
    fontSize: 13,
  },
  codeInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  addCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cancelLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  confirmLabel: {
    fontWeight: '700',
    fontSize: 14,
  },
  disabled: {
    opacity: 0.4,
  },
  scannerScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scannerCloseBtn: {
    padding: 4,
  },
  scannerBody: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 220,
    height: 220,
    borderWidth: 2,
    borderColor: 'rgba(96,165,250,0.6)',
    borderRadius: 16,
  },
  scannerHint: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  leaderboardCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  leaderboardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leaderboardTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  leaderboardBody: {
    gap: 8,
    paddingBottom: 6,
  },
});
