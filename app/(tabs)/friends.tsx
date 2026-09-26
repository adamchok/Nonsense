import { text } from '@/lib/ui';
import { ModalBackdrop } from '@/components/modal-backdrop';
import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { GroupMemberAvatar } from '@/components/group-member-avatar';
import { appAlert } from '@/lib/app-alert';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatSignedCurrency } from '@/lib/currency-format';
import { formatDateDMY } from '@/lib/date-format';
import {
  acceptFriendRequest,
  cancelOutgoingFriendRequest,
  declineFriendRequest,
  deleteGroup,
  fetchFriendsList,
  fetchGroupsList,
  fetchIncomingFriendRequests,
  fetchOutgoingFriendRequests,
  getFriendLeaderboard,
  getGroupLeaderboard,
  leaveGroup,
  lookupPlayerByRefCode,
  removeFriend,
  renameGroup,
  sendFriendRequest,
  subscribeFriends,
  subscribeGroupMembers,
  subscribeGroups,
  subscribeIncomingFriendRequests,
  subscribeOutgoingFriendRequests,
} from '@/lib/firestore';
import {
  acceptGuestLink,
  declineGuestLink,
  subscribeIncomingGuestLinks,
  type GuestLink,
} from '@/lib/guest-links';
import { scrollModalFieldToTop } from '@/lib/modal-keyboard-scroll';
import type { FriendRecord, FriendRequestRecord, GroupMember, PokerGroup } from '@/types';
import { Icon } from '@/components/icon';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { userMessage } from '@/lib/user-message';
import { SearchInput } from '@/components/search-input';
import { SegmentedTabs, type SegmentedTab } from '@/components/segmented-tabs';
import { EmptyState } from '@/components/empty-state';
import { Animated as Motion, PressableScale, fadeOut, layoutTransition, listItemEntering, webSafe } from '@/components/motion';
import { Keyframe, ReduceMotion, FadeIn } from 'react-native-reanimated';
import { NewGroupModal } from '@/components/new-group-modal';
import { Skeleton, SkeletonGroup } from '@/components/skeleton';

const menuEntering = webSafe(
  new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.96 }] },
    100: { opacity: 1, transform: [{ scale: 1 }] },
  })
    .duration(160)
    .reduceMotion(ReduceMotion.System),
  FadeIn.duration(160).reduceMotion(ReduceMotion.System),
);

