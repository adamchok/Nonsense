import { useOutsidePress } from '@/lib/use-outside-press';
import { MetaLine } from '@/components/meta-line';
import { ModalShell } from '@/components/session/modal-shell';
import { pressBg, text } from '@/lib/ui';
import { PlayerAvatar } from '@/components/player-avatar';
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
import type { FriendRecord, FriendRequestRecord, GroupMember, PokerGroup } from '@/types';
import { Icon } from '@/components/icon';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { GroupMembersModal } from '@/components/group-members-modal';
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

const IS_WEB = Platform.OS === 'web';
const SORT_TRIGGER_ID = 'lb-sort-trigger';
const SORT_MENU_ID = 'lb-sort-menu';

type WebKeyEvent = { key: string; preventDefault: () => void };

function sortMenuItems(): HTMLElement[] {
  if (!IS_WEB || typeof document === 'undefined') return [];
  return Array.from(document.querySelectorAll<HTMLElement>(`#${SORT_MENU_ID} [role="menuitemradio"]`));
}

/** Moves focus between the web sort menu items; returns false when the key is not a menu navigation key. */
function moveSortMenuFocus(key: string): boolean {
  const items = sortMenuItems();
  const count = items.length;
  if (count === 0) return false;
  const current = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  switch (key) {
    case 'ArrowDown':
      next = current < 0 ? 0 : (current + 1) % count;
      break;
    case 'ArrowUp':
      next = current < 0 ? count - 1 : (current - 1 + count) % count;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = count - 1;
      break;
    default:
      return false;
  }
  items[next].focus();
  return true;
}

function focusSortTrigger(): void {
  if (!IS_WEB || typeof document === 'undefined') return;
  document.getElementById(SORT_TRIGGER_ID)?.focus();
}