const FRIENDS_TABS: readonly SegmentedTab<'friends' | 'groups' | 'leaderboard'>[] = [
  { key: 'friends', label: 'Friends', icon: 'people' },
  { key: 'groups', label: 'Groups', icon: 'groups' },
  { key: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
];

type LeaderboardEntry = { playerId: string; name: string; avatarEmoji?: string; totalProfit: number };
type FriendsSectionTab = 'friends' | 'leaderboard' | 'groups';
type LeaderboardSortKey = 'profit' | 'name';
type SortDirection = 'desc' | 'asc';

export default function FriendsScreen() {
  const c = useAppColors();
  const layout = usePageLayout(40);
  const router = useRouter();
  const { user, playerProfile } = useAuth();
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestRecord[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestRecord[]>([]);
  const [incomingGuestLinks, setIncomingGuestLinks] = useState<GuestLink[]>([]);
  const [busyGuestLinkId, setBusyGuestLinkId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [refCodeInput, setRefCodeInput] = useState('');
  const [refCodeError, setRefCodeError] = useState<string | null>(null);
  const addFriendScrollRef = useRef<ScrollView>(null);
  const [adding, setAdding] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(true);
  const [lbFailed, setLbFailed] = useState(false);

  const [groups, setGroups] = useState<PokerGroup[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupLeaderboard, setGroupLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [groupLbLoading, setGroupLbLoading] = useState(false);
  const [groupLbRefreshKey, setGroupLbRefreshKey] = useState(0);
  const [groupLeaderboardModalGroup, setGroupLeaderboardModalGroup] = useState<PokerGroup | null>(null);
  const [showGroupLeaderboardModal, setShowGroupLeaderboardModal] = useState(false);
  const [renameGroupTarget, setRenameGroupTarget] = useState<PokerGroup | null>(null);
  const [renameGroupName, setRenameGroupName] = useState('');
  const [renameGroupSaving, setRenameGroupSaving] = useState(false);
  const [renameGroupError, setRenameGroupError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FriendsSectionTab>('friends');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [showLeaderboardSortDropdown, setShowLeaderboardSortDropdown] = useState(false);
  const [leaderboardSortBy, setLeaderboardSortBy] = useState<LeaderboardSortKey>('profit');
  const [leaderboardSortDirection, setLeaderboardSortDirection] = useState<SortDirection>('desc');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSpin] = useState(() => new Animated.Value(0));

  const sortedLeaderboard = useMemo(() => {
    const next = [...leaderboard];
    const direction = leaderboardSortDirection === 'asc' ? 1 : -1;
    next.sort((a, b) => {
      if (leaderboardSortBy === 'name') {
        return a.name.localeCompare(b.name) * direction;
      }
      return (a.totalProfit - b.totalProfit) * direction;
    });
    return next;
  }, [leaderboard, leaderboardSortBy, leaderboardSortDirection]);
  // Leaderboard rows animate in only the first time each player is shown per
  // tab visit (not again when rows remount after a refresh).
  const lbRowsVisible = activeTab === 'leaderboard' && !lbLoading;
  const [lbEntering, setLbEntering] = useState(() => ({
    seen: new Set<string>() as ReadonlySet<string>,
    fresh: new Set<string>() as ReadonlySet<string>,
    visible: lbRowsVisible,
    list: sortedLeaderboard,
  }));
  if (lbEntering.visible !== lbRowsVisible || lbEntering.list !== sortedLeaderboard) {
    const ids = lbRowsVisible ? sortedLeaderboard.map((e) => e.playerId) : [];
    setLbEntering({
      seen: new Set([...lbEntering.seen, ...ids]),
      fresh: new Set(ids.filter((id) => !lbEntering.seen.has(id))),
      visible: lbRowsVisible,
      list: sortedLeaderboard,
    });
  }
  const filteredFriends = useMemo(() => {
    const query = friendSearchQuery.trim().toLowerCase();
    if (!query) return friends;
    return friends.filter((friend) => friend.name.toLowerCase().includes(query));
  }, [friends, friendSearchQuery]);
  const filteredGroups = useMemo(() => {
    const query = groupSearchQuery.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(query));
  }, [groups, groupSearchQuery]);
  const ownedGroupCount = useMemo(
    () => groups.filter((g) => g.ownerId === user?.uid).length,
    [groups, user?.uid]
  );

  const refreshRotate = refreshSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    if (!refreshing) {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(refreshSpin, {
        toValue: 1,
        duration: 700,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [refreshing, refreshSpin]);

  const handleTabRefresh = useCallback(async () => {
    if (refreshing || !user) return;
    setShowLeaderboardSortDropdown(false);
    setRefreshing(true);
    try {
      if (activeTab === 'friends') {
        const [nextFriends, incoming, outgoing] = await Promise.all([
          fetchFriendsList(user.uid),
          fetchIncomingFriendRequests(user.uid),
          fetchOutgoingFriendRequests(user.uid),
        ]);
        setFriends(nextFriends);
        setIncomingRequests(incoming);
        setOutgoingRequests(outgoing);
      } else if (activeTab === 'groups') {
        setGroups(await fetchGroupsList(user.uid));
      } else {
        setLbLoading(true);
        try {
          const lb = await getFriendLeaderboard(user.uid, true);
          setLeaderboard(lb);
          setLbFailed(false);
        } catch (e) {
          console.error('Friend leaderboard refresh failed:', e);
          setLbFailed(true);
        } finally {
          setLbLoading(false);
        }
      }
    } finally {
      refreshSpin.stopAnimation(() => {
        refreshSpin.setValue(0);
      });
      setRefreshing(false);
    }
  }, [refreshing, user, activeTab, refreshSpin]);

  useEffect(() => {
    if (!user) return;
    return subscribeFriends(
      user.uid,
      (list) => {
        setFriends(list);
        setFriendsLoaded(true);
      },
      (e) => {
        console.error('Friends subscription error:', e);
        setFriendsLoaded(true);
      }
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeIncomingFriendRequests(user.uid, setIncomingRequests, (e) =>
      console.error('Incoming friend requests error:', e)
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeOutgoingFriendRequests(user.uid, setOutgoingRequests, (e) =>
      console.error('Outgoing friend requests error:', e)
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeIncomingGuestLinks(user.uid, setIncomingGuestLinks, (e) =>
      console.error('Incoming guest links error:', e)
    );
  }, [user]);

  // Reset/flag leaderboard loading as soon as its inputs change (during render
  // rather than in the effect below, to avoid a cascading render).
  const [lbInputs, setLbInputs] = useState<{
    user: typeof user;
    friends: typeof friends;
    friendsLoaded: boolean;
  } | null>(null);
  if (
    lbInputs === null
    || lbInputs.user !== user
    || lbInputs.friends !== friends
    || lbInputs.friendsLoaded !== friendsLoaded
  ) {
    setLbInputs({ user, friends, friendsLoaded });
    if (!user || friends.length === 0) {
      setLeaderboard([]);
      if (!user || friendsLoaded) setLbLoading(false);
    } else {
      setLbLoading(true);
    }
  }

  useEffect(() => {
    if (!user || friends.length === 0) return;
    let cancelled = false;
    getFriendLeaderboard(user.uid)
      .then((lb) => {
        if (cancelled) return;
        setLeaderboard(lb);
        setLbFailed(false);
      })
      .catch((e) => {
        console.error('Friend leaderboard load failed:', e);
        if (!cancelled) setLbFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, friends, friendsLoaded]);

  useEffect(() => {
    if (!user) return;
    return subscribeGroups(
      user.uid,
      (list) => {
        setGroups(list);
        setGroupsLoaded(true);
      },
      (e) => {
        console.error('Groups subscription error:', e);
        setGroupsLoaded(true);
      }
    );
  }, [user]);

  // Members only arrive via the subscription below, so clear them during render
  // once there is no expanded group to subscribe to.
  if ((!user || !expandedGroupId) && groupMembers.length > 0) {
    setGroupMembers([]);
  }

  useEffect(() => {
    if (!user || !expandedGroupId) return;
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
        const lb = await getGroupLeaderboard(user.uid, expandedGroupId, groupLbRefreshKey > 0);
        if (!cancelled) setGroupLeaderboard(lb);
      } catch (e) {
        console.error('Group leaderboard load failed:', e);
        if (!cancelled) setGroupLeaderboard([]);
      } finally {
        if (!cancelled) setGroupLbLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [user, expandedGroupId, groupLbRefreshKey]);

  function openRenameGroupModal(group: PokerGroup) {
    setRenameGroupTarget(group);
    setRenameGroupName(group.name);
    setRenameGroupError(null);
  }

  async function handleConfirmRenameGroup() {
    if (!user || !renameGroupTarget) return;
    const trimmed = renameGroupName.trim();
    if (trimmed.length < 2) {
      setRenameGroupError('Use at least 2 characters');
      return;
    }
    try {
      setRenameGroupSaving(true);
      await renameGroup(user.uid, renameGroupTarget.id, trimmed);
      setRenameGroupTarget(null);
      setRenameGroupName('');
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to rename group.'));
    } finally {
      setRenameGroupSaving(false);
    }
  }

  function handleDeleteGroup(groupId: string, groupName: string) {
    if (!user) return;
    appAlert(`Delete "${groupName}"?`, 'This group and all its members will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (expandedGroupId === groupId) setExpandedGroupId(null);
            await deleteGroup(user.uid, groupId);
          } catch (e) {
            appAlert('Error', userMessage(e, 'Failed to delete group.'));
          }
        },
      },
    ]);
  }

  function handleLeaveGroup(groupId: string, groupName: string) {
    if (!user) return;
    appAlert(`Leave "${groupName}"?`, 'It disappears from your Groups tab. The owner can add you back.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            if (expandedGroupId === groupId) setExpandedGroupId(null);
            await leaveGroup(user.uid, groupId);
          } catch (e) {
            appAlert('Error', userMessage(e, 'Failed to leave group.'));
          }
        },
      },
    ]);
  }

  async function handleAddFriend() {
    if (!user) return;
    const code = refCodeInput.trim().toUpperCase();
    if (code.length < 6) {
      setRefCodeError('Enter the 6-character code');
      return;
    }

    if (code === playerProfile?.refCode) {
      setRefCodeError("That's your own code");
      return;
    }

    const existing = friends.find(
      (f) => f.playerId === code || f.name.toUpperCase() === code
    );
    if (existing) {
      setRefCodeError(`You're already friends with ${existing.name}`);
      return;
    }

    try {
      setAdding(true);
      const found = await lookupPlayerByRefCode(code);
      if (!found) {
        setRefCodeError('No player with that code');
        return;
      }
      if (friends.some((f) => f.playerId === found.id)) {
        setRefCodeError(`You're already friends with ${found.name}`);
        return;
      }

      const incoming = incomingRequests.find((r) => r.playerId === found.id);
      if (incoming) {
        appAlert(
          'Friend request',
          `${found.name} already sent you a request.`,
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Accept',
              onPress: async () => {
                try {
                  await acceptFriendRequest(user.uid, found.id);
                  setRefCodeInput('');
                  setShowAddModal(false);
                  appAlert('Added!', `${found.name} is now your friend.`);
                } catch (e) {
                  appAlert('Error', userMessage(e, 'Failed to accept.'));
                }
              },
            },
          ]
        );
        return;
      }

      const result = await sendFriendRequest(user.uid, found);
      if (!result.ok) {
        if (result.reason === 'already_friends') {
          setRefCodeError(`You're already friends with ${found.name}`);
        } else if (result.reason === 'already_sent') {
          setRefCodeError(`You already sent ${found.name} a request`);
        } else {
          setRefCodeError("That's your own code");
        }
        return;
      }

      setRefCodeInput('');
      setShowAddModal(false);
      if (result.outcome === 'now_friends') {
        appAlert('Added!', `You and ${found.name} are now friends.`);
      } else {
        appAlert('Request sent', `${found.name} will see your request.`);
      }
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to send request.'));
    } finally {
      setAdding(false);
    }
  }

  async function handleAcceptGuestLink(link: GuestLink) {
    if (busyGuestLinkId) return;
    setBusyGuestLinkId(link.id);
    try {
      await acceptGuestLink(link);
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to accept.'));
    } finally {
      setBusyGuestLinkId(null);
    }
  }

  function handleDeclineGuestLink(link: GuestLink) {
    appAlert(
      'Decline request?',
      `${link.ownerName}’s sessions with ${link.guestName} stay on their side and won’t be added to your history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await declineGuestLink(link);
            } catch (e) {
              appAlert('Error', userMessage(e, 'Failed to decline.'));
            }
          },
        },
      ]
    );
  }

  function handleRemoveFriend(friendId: string, friendName: string) {
    if (!user) return;
    appAlert(`Remove ${friendName}?`, 'They will also be removed from your friends list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeFriend(user.uid, friendId);
          } catch (e) {
            appAlert('Error', userMessage(e, 'Failed to remove friend.'));
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={[layout.content, styles.content, layout.compactTop]}>
      <Text style={[styles.title, { color: c.text }]}>Friends</Text>

      <SegmentedTabs
        tabs={FRIENDS_TABS}
        value={activeTab}
        onChange={(tab) => {
          if (tab === 'leaderboard') setLbEntering((prev) => ({ ...prev, seen: new Set<string>() }));
          setActiveTab(tab);
          setShowLeaderboardSortDropdown(false);
        }}
      />

      {activeTab === 'friends' && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              {friendsLoaded ? `Friends (${friends.length})` : 'Friends'}
            </Text>
            <View style={styles.addBtnGroup}>
              <PressableScale
                pressedScale={0.92}
                style={[
                  styles.refreshBtn,
                  { backgroundColor: c.cardAlt, borderColor: c.border },
                  refreshing && styles.refreshDisabled,
                ]}
                onPress={() => void handleTabRefresh()}
                accessibilityRole="button"
                accessibilityLabel="Refresh friends">
                <Animated.View style={{ transform: [{ rotate: refreshRotate }] }}>
                  <Icon name="refresh" size={20} color={c.textMuted} />
                </Animated.View>
              </PressableScale>
              <PressableScale
                pressedScale={0.92}
                style={[styles.scanBtn, { backgroundColor: c.friendChipBg, borderColor: c.friendChipBorder }]}
                onPress={() => router.push('../qr-code?tab=scan')}
                accessibilityRole="button"
                accessibilityLabel="Scan a friend's QR code">
                <Icon name="qr-code-scanner" size={20} color={c.blue} />
              </PressableScale>
              <PressableScale
                pressedScale={0.97}
                style={[styles.addBtn, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}
                onPress={() => setShowAddModal(true)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Add friend">
                <Icon name="person-add" size={20} color={c.accentText} />
                <Text style={[styles.addBtnLabel, { color: c.accentText }]}>Add</Text>
              </PressableScale>
            </View>
          </View>
          <SearchInput
            accessibilityLabel="Search friends by name"
            placeholder="Search friend name"
            value={friendSearchQuery}
            onChangeText={setFriendSearchQuery}
            autoCapitalize="words"
            autoCorrect={false}
          />

          {incomingRequests.length > 0 ? (
            <View style={styles.requestBlock}>
              <Text style={[styles.requestBlockTitle, { color: c.textMuted }]}>Incoming requests</Text>
              {incomingRequests.map((req, i) => (
                <Motion.View
                  key={req.playerId}
                  entering={listItemEntering(i)}
                  exiting={fadeOut}
                  layout={layoutTransition}
                  style={[
                    styles.requestRow,
                    styles.vRow,
                    i === 0 && styles.vFirst,
                    i === incomingRequests.length - 1 && styles.vLast,
                    { backgroundColor: c.card, borderColor: c.borderAccent },
                  ]}>
                  <View style={styles.friendInfo}>
                    <View style={[styles.avatarTile, { backgroundColor: c.cardAlt }]}>
                      <Text style={styles.friendAvatar}>{req.avatarEmoji ?? '🙂'}</Text>
                    </View>
                    <Text style={[styles.friendName, { color: c.textSecondary }]}>{req.name}</Text>
                  </View>
                  <View style={styles.requestActions}>
                    <PressableScale
                      pressedScale={0.97}
                      style={[styles.requestAcceptBtn, { backgroundColor: c.accent }]}
                      onPress={async () => {
                        if (!user) return;
                        try {
                          await acceptFriendRequest(user.uid, req.playerId);
                        } catch (e) {
                          appAlert('Error', userMessage(e, 'Failed to accept.'));
                        }
                      }}>
                      <Text style={[styles.requestAcceptLabel, { color: c.onAccent }]}>Accept</Text>
                    </PressableScale>
                    <PressableScale
                      pressedScale={0.9}
                      hitSlop={8}
                      accessibilityRole="button"
                      style={styles.requestCloseBtn}
                      accessibilityLabel={`Decline friend request from ${req.name}`}
                      onPress={async () => {
                        if (!user) return;
                        try {
                          await declineFriendRequest(user.uid, req.playerId);
                        } catch (e) {
                          appAlert('Error', userMessage(e, 'Failed to decline.'));
                        }
                      }}>
                      <Icon name="close" size={20} color={c.textHint} />
                    </PressableScale>
                  </View>
                </Motion.View>
              ))}
            </View>
          ) : null}

          {incomingGuestLinks.length > 0 ? (
            <View style={styles.requestBlock}>
              <Text style={[styles.requestBlockTitle, { color: c.textMuted }]}>History requests</Text>
              {incomingGuestLinks.map((link, i) => {
                const isBusy = busyGuestLinkId === link.id;
                const sessionsLabel = `${link.sessionCount} past ${link.sessionCount === 1 ? 'session' : 'sessions'}`;
                const isAccepted = link.status === 'accepted';
                const isFailed = link.status === 'failed';
                return (
                  <Motion.View
                    key={link.id}
                    entering={listItemEntering(i)}
                    exiting={fadeOut}
                    layout={layoutTransition}
                    style={[
                      styles.requestRow,
                      styles.vRow,
                      i === 0 && styles.vFirst,
                      i === incomingGuestLinks.length - 1 && styles.vLast,
                      { backgroundColor: c.card, borderColor: c.borderAccent },
                    ]}>
                    <View style={styles.friendInfo}>
                      <View style={[styles.avatarTile, { backgroundColor: c.cardAlt }]}>
                        {isAccepted ? (
                          <ActivityIndicator size="small" color={c.textMuted} />
                        ) : (
                          <Icon name={isFailed ? 'error-outline' : 'link'} size={18} color={isFailed ? c.loss : c.textMuted} />
                        )}
                      </View>
                      <View style={styles.guestLinkText}>
                        {isAccepted ? (
                          <Text style={[styles.guestLinkBody, { color: c.textSecondary }]}>
                            Moving {sessionsLabel} played as <Text style={styles.guestLinkStrong}>{link.guestName}</Text>{' '}
                            to your history…
                          </Text>
                        ) : isFailed ? (
                          <Text style={[styles.guestLinkBody, { color: c.textSecondary }]}>
                            Couldn’t move <Text style={styles.guestLinkStrong}>{link.guestName}</Text>’s history. Ask{' '}
                            <Text style={styles.guestLinkStrong}>{link.ownerName}</Text> to send the request again.
                          </Text>
                        ) : (
                          <Text style={[styles.guestLinkBody, { color: c.textSecondary }]}>
                            <Text style={styles.guestLinkStrong}>{link.ownerName}</Text> wants to add {sessionsLabel}{' '}
                            played as <Text style={styles.guestLinkStrong}>{link.guestName}</Text> to your history
                          </Text>
                        )}
                        <Text style={[styles.friendMeta, { color: link.net >= 0 ? c.profit : c.loss }]}>
                          Net {formatSignedCurrency(link.net)}
                        </Text>
                      </View>
                    </View>
                    {isAccepted ? null : isFailed ? (
                      <PressableScale
                        pressedScale={0.9}
                        hitSlop={8}
                        accessibilityRole="button"
                        style={styles.requestCloseBtn}
                        accessibilityLabel="Dismiss"
                        onPress={() =>
                          void declineGuestLink(link).catch((e) =>
                            appAlert('Error', userMessage(e, 'Failed to dismiss.'))
                          )
                        }>
                        <Icon name="close" size={20} color={c.textHint} />
                      </PressableScale>
                    ) : (
                      <View style={styles.requestActions}>
                        <PressableScale
                          pressedScale={0.97}
                          style={[
                            styles.requestAcceptBtn,
                            styles.guestLinkAcceptBtn,
                            { backgroundColor: c.accent },
                            isBusy && styles.disabled,
                          ]}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={`Accept ${sessionsLabel} from ${link.ownerName}`}
                          accessibilityState={{ disabled: isBusy, busy: isBusy }}
                          onPress={() => void handleAcceptGuestLink(link)}>
                          {isBusy ? (
                            <ActivityIndicator size="small" color={c.onAccent} />
                          ) : (
                            <Text style={[styles.requestAcceptLabel, { color: c.onAccent }]}>Accept</Text>
                          )}
                        </PressableScale>
                        <PressableScale
                          pressedScale={0.9}
                          hitSlop={8}
                          disabled={isBusy}
                          accessibilityRole="button"
                          style={styles.requestCloseBtn}
                          accessibilityLabel={`Decline sessions from ${link.ownerName}`}
                          onPress={() => handleDeclineGuestLink(link)}>
                          <Icon name="close" size={20} color={c.textHint} />
                        </PressableScale>
                      </View>
                    )}
                  </Motion.View>
                );
              })}
            </View>
          ) : null}

          {outgoingRequests.length > 0 ? (
            <View style={styles.requestBlock}>
              <Text style={[styles.requestBlockTitle, { color: c.textMuted }]}>Sent requests</Text>
              {outgoingRequests.map((req, i) => (
                <Motion.View
                  key={req.playerId}
                  entering={listItemEntering(i)}
                  exiting={fadeOut}
                  layout={layoutTransition}
                  style={[
                    styles.requestRow,
                    styles.vRow,
                    i === 0 && styles.vFirst,
                    i === outgoingRequests.length - 1 && styles.vLast,
                    { backgroundColor: c.card, borderColor: c.border },
                  ]}>
                  <View style={styles.friendInfo}>
                    <View style={[styles.avatarTile, { backgroundColor: c.cardAlt }]}>
                      <Text style={styles.friendAvatar}>{req.avatarEmoji ?? '🙂'}</Text>
                    </View>
                    <View>
                      <Text style={[styles.friendName, { color: c.textSecondary }]}>{req.name}</Text>
                      <Text style={[styles.pendingHint, { color: c.textHint }]}>Pending</Text>
                    </View>
                  </View>
                  <PressableScale
                    pressedScale={0.9}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancel friend request to ${req.name}`}
                    onPress={() => {
                      appAlert('Cancel request?', `Stop waiting for ${req.name} to accept?`, [
                        { text: 'No', style: 'cancel' },
                        {
                          text: 'Cancel request',
                          style: 'destructive',
                          onPress: async () => {
                            if (!user) return;
                            try {
                              await cancelOutgoingFriendRequest(user.uid, req.playerId);
                            } catch (e) {
                              appAlert('Error', userMessage(e, 'Failed to cancel.'));
                            }
                          },
                        },
                      ]);
                    }}>
                    <Text style={[styles.cancelRequestLabel, { color: c.lossLight }]}>Cancel</Text>
                  </PressableScale>
                </Motion.View>
              ))}
            </View>
          ) : null}

          {!friendsLoaded ? (
            <FriendRowsSkeleton />
          ) : friends.length === 0 ? (
            <EmptyState
              icon="people"
              title="No friends yet"
              message="Add someone with their code, or share yours from the QR screen."
              action={{ label: 'Add friend', icon: 'person-add', onPress: () => setShowAddModal(true) }}
            />
          ) : filteredFriends.length === 0 ? (
            <EmptyState compact icon="search" title="No matches" message={`No friend named “${friendSearchQuery.trim()}”.`} />
          ) : (
            <View style={styles.friendList}>
              {filteredFriends.map((item, i) => (
                <Motion.View
                  key={item.playerId}
                  entering={listItemEntering(i)}
                  exiting={fadeOut}
                  layout={layoutTransition}
                  style={[
                    styles.friendRow,
                    styles.vRow,
                    i === 0 && styles.vFirst,
                    i === filteredFriends.length - 1 && styles.vLast,
                    { backgroundColor: c.card, borderColor: c.border },
                  ]}>
                  <View style={styles.friendInfo}>
                    <View style={[styles.avatarTile, { backgroundColor: c.cardAlt }]}>
                      <Text style={styles.friendAvatar}>{item.avatarEmoji ?? '🙂'}</Text>
                    </View>
                    <View style={styles.friendTextBlock}>
                      <Text style={[styles.friendName, { color: c.textSecondary }]}>{item.name}</Text>
                      <Text style={[styles.friendMeta, { color: c.textHint }]}>
                        Friends since {formatDateDMY(item.addedAt)}
                      </Text>
                    </View>
                  </View>
                  <PressableScale
                    pressedScale={0.92}
                    hitSlop={4}
                    style={styles.rowIconBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name} from friends`}
                    onPress={() => handleRemoveFriend(item.playerId, item.name)}>
                    <Icon name="close" size={20} color={c.textHint} />
                  </PressableScale>
                </Motion.View>
              ))}
            </View>
          )}
        </>
      )}

      {activeTab === 'groups' && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              {groupsLoaded ? `Groups (${groups.length})` : 'Groups'}
            </Text>
            <View style={styles.sectionHeaderActions}>
              <PressableScale
                pressedScale={0.92}
                style={[
                  styles.refreshBtn,
                  { backgroundColor: c.cardAlt, borderColor: c.border },
                  refreshing && styles.refreshDisabled,
                ]}
                onPress={() => void handleTabRefresh()}
                accessibilityRole="button"
                accessibilityLabel="Refresh groups">
                <Animated.View style={{ transform: [{ rotate: refreshRotate }] }}>
                  <Icon name="refresh" size={20} color={c.textMuted} />
                </Animated.View>
              </PressableScale>
              <PressableScale
                pressedScale={0.97}
                style={[
                  styles.addBtn,
                  { backgroundColor: c.accentBg, borderColor: c.accentBorder },
                ]}
                onPress={() => setShowNewGroup(true)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="New group"
>
                <Icon name="group-add" size={20} color={c.accentText} />
                <Text style={[styles.addBtnLabel, { color: c.accentText }]}>New</Text>
              </PressableScale>
            </View>
          </View>
          <SearchInput
            accessibilityLabel="Search groups by name"
            placeholder="Search group name"
            value={groupSearchQuery}
            onChangeText={setGroupSearchQuery}
            autoCapitalize="words"
            autoCorrect={false}
          />

          {!groupsLoaded ? (
            <GroupCardsSkeleton gap={layout.sectionGap} />
          ) : groups.length === 0 ? (
            <EmptyState
              icon="groups"
              title="No groups yet"
              message="Create a group to start sessions with your regulars in one tap."
              action={{ label: 'Create group', icon: 'add', onPress: () => setShowNewGroup(true) }}
            />
          ) : filteredGroups.length === 0 ? (
            <EmptyState compact icon="search" title="No matches" message={`No group named “${groupSearchQuery.trim()}”.`} />
          ) : (
            filteredGroups.map((group, groupIndex) => {
              const isExpanded = expandedGroupId === group.id;
              const isGroupOwner = group.ownerId === user?.uid || group.myRole === 'owner';

              return (
                <Motion.View
                  key={group.id}
                  entering={listItemEntering(groupIndex)}
                  exiting={fadeOut}
                  layout={layoutTransition}
                  style={[styles.groupCard, { backgroundColor: c.card, borderColor: isExpanded ? c.borderAccent : c.border }]}>
                  <Pressable
                    style={styles.groupHeader}
                    onPress={() => setExpandedGroupId(isExpanded ? null : group.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${group.name}, ${group.memberCount ?? 0} players`}
                    accessibilityHint={isExpanded ? 'Collapses the group' : 'Expands the group'}
                    accessibilityState={{ expanded: isExpanded }}
                    aria-expanded={isExpanded}>
                    <View style={styles.groupHeaderLeft}>
                      <Icon name="group" size={20} color={c.textMuted} />
                      <Text style={[styles.groupName, { color: c.text }]}>{group.name}</Text>
                      <Text style={[styles.groupCount, { color: c.textHint }]}>
                        {group.memberCount ?? 0} {(group.memberCount ?? 0) === 1 ? 'player' : 'players'}
                      </Text>
                    </View>
                    <View style={styles.groupHeaderRight}>
                      {isGroupOwner ? (
                        <>
                          <PressableScale
                            pressedScale={0.9}
                            hitSlop={4}
                            style={styles.groupIconBtn}
                            accessibilityRole="button"
                            accessibilityLabel={`Rename group ${group.name}`}
                            onPress={() => openRenameGroupModal(group)}>
                            <Icon name="edit" size={20} color={c.textHint} />
                          </PressableScale>
                          <PressableScale
                            pressedScale={0.9}
                            hitSlop={4}
                            style={styles.groupIconBtn}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete group ${group.name}`}
                            onPress={() => handleDeleteGroup(group.id, group.name)}>
                            <Icon name="delete-outline" size={20} color={c.textHint} />
                          </PressableScale>
                        </>
                      ) : (
                        <PressableScale
                          pressedScale={0.9}
                          hitSlop={4}
                          style={styles.groupIconBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Leave group ${group.name}`}
                          onPress={() => handleLeaveGroup(group.id, group.name)}>
                          <Icon name="logout" size={20} color={c.textHint} />
                        </PressableScale>
                      )}
                      <View style={styles.groupIconBtn}>
                        <Icon
                          name={isExpanded ? 'expand-less' : 'expand-more'}
                          size={22}
                          color={c.textMuted}
                          importantForAccessibility="no"
                        />
                      </View>
                    </View>
                  </Pressable>

                  {isExpanded && (
                    <View style={styles.groupBody}>
                      {groupMembers.length === 0 ? (
                        <Text style={[styles.groupEmpty, { color: c.textHint }]}>
                          {isGroupOwner
                            ? 'No members yet. Tap below to add players.'
                            : 'No members in this group yet.'}
                        </Text>
                      ) : (
                        <ScrollView
                          style={styles.groupMembersScroll}
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="handled">
                          {groupMembers.map((member) => (
                            <View
                              key={member.id}
                              style={[styles.memberRow, { borderColor: c.border }]}>
                              <View style={styles.memberInfo}>
                                <GroupMemberAvatar member={member} viewerProfile={playerProfile} />
                                <Text style={[styles.memberName, { color: c.textSecondary }]}>
                                  {member.id === playerProfile?.id
                                    ? (playerProfile?.name ?? member.name)
                                    : member.name}
                                  {member.id === playerProfile?.id ? ' (You)' : ''}
                                </Text>
                                {!member.isRegistered ? (
                                  <View
                                    style={[styles.groupMemberRoleBadge, { backgroundColor: c.badge.cashedOut }]}>
                                    <Text style={styles.groupMemberRoleBadgeText}>Guest</Text>
                                  </View>
                                ) : member.id === group.ownerId ? (
                                  <View
                                    style={[styles.groupMemberRoleBadge, { backgroundColor: c.badge.host }]}>
                                    <Text style={styles.groupMemberRoleBadgeText}>Owner</Text>
                                  </View>
                                ) : (
                                  <View
                                    style={[styles.groupMemberRoleBadge, { backgroundColor: c.badge.you }]}>
                                    <Text style={styles.groupMemberRoleBadgeText}>Member</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      )}
                      <View style={styles.groupActionsRow}>
                        <PressableScale
                          pressedScale={0.97}
                          style={[
                            styles.manageBtn,
                            { backgroundColor: c.accentBg, borderColor: c.accentBorder },
                          ]}
                          onPress={() => router.push(`../group/${group.id}/members`)}
                          accessibilityRole="button"
                          accessibilityLabel={isGroupOwner ? 'Manage members' : 'View members'}>
                          <Icon name={isGroupOwner ? 'edit' : 'people'} size={16} color={c.accentText} />
                          <Text style={[styles.manageBtnLabel, { color: c.accentText }]}>
                            {layout.isMd ? (isGroupOwner ? 'Manage Members' : 'View Members') : 'Members'}
                          </Text>
                        </PressableScale>

                        <PressableScale
                          pressedScale={0.97}
                          style={[
                            styles.manageBtn,
                            { backgroundColor: c.blueBg, borderColor: c.blueBorder },
                          ]}
                          onPress={() => {
                            setGroupLeaderboardModalGroup(group);
                            setShowGroupLeaderboardModal(true);
                          }}>
                          <Icon name="leaderboard" size={16} color={c.blue} />
                          <Text style={[styles.manageBtnLabel, { color: c.blue }]}>Leaderboard</Text>
                        </PressableScale>
                      </View>
                    </View>
                  )}
                </Motion.View>
              );
            })
          )}
        </>
      )}

            {activeTab === 'leaderboard' && (
        <>
          {showLeaderboardSortDropdown ? (
            <Pressable style={styles.menuBackdrop} onPress={() => setShowLeaderboardSortDropdown(false)} accessible={false} focusable={false} tabIndex={-1} aria-hidden />
          ) : null}
          <View style={[styles.sectionHeader, showLeaderboardSortDropdown && styles.menuAnchorRaised]}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Leaderboard</Text>
            <View style={styles.sectionHeaderActions}>
              <PressableScale
                pressedScale={0.92}
                style={[
                  styles.refreshBtn,
                  { backgroundColor: c.cardAlt, borderColor: c.border },
                  refreshing && styles.refreshDisabled,
                ]}
                onPress={() => void handleTabRefresh()}
                accessibilityRole="button"
                accessibilityLabel="Refresh leaderboard">
                <Animated.View style={{ transform: [{ rotate: refreshRotate }] }}>
                  <Icon name="refresh" size={20} color={c.textMuted} />
                </Animated.View>
              </PressableScale>
              <View style={styles.lbSortWrap}>
              <PressableScale
                pressedScale={0.97}
                style={[styles.lbSortBtnLabeled, { backgroundColor: c.cardAlt, borderColor: c.border }]}
                onPress={() => setShowLeaderboardSortDropdown((prev) => !prev)}>
                <Icon name="sort" size={20} color={c.textMuted} />
                <Text style={[styles.lbSortBtnText, { color: c.textMuted }]}>
                  {leaderboardSortBy === 'profit' ? 'Profit' : 'Name'} ({leaderboardSortDirection === 'asc' ? 'Asc' : 'Desc'})
                </Text>
              </PressableScale>
              {showLeaderboardSortDropdown ? (
                <Motion.View
                  entering={menuEntering}
                  exiting={fadeOut}
                  style={[styles.lbSortDropdown, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={[styles.lbSortSectionTitle, { color: c.textHint }]}>Sort by</Text>
                  <Pressable
                    style={[styles.lbSortOption, leaderboardSortBy === 'profit' && { backgroundColor: c.accentBg }]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: leaderboardSortBy === 'profit' }}
                    onPress={() => {
                      setLeaderboardSortBy('profit');
                      setShowLeaderboardSortDropdown(false);
                    }}>
                    <Text style={[styles.lbSortOptionText, { color: c.text }]}>Profit</Text>
                    {leaderboardSortBy === 'profit' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                  </Pressable>
                  <Pressable
                    style={[styles.lbSortOption, leaderboardSortBy === 'name' && { backgroundColor: c.accentBg }]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: leaderboardSortBy === 'name' }}
                    onPress={() => {
                      setLeaderboardSortBy('name');
                      setShowLeaderboardSortDropdown(false);
                    }}>
                    <Text style={[styles.lbSortOptionText, { color: c.text }]}>Name</Text>
                    {leaderboardSortBy === 'name' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                  </Pressable>
                  <View style={[styles.lbSortDivider, { backgroundColor: c.border }]} />
                  <Text style={[styles.lbSortSectionTitle, { color: c.textHint }]}>Direction</Text>
                  <Pressable
                    style={[styles.lbSortOption, leaderboardSortDirection === 'desc' && { backgroundColor: c.accentBg }]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: leaderboardSortDirection === 'desc' }}
                    onPress={() => {
                      setLeaderboardSortDirection('desc');
                      setShowLeaderboardSortDropdown(false);
                    }}>
                    <Text style={[styles.lbSortOptionText, { color: c.text }]}>Descending</Text>
                    {leaderboardSortDirection === 'desc' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                  </Pressable>
                  <Pressable
                    style={[styles.lbSortOption, leaderboardSortDirection === 'asc' && { backgroundColor: c.accentBg }]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: leaderboardSortDirection === 'asc' }}
                    onPress={() => {
                      setLeaderboardSortDirection('asc');
                      setShowLeaderboardSortDropdown(false);
                    }}>
                    <Text style={[styles.lbSortOptionText, { color: c.text }]}>Ascending</Text>
                    {leaderboardSortDirection === 'asc' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                  </Pressable>
                </Motion.View>
              ) : null}
              </View>
            </View>
          </View>
          {lbLoading ? (
            <LeaderboardSkeleton rows={5} label="Loading leaderboard" />
          ) : leaderboard.length === 0 ? (
            <EmptyState
              icon="leaderboard"
              title={lbFailed ? "Couldn't load the leaderboard" : 'No results yet'}
              message={lbFailed ? 'Tap refresh to try again.' : 'Finish a session with friends to see the rankings.'}
            />
          ) : (
            sortedLeaderboard.map((entry, idx) => {
              const isMe = entry.playerId === user?.uid;
              const isFirstShow = lbEntering.fresh.has(entry.playerId);
              return (
                <Motion.View
                  key={entry.playerId}
                  entering={isFirstShow ? listItemEntering(idx) : undefined}
                  exiting={fadeOut}
                  layout={layoutTransition}
                  style={[
                    styles.lbRow,
                    styles.vRow,
                    idx === 0 && styles.vFirst,
                    idx === sortedLeaderboard.length - 1 && styles.vLast,
                    { backgroundColor: isMe ? c.accentBg : c.card, borderColor: c.border },
                  ]}>
                  <View style={styles.lbLeft}>
                    <Text style={[styles.lbRank, { color: c.textMuted }]}>#{idx + 1}</Text>
                    <Text style={styles.lbAvatar}>{entry.avatarEmoji ?? '🙂'}</Text>
                    <Text style={[styles.lbName, { color: isMe ? c.text : c.textSecondary }]}>
                      {entry.name}
                    </Text>
                  </View>
                  <Text style={[styles.lbProfit, { color: entry.totalProfit >= 0 ? c.profit : c.loss }]}>
                    {formatSignedCurrency(entry.totalProfit)}
                  </Text>
                </Motion.View>
              );
            })
          )}
        </>
      )}

      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalRoot}>
          <ModalBackdrop
                        onPress={() => setShowAddModal(false)}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <KeyboardAvoidingView
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
              style={styles.addFriendModalKav}>
              <View style={[styles.addCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.addCardTitle, { color: c.text }]}>Send friend request</Text>
                <Text style={[styles.addCardSub, { color: c.textMuted }]}>
                  Enter their 6-character ref code
                </Text>
                <ScrollView
                  ref={addFriendScrollRef}
                  keyboardShouldPersistTaps="handled"
                  style={styles.addFriendModalFieldsScroll}
                  contentContainerStyle={styles.addFriendModalFieldsScrollContent}>
                  <TextInput
                    value={refCodeInput}
                    onChangeText={(t) => {
                      setRefCodeInput(t.toUpperCase());
                      setRefCodeError(null);
                    }}
                    accessibilityLabel="Friend's 6-character ref code"
                    placeholder="e.g. A3X7KP"
                    placeholderTextColor={c.placeholder}
                    maxLength={6}
                    autoCapitalize="characters"
                    autoFocus
                    onFocus={() => scrollModalFieldToTop(addFriendScrollRef)}
                    style={[
                      styles.codeInput,
                      { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
                      errorBorder(c, refCodeError),
                    ]}
                    {...invalidProps(refCodeError)}
                  />
                  <FieldError message={refCodeError} />
                </ScrollView>
                <View style={styles.addCardActions}>
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => { setShowAddModal(false); setRefCodeInput(''); setRefCodeError(null); }}>
                    <Text style={[styles.cancelLabel, { color: c.lossLight }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.confirmBtn,
                      { backgroundColor: c.accent },
                      adding && styles.disabled,
                    ]}
                    onPress={handleAddFriend}
                    disabled={adding}>
                    {adding ? (
                      <ActivityIndicator size="small" color={c.onAccent} />
                    ) : (
                      <Text style={[styles.confirmLabel, { color: c.onAccent }]}>Send request</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showGroupLeaderboardModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowGroupLeaderboardModal(false)}>
        <View style={styles.modalRoot}>
          <ModalBackdrop
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
                <PressableScale
                  pressedScale={0.9}
                  disabled={groupLbLoading}
                  onPress={() => setGroupLbRefreshKey((k) => k + 1)}
                  style={[styles.requestCloseBtn, groupLbLoading && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh leaderboard"
                  accessibilityState={{ disabled: groupLbLoading, busy: groupLbLoading }}>
                  <Icon name="refresh" size={18} color={c.textMuted} />
                </PressableScale>
                <PressableScale
                  pressedScale={0.9}
                  onPress={() => setShowGroupLeaderboardModal(false)}
                  style={styles.requestCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close leaderboard">
                  <Icon name="close" size={20} color={c.textHint} />
                </PressableScale>
              </View>

              <ScrollView
                contentContainerStyle={styles.leaderboardBody}>
                {groupLbLoading ? (
                  <LeaderboardSkeleton rows={4} label="Loading group leaderboard" />
                ) : groupLeaderboard.length === 0 ? (
                  <EmptyState
                    compact
                    icon="leaderboard"
                    title="No results yet"
                    message="Play a session with this group to see who's up."
                  />
                ) : (
                  groupLeaderboard.map((entry, idx) => {
                    const isMe = entry.playerId === user?.uid;
                    return (
                      <Motion.View
                        key={entry.playerId}
                        entering={listItemEntering(idx)}
                        style={[
                          styles.lbRow,
                          styles.vRow,
                          idx === 0 && styles.vFirst,
                          idx === groupLeaderboard.length - 1 && styles.vLast,
                          { backgroundColor: isMe ? c.accentBg : c.card, borderColor: c.border },
                        ]}>
                        <View style={styles.lbLeft}>
                          <Text style={[styles.lbRank, { color: c.textMuted }]}>#{idx + 1}</Text>
                          <Text style={styles.lbAvatar}>{entry.avatarEmoji ?? '🙂'}</Text>
                          <Text style={[styles.lbName, { color: isMe ? c.text : c.textSecondary }]}>
                            {entry.name}
                          </Text>
                        </View>
                        <Text style={[styles.lbProfit, { color: entry.totalProfit >= 0 ? c.profit : c.loss }]}>
                          {formatSignedCurrency(entry.totalProfit)}
                        </Text>
                      </Motion.View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={renameGroupTarget != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!renameGroupSaving) {
            setRenameGroupTarget(null);
            setRenameGroupName('');
          }
        }}>
        <View style={styles.modalRoot}>
          <ModalBackdrop
                        disabled={renameGroupSaving}
            onPress={() => {
              setRenameGroupTarget(null);
              setRenameGroupName('');
            }}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <KeyboardAvoidingView
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
              style={styles.addFriendModalKav}>
              <View style={[styles.addCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.addCardTitle, { color: c.text }]}>Rename group</Text>
                <Text style={[styles.addCardSub, { color: c.textMuted }]}>
                  This name is only visible to you.
                </Text>
                <View>
                  <TextInput
                    value={renameGroupName}
                    onChangeText={(t) => {
                      setRenameGroupName(t);
                      setRenameGroupError(null);
                    }}
                    placeholder="Group name"
                    placeholderTextColor={c.placeholder}
                    autoCapitalize="words"
                    autoFocus
                    editable={!renameGroupSaving}
                    style={[
                      styles.renameGroupInput,
                      { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
                      errorBorder(c, renameGroupError),
                    ]}
                    {...invalidProps(renameGroupError)}
                  />
                  <FieldError message={renameGroupError} />
                </View>
                <View style={styles.addCardActions}>
                  <Pressable
                    style={styles.cancelBtn}
                    disabled={renameGroupSaving}
                    onPress={() => {
                      setRenameGroupTarget(null);
                      setRenameGroupName('');
                    }}>
                    <Text style={[styles.cancelLabel, { color: c.lossLight }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.confirmBtn,
                      { backgroundColor: c.accent },
                      renameGroupSaving && styles.disabled,
                    ]}
                    disabled={renameGroupSaving}
                    onPress={handleConfirmRenameGroup}>
                    {renameGroupSaving ? (
                      <ActivityIndicator size="small" color={c.onAccent} />
                    ) : (
                      <Text style={[styles.confirmLabel, { color: c.onAccent }]}>Save</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
      {showNewGroup ? <NewGroupModal ownedCount={ownedGroupCount} onClose={() => setShowNewGroup(false)} /> : null}
    </ScrollView>
  );
}

const SKELETON_NAME_WIDTHS = [118, 86, 140, 98, 124];
const skeletonName = (i: number) => SKELETON_NAME_WIDTHS[i % SKELETON_NAME_WIDTHS.length];

function LeaderboardSkeleton({ rows, label }: { rows: number; label: string }) {
  const c = useAppColors();
  return (
    <SkeletonGroup label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={[
            styles.lbRow,
            styles.vRow,
            i === 0 && styles.vFirst,
            i === rows - 1 && styles.vLast,
            { backgroundColor: c.card, borderColor: c.border },
          ]}>
          <View style={styles.lbLeft}>
            <View style={styles.lbRankSlot}>
              <Skeleton width={20} height={12} />
            </View>
            <Skeleton width={22} height={22} radius={11} />
            <Skeleton width={skeletonName(i)} height={14} />
          </View>
          <Skeleton width={64} height={14} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

function FriendRowsSkeleton({ rows = 4 }: { rows?: number }) {
  const c = useAppColors();
  return (
    <SkeletonGroup label="Loading friends" style={styles.friendList}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={[
            styles.friendRow,
            styles.vRow,
            i === 0 && styles.vFirst,
            i === rows - 1 && styles.vLast,
            { backgroundColor: c.card, borderColor: c.border },
          ]}>
          <View style={styles.friendInfo}>
            <Skeleton width={32} height={32} radius={9} />
            <View style={styles.friendTextBlock}>
              <Skeleton width={skeletonName(i)} height={14} style={styles.skelNameLine} />
              <Skeleton width={128} height={12} style={styles.skelMetaLine} />
            </View>
          </View>
          <View style={styles.rowIconBtn} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

function GroupCardsSkeleton({ gap, cards = 3 }: { gap: number; cards?: number }) {
  const c = useAppColors();
  return (
    <SkeletonGroup label="Loading groups" style={{ gap }}>
      {Array.from({ length: cards }, (_, i) => (
        <View key={i} style={[styles.groupCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.groupHeader}>
            <View style={styles.groupHeaderLeft}>
              <Skeleton width={20} height={20} radius={6} />
              <Skeleton width={skeletonName(i + 1)} height={14} />
              <Skeleton width={52} height={12} />
            </View>
            <View style={styles.groupHeaderRight}>
              <View style={styles.groupIconBtn}>
                <Skeleton width={18} height={18} radius={9} />
              </View>
            </View>
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: 48,
    gap: 16,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  vRow: {
    minHeight: 52,
    borderRadius: 0,
    borderWidth: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    marginBottom: 0,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  vFirst: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  vLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  avatarTile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 30,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshDisabled: {
    opacity: 0.6,
  },
  lbSortWrap: {
    position: 'relative',
    zIndex: 20,
  },
  lbSortBtnLabeled: {
    borderWidth: 1,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    height: 40,
  },
  lbSortBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
  },
  menuAnchorRaised: {
    zIndex: 10,
  },
  lbSortDropdown: {
    position: 'absolute',
    transformOrigin: 'top right',
    top: '100%',
    marginTop: 8,
    right: 0,
    minWidth: 180,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 4,
    elevation: 8,
  },
  lbSortSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.66,
    textTransform: 'uppercase',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 4,
  },
  lbSortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingHorizontal: 10,
    marginHorizontal: 4,
    borderRadius: 8,
  },
  lbSortOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  lbSortDivider: {
    height: 1,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  sectionTitle: {
    fontWeight: '600',
    fontSize: 17,
    lineHeight: 22,
  },
  addBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 40,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  addBtnLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
  requestBlock: {
    gap: 0,
  },
  requestBlockTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestAcceptBtn: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
  },
  requestAcceptLabel: {
    fontWeight: '600',
    fontSize: 13,
  },
  pendingHint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  guestLinkAcceptBtn: {
    minWidth: 76,
    alignItems: 'center',
  },
  guestLinkText: {
    flex: 1,
    minWidth: 0,
  },
  guestLinkBody: {
    fontSize: 14,
    lineHeight: 19,
  },
  guestLinkStrong: {
    fontWeight: '600',
  },
  cancelRequestLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  friendList: {
    gap: 0,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  friendInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  friendName: {
    fontWeight: '600',
    fontSize: 15,
  },
  friendTextBlock: {
    minWidth: 0,
  },
  friendMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  friendAvatar: {
    fontSize: 17,
    lineHeight: 22,
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
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lbRankSlot: {
    width: 28,
  },
  skelNameLine: {
    marginVertical: 3,
  },
  skelMetaLine: {
    marginTop: 4,
    marginBottom: 2,
  },
  lbRank: {
    fontWeight: '600',
    fontSize: 13,
    width: 28,
    fontVariant: ['tabular-nums'],
  },
  lbName: {
    fontWeight: '600',
    fontSize: 15,
  },
  lbAvatar: {
    fontSize: 18,
  },
  lbProfit: {
    fontWeight: '600',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  groupCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    gap: 4,
    marginRight: -8,
  },
  groupIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupBody: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 12,
  },
  groupEmpty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  memberName: {
    fontWeight: '500',
    fontSize: 15,
  },
  groupMemberRoleBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  groupMemberRoleBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  manageBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  manageBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
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
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  addFriendModalKav: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 400,
  },
  addFriendModalFieldsScroll: {
    width: '100%',
  },
  addFriendModalFieldsScrollContent: {
    paddingBottom: 4,
  },
  addCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  addCardTitle: text.modalTitle,
  addCardSub: {
    fontSize: 13,
  },
  codeInput: {
    borderRadius: 9,
    borderWidth: 1,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  renameGroupInput: {
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    fontSize: 15,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  addCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  cancelBtn: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  cancelLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
  confirmBtn: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 18,
  },
  confirmLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.4,
  },
  leaderboardCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  leaderboardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leaderboardTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  leaderboardBody: {
    gap: 0,
    paddingBottom: 6,
  },
});