/** Web-only ARIA for a sort menu option; native keeps its radio role. */
function sortItemWebProps(checked: boolean): object {
  return IS_WEB ? { role: 'menuitemradio', 'aria-checked': checked, tabIndex: -1 } : {};
}

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
  const [membersGroupId, setMembersGroupId] = useState<string | null>(null);
  const [refCodeInput, setRefCodeInput] = useState('');
  const [refCodeError, setRefCodeError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(true);
  const [lbFailed, setLbFailed] = useState(false);

  const [groups, setGroups] = useState<PokerGroup[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupLeaderboard, setGroupLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [groupLbLoading, setGroupLbLoading] = useState(false);
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
  // Friends, requests and groups are live subscriptions. The leaderboard is a cached scan, so it
  // re-scans on every return to this screen (and on "Try again") instead of a manual refresh button.
  const [lbReloadKey, setLbReloadKey] = useState(0);
  const hasFocusedRef = useRef(false);

  const closeSortMenu = useCallback((returnFocus: boolean) => {
    setShowLeaderboardSortDropdown(false);
    if (returnFocus) focusSortTrigger();
  }, []);

  const closeSortMenuOutside = useCallback(() => closeSortMenu(false), [closeSortMenu]);
  useOutsidePress(showLeaderboardSortDropdown, closeSortMenuOutside, [SORT_MENU_ID, SORT_TRIGGER_ID]);

  // Web: move focus into the sort menu when it opens (checked item first).
  useEffect(() => {
    if (!IS_WEB || !showLeaderboardSortDropdown) return;
    const frame = requestAnimationFrame(() => {
      const items = sortMenuItems();
      (items.find((el) => el.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [showLeaderboardSortDropdown]);

  const onSortMenuKeyDown = (e: WebKeyEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSortMenu(true);
      return;
    }
    if (e.key === 'Tab') {
      closeSortMenu(false);
      return;
    }
    if (moveSortMenuFocus(e.key)) e.preventDefault();
  };

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

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }
      setLbReloadKey((k) => k + 1);
    }, [])
  );

  const retryLeaderboard = useCallback(() => {
    if (friends.length > 0) setLbLoading(true);
    setLbReloadKey((k) => k + 1);
  }, [friends.length]);

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
    getFriendLeaderboard(user.uid, lbReloadKey > 0)
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
  }, [user, friends, friendsLoaded, lbReloadKey]);

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

  // Fetched fresh (bypassing the 5-min scan cache) each time the modal opens, so new results show
  // without a refresh button, matching the friends leaderboard's re-scan on focus.
  const groupLbId = showGroupLeaderboardModal ? groupLeaderboardModalGroup?.id : undefined;
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!user || !groupLbId) return;
      setGroupLeaderboard([]);
      setGroupLbLoading(true);
      try {
        const lb = await getGroupLeaderboard(user.uid, groupLbId, true);
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
  }, [user, groupLbId]);

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
      contentContainerStyle={[layout.content, styles.content, layout.tabTop]}>
      <View style={styles.pageTitleRow}>
        <Icon name="people" size={26} color={c.textMuted} importantForAccessibility="no" />
        <Text style={[styles.title, { color: c.text }]}>Friends</Text>
      </View>

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
            {/* The tab already names the section; this just counts what's in it. */}
            <Text style={[styles.sectionCount, { color: c.textSecondary }]} accessibilityRole="header">
              {friendsLoaded ? `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}` : ''}
            </Text>
            <View style={styles.addBtnGroup}>
              <PressableScale
                pressedScale={0.92}
                style={[styles.scanBtn, { backgroundColor: c.card, borderColor: c.inputBorder }]}
                onPress={() => router.push('../qr-code?tab=scan')}
                accessibilityRole="button"
                accessibilityLabel="Scan a friend's QR code">
                <Icon name="qr-code-scanner" size={20} color={c.text} />
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
                      <PlayerAvatar value={req.avatarEmoji} size={38} />
                    </View>
                    <Text style={[styles.friendName, { color: c.textSecondary }]}>{req.name}</Text>
                  </View>
                  <View style={styles.requestActions}>
                    <PressableScale
                      pressedScale={0.97}
                      style={[styles.requestAcceptBtn, { backgroundColor: c.accent }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Accept friend request from ${req.name}`}
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
                      <PlayerAvatar value={req.avatarEmoji} size={38} />
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
                    {...({ dataSet: { textButton: 'danger' } } as object)}
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
                      <PlayerAvatar value={item.avatarEmoji} size={38} />
                    </View>
                    <View style={styles.friendTextBlock}>
                      <Text style={[styles.friendName, { color: c.textSecondary }]}>{item.name}</Text>
                      <Text style={[styles.friendMeta, { color: c.textHint }]}>
                        Since {formatDateDMY(item.addedAt)}
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
            <Text style={[styles.sectionCount, { color: c.textSecondary }]} accessibilityRole="header">
              {groupsLoaded ? `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}` : ''}
            </Text>
            <View style={styles.sectionHeaderActions}>
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
                  {/* Toggle and actions are siblings: buttons can't nest (invalid HTML on web, broken for assistive tech). */}
                  <View style={styles.groupHeader} {...({ dataSet: { hoverField: 'true' } } as object)}>
                  <Pressable
                    style={styles.groupToggle}
                    onPress={() => setExpandedGroupId(isExpanded ? null : group.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${group.name}, ${group.memberCount ?? 0} players`}
                    accessibilityHint={isExpanded ? 'Collapses the group' : 'Expands the group'}
                    accessibilityState={{ expanded: isExpanded }}
                    aria-expanded={isExpanded}>
                    <View style={styles.groupHeaderLeft}>
                      <Icon name="group" size={20} color={c.textMuted} />
                      {/* Name over count: keeps the name on one line beside the action buttons on narrow phones. */}
                      <View style={styles.groupHeaderText}>
                        <Text style={[styles.groupName, { color: c.text }]} numberOfLines={1}>
                          {group.name}
                        </Text>
                        <MetaLine
                          textStyle={[styles.groupCount, { color: c.textHint }]}
                          dotColor={c.textHint}
                          parts={[
                            <View key="members" style={styles.groupMembers}>
                              <Icon name="person" size={13} color={c.textHint} importantForAccessibility="no" />
                              <Text style={[styles.groupCount, { color: c.textHint }]}>{group.memberCount ?? 0}</Text>
                            </View>,
                            `Since ${formatDateDMY(group.createdAt)}`,
                          ]}
                        />
                      </View>
                    </View>
                  </Pressable>
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
                    </View>
                  </View>

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
                                    style={[styles.groupMemberRoleBadge, { backgroundColor: c.chipBg }]}>
                                    <Text style={[styles.groupMemberRoleBadgeText, { color: c.chipText }]}>Member</Text>
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
                          onPress={() => setMembersGroupId(group.id)}
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
                            { borderColor: c.border },
                          ]}
                          onPress={() => {
                            setGroupLeaderboardModalGroup(group);
                            setShowGroupLeaderboardModal(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`${group.name} leaderboard`}>
                          <Icon name="leaderboard" size={16} color={c.textSecondary} />
                          <Text style={[styles.manageBtnLabel, { color: c.textSecondary }]}>Leaderboard</Text>
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
            <Text style={[styles.sectionCount, { color: c.textSecondary }]} accessibilityRole="header">
              {leaderboard.length > 0 ? `${leaderboard.length} ${leaderboard.length === 1 ? 'player' : 'players'}` : ''}
            </Text>
            <View style={styles.sectionHeaderActions}>
              <View style={styles.lbSortWrap}>
              <PressableScale
                pressedScale={0.97}
                style={[styles.lbSortBtnLabeled, { backgroundColor: c.card, borderColor: c.inputBorder }]}
                onPress={() => setShowLeaderboardSortDropdown((prev) => !prev)}
                nativeID={SORT_TRIGGER_ID}
                accessibilityRole="button"
                accessibilityLabel={`Sort leaderboard by ${leaderboardSortBy === 'profit' ? 'profit' : 'name'}, ${leaderboardSortDirection === 'asc' ? 'ascending' : 'descending'}`}
                accessibilityState={{ expanded: showLeaderboardSortDropdown }}
                aria-expanded={showLeaderboardSortDropdown}
                aria-haspopup="menu"
                aria-controls={showLeaderboardSortDropdown ? SORT_MENU_ID : undefined}>
                <Icon name="sort" size={20} color={c.text} />
                <Text style={[styles.lbSortBtnText, { color: c.text }]}>
                  {leaderboardSortBy === 'profit' ? 'Profit' : 'Name'} ({leaderboardSortDirection === 'asc' ? 'Asc' : 'Desc'})
                </Text>
              </PressableScale>
              {showLeaderboardSortDropdown ? (
                <Motion.View
                  entering={menuEntering}
                  exiting={fadeOut}
                  nativeID={SORT_MENU_ID}
                  {...(IS_WEB
                    ? ({ role: 'menu', 'aria-label': 'Sort leaderboard', onKeyDown: onSortMenuKeyDown } as object)
                    : {})}
                  style={[styles.lbSortDropdown, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={[styles.lbSortSectionTitle, { color: c.textHint }]}>Sort by</Text>
                  <Pressable
                    style={(state) => [styles.lbSortOption, pressBg(c, state)]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: leaderboardSortBy === 'profit' }}
                    {...sortItemWebProps(leaderboardSortBy === 'profit')}
                    onPress={() => {
                      setLeaderboardSortBy('profit');
                      closeSortMenu(IS_WEB);
                    }}>
                    <View style={styles.lbSortOptionLabel}>
                    <Icon name="trend-up" size={18} color={leaderboardSortBy === 'profit' ? c.accentText : c.textMuted} />
                    <Text style={[styles.lbSortOptionText, { color: c.text }]}>Profit</Text>
                  </View>
                    {leaderboardSortBy === 'profit' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                  </Pressable>
                  <Pressable
                    style={(state) => [styles.lbSortOption, pressBg(c, state)]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: leaderboardSortBy === 'name' }}
                    {...sortItemWebProps(leaderboardSortBy === 'name')}
                    onPress={() => {
                      setLeaderboardSortBy('name');
                      closeSortMenu(IS_WEB);
                    }}>
                    <View style={styles.lbSortOptionLabel}>
                    <Icon name="person" size={18} color={leaderboardSortBy === 'name' ? c.accentText : c.textMuted} />
                    <Text style={[styles.lbSortOptionText, { color: c.text }]}>Name</Text>
                  </View>
                    {leaderboardSortBy === 'name' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                  </Pressable>
                  <View style={[styles.lbSortDivider, { backgroundColor: c.border }]} {...(IS_WEB ? ({ role: 'separator' } as object) : {})} />
                  <Text style={[styles.lbSortSectionTitle, { color: c.textHint }]}>Direction</Text>
                  <Pressable
                    style={(state) => [styles.lbSortOption, pressBg(c, state)]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: leaderboardSortDirection === 'desc' }}
                    {...sortItemWebProps(leaderboardSortDirection === 'desc')}
                    onPress={() => {
                      setLeaderboardSortDirection('desc');
                      closeSortMenu(IS_WEB);
                    }}>
                    <View style={styles.lbSortOptionLabel}>
                    <Icon name="sort" size={18} color={leaderboardSortDirection === 'desc' ? c.accentText : c.textMuted} />
                    <Text style={[styles.lbSortOptionText, { color: c.text }]}>Descending</Text>
                  </View>
                    {leaderboardSortDirection === 'desc' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                  </Pressable>
                  <Pressable
                    style={(state) => [styles.lbSortOption, pressBg(c, state)]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: leaderboardSortDirection === 'asc' }}
                    {...sortItemWebProps(leaderboardSortDirection === 'asc')}
                    onPress={() => {
                      setLeaderboardSortDirection('asc');
                      closeSortMenu(IS_WEB);
                    }}>
                    <View style={styles.lbSortOptionLabel}>
                    <Icon name="sort-asc" size={18} color={leaderboardSortDirection === 'asc' ? c.accentText : c.textMuted} />
                    <Text style={[styles.lbSortOptionText, { color: c.text }]}>Ascending</Text>
                  </View>
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
              message={lbFailed ? 'Check your connection and try again.' : 'Finish a session with friends to see the rankings.'}
              action={lbFailed ? { label: 'Try again', icon: 'refresh', onPress: retryLeaderboard } : undefined}
            />
          ) : (
            // Own wrapper: the screen's content gap (16) would otherwise split the joined rows apart.
            <View>
            {sortedLeaderboard.map((entry, idx) => {
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
                    <PlayerAvatar value={entry.avatarEmoji} size={34} />
                    <Text style={[styles.lbName, { color: isMe ? c.text : c.textSecondary }]}>
                      {entry.name}
                    </Text>
                  </View>
                  <Text style={[styles.lbProfit, { color: entry.totalProfit >= 0 ? c.profit : c.loss }]}>
                    {formatSignedCurrency(entry.totalProfit)}
                  </Text>
                </Motion.View>
              );
            })}
            </View>
          )}
        </>
      )}

      <ModalShell
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setRefCodeInput('');
          setRefCodeError(null);
        }}
        title="Send friend request"
        titleIcon={{ name: 'person-add', color: c.textMuted }}
        primary={{ label: 'Send request', onPress: handleAddFriend, busy: adding, icon: 'person-add' }}>
        <Text style={[styles.addCardSub, { color: c.textMuted }]}>Enter their 6-character ref code</Text>
        <View>
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
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            autoFocus={!IS_WEB}
            onSubmitEditing={handleAddFriend}
            style={[
              styles.codeInput,
              { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
              errorBorder(c, refCodeError),
            ]}
            {...invalidProps(refCodeError)}
          />
          <FieldError message={refCodeError} />
        </View>
      </ModalShell>

      <ModalShell
        visible={showGroupLeaderboardModal}
        onClose={() => setShowGroupLeaderboardModal(false)}
        title={groupLeaderboardModalGroup?.name ? `${groupLeaderboardModalGroup.name} Leaderboard` : 'Leaderboard'}
        titleIcon={{ name: 'leaderboard', color: c.textMuted }}
        avoidKeyboard={false}>
        <ScrollView style={styles.groupLbScroll} contentContainerStyle={styles.leaderboardBody}>
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
                    <PlayerAvatar value={entry.avatarEmoji} size={34} />
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
      </ModalShell>

      <ModalShell
        visible={renameGroupTarget != null}
        onClose={() => {
          if (renameGroupSaving) return;
          setRenameGroupTarget(null);
          setRenameGroupName('');
        }}
        title="Rename group"
        titleIcon={{ name: 'edit', color: c.textMuted }}
        primary={{ label: 'Save', onPress: handleConfirmRenameGroup, busy: renameGroupSaving, icon: 'check' }}>
        <Text style={[styles.addCardSub, { color: c.textMuted }]}>This name is only visible to you.</Text>
        <View>
          <TextInput
            value={renameGroupName}
            onChangeText={(t) => {
              setRenameGroupName(t);
              setRenameGroupError(null);
            }}
            placeholder="Group name"
            accessibilityLabel="Group name"
            placeholderTextColor={c.placeholder}
            autoCapitalize="words"
            autoComplete="off"
            autoFocus={!IS_WEB}
            editable={!renameGroupSaving}
            onSubmitEditing={handleConfirmRenameGroup}
            style={[
              styles.renameGroupInput,
              { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
              errorBorder(c, renameGroupError),
            ]}
            {...invalidProps(renameGroupError)}
          />
          <FieldError message={renameGroupError} />
        </View>
      </ModalShell>
      {showNewGroup ? (
        <NewGroupModal
          ownedCount={ownedGroupCount}
          onClose={() => setShowNewGroup(false)}
          onCreated={(groupId) => {
            setShowNewGroup(false);
            setMembersGroupId(groupId);
          }}
        />
      ) : null}
      {membersGroupId ? <GroupMembersModal groupId={membersGroupId} onClose={() => setMembersGroupId(null)} /> : null}
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
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: 48,
    gap: 16,
  },
  title: text.display,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
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
    height: 44,
  },
  lbSortBtnText: {
    ...text.label,
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
    ...text.section,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 4,
  },
  lbSortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 10,
    marginHorizontal: 4,
    borderRadius: 8,
  },
  lbSortOptionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lbSortOptionText: {
    ...text.rowTitle,
    fontWeight: '500',
  },
  lbSortDivider: {
    height: 1,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  sectionCount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    flexShrink: 1,
  },
  addBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanBtn: {
    width: 44,
    height: 44,
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
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  addBtnLabel: text.button,
  requestBlock: {
    gap: 0,
  },
  requestBlockTitle: {
    ...text.section,
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
    ...text.label,
    fontWeight: '600',
  },
  pendingHint: {
    ...text.label,
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
    ...text.rowTitle,
    fontWeight: '400',
  },
  guestLinkStrong: {
    fontWeight: '600',
  },
  cancelRequestLabel: {
    ...text.label,
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
  friendName: text.rowTitle,
  friendTextBlock: {
    minWidth: 0,
  },
  friendMeta: {
    ...text.rowMeta,
    marginTop: 2,
  },
  friendAvatar: text.heading,
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
    ...text.label,
    fontWeight: '600',
    width: 28,
    fontVariant: ['tabular-nums'],
  },
  lbName: text.rowTitle,
  lbAvatar: text.heading,
  lbProfit: text.amount,
  groupCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingRight: 10,
  },
  groupToggle: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  groupHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  groupMembers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupName: text.rowTitle,
  groupCount: text.rowMeta,
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Rename / delete / leave: same 40px circle so their hover rings match.
  groupIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    ...text.caption,
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
    ...text.rowTitle,
    fontWeight: '500',
  },
  groupMemberRoleBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  groupMemberRoleBadgeText: {
    ...text.label,
    color: '#fff',
    fontWeight: '600',
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
  manageBtnLabel: text.button,
  groupActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  groupMembersScroll: {
    maxHeight: 200,
  },
  addCardSub: text.caption,
  codeInput: {
    borderRadius: 9,
    borderWidth: 1,
    ...text.title,
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  renameGroupInput: {
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    fontSize: text.body.fontSize,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  disabled: {
    opacity: 0.4,
  },
  groupLbScroll: {
    maxHeight: 420,
  },
  leaderboardBody: {
    gap: 0,
    paddingBottom: 6,
  },
});
