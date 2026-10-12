import { usePageLayout } from '@/hooks/use-page-layout';
import { MetaLine, SessionTitle } from '@/components/meta-line';
import { PlayerAvatar } from '@/components/player-avatar';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { formatSessionBlindsForDisplay } from '@/lib/currency-format';
import { formatSessionDay, formatSessionTime, formatSessionTitle } from '@/components/session/session-title';
import {
  getBuyIns,
  getFriendLeaderboard,
  getPlayerAppStatistics,
  getRecentSessionsForPlayer,
  getSessionHistoryPage,
  type PlayerAppStatistics,
  type SessionHistoryEntry,
} from '@/lib/firestore';
import { FriendsBoard, HomeStats, HomeTrend, RecentResults } from '@/components/home-overview';
import type { SessionRecord } from '@/types';
import { Icon, type IconName } from '@/components/icon';
import { Skeleton, SkeletonGroup } from '@/components/skeleton';
import { radius } from '@/lib/spacing';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  AppState,
  type AppStateStatus,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { text as type, pressBg, ui } from '@/lib/ui';
import { userMessage } from '@/lib/user-message';
import { EmptyState } from '@/components/empty-state';
import {
  Animated as Motion,
  PressableScale,
  fadeIn,
  fadeOut,
  layoutTransition,
  listItemEntering,
} from '@/components/motion';

/** Enough finished sessions for a meaningful trend line; the list shows only the newest few. */
const RECENT_RESULTS_COUNT = 30;
const YEAR_PAGE_SIZE = 50;

/**
 * Newest-first pages back to 1 Jan, so the Home chart covers the whole year (not just the latest page).
 * Stops paging once a page reaches last year. Also returns everything loaded for the recent list.
 */
async function loadYearToDate(playerId: string): Promise<{ loaded: SessionHistoryEntry[]; year: SessionHistoryEntry[] }> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const loaded: SessionHistoryEntry[] = [];
  let cursor: Parameters<typeof getSessionHistoryPage>[2] = null;
  do {
    const page = await getSessionHistoryPage(playerId, YEAR_PAGE_SIZE, cursor);
    loaded.push(...page.entries);
    const oldest = page.entries[page.entries.length - 1];
    cursor = page.hasMore && oldest && oldest.date >= yearStart ? page.lastDoc : null;
  } while (cursor);
  return { loaded, year: loaded.filter((e) => e.date >= yearStart) };
}
const COMPACT_ROW_WIDTH = 480;
// Below this the header CTA reads "New" so the greeting keeps one line beside avatar + button.
const SHORT_CTA_WIDTH = 380;
const PHONE_TOP_EXTRA = 16;
const AVATAR_SMALL = 46;
const AVATAR_LARGE = 56;

export default function HomeScreen() {
  const c = useAppColors();
  const layout = usePageLayout(40);
  const router = useRouter();
  const { isMd, width } = useBreakpoint();
  // Phones: drop the decorative tile, move "Live" into the meta line and let text wrap instead of truncating.
  const compactRows = width < COMPACT_ROW_WIDTH;
  const shortCta = width < SHORT_CTA_WIDTH;
  // The web sidebar already carries the profile and a New session button, so Home drops its copies.
  const hasSidebar = Platform.OS === 'web' && isMd;
  const { playerProfile } = useAuth();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionMetaById, setSessionMetaById] = useState<Record<string, { playerCount: number; totalBuyIns: number }>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // undefined while loading; null when the overview failed (the sections just stay hidden).
  const [stats, setStats] = useState<PlayerAppStatistics | null | undefined>(undefined);
  const [recent, setRecent] = useState<SessionHistoryEntry[] | undefined>(undefined);
  const [yearEntries, setYearEntries] = useState<SessionHistoryEntry[] | undefined>(undefined);
  const [board, setBoard] = useState<Awaited<ReturnType<typeof getFriendLeaderboard>> | undefined>(undefined);

  const loadOverview = useCallback(
    async (opts?: { signal?: AbortSignal; force?: boolean }) => {
      if (!playerProfile) return;
      const [statsResult, recentResult, boardResult] = await Promise.allSettled([
        getPlayerAppStatistics(playerProfile.id, opts?.force),
        loadYearToDate(playerProfile.id),
        getFriendLeaderboard(playerProfile.id, opts?.force),
      ]);
      if (opts?.signal?.aborted) return;
      setStats(statsResult.status === 'fulfilled' ? statsResult.value : null);
      setRecent(recentResult.status === 'fulfilled' ? recentResult.value.loaded.slice(0, RECENT_RESULTS_COUNT) : []);
      setYearEntries(recentResult.status === 'fulfilled' ? recentResult.value.year : []);
      setBoard(boardResult.status === 'fulfilled' ? boardResult.value : []);
    },
    [playerProfile],
  );

  const loadSessions = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      if (!playerProfile) {
        return;
      }

      try {
        setError(null);
        const nextSessions = await getRecentSessionsForPlayer(playerProfile.id);
        if (opts?.signal?.aborted) {
          return;
        }
        setSessions(nextSessions);
        const active = nextSessions.filter((s) => s.status === 'active');
        const metaEntries = await Promise.all(
          active.map(async (session) => {
            const buyIns = await getBuyIns(session.id);
            const playerIds = new Set(buyIns.map((b) => b.playerId));
            const totalBuyIns = buyIns.reduce((sum, b) => sum + b.amount, 0);
            return [session.id, { playerCount: playerIds.size, totalBuyIns }] as const;
          }),
        );
        if (opts?.signal?.aborted) {
          return;
        }
        setSessionMetaById(Object.fromEntries(metaEntries));
        setIsLoaded(true);
      } catch (e) {
        if (opts?.signal?.aborted) {
          return;
        }
        setError(userMessage(e, 'Failed to load sessions.'));
        setIsLoaded(true);
      }
    },
    [playerProfile],
  );

  useFocusEffect(
    useCallback(() => {
      const ac = new AbortController();
      void loadSessions({ signal: ac.signal });
      void loadOverview({ signal: ac.signal });
      return () => ac.abort();
    }, [loadSessions, loadOverview]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && playerProfile) {
        void loadSessions();
      }
    });
    return () => sub.remove();
  }, [playerProfile, loadSessions]);

  const activeSessions = useMemo(() => sessions.filter((s) => s.status === 'active'), [sessions]);
  // Pull-to-refresh (native only); the list also reloads on every screen focus.
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([loadSessions(), loadOverview({ force: true })]);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, loadSessions, loadOverview]);

  const avatarSize = hasSidebar ? AVATAR_LARGE : AVATAR_SMALL;
  const greeting = greetingForHour(new Date().getHours());
  const avatarButton = playerProfile ? (
    <PressableScale
      pressedScale={0.94}
      onPress={() => router.push('/profile')}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      style={[
        styles.avatar,
        { width: avatarSize + 2, height: avatarSize + 2, borderRadius: avatarSize / 2 + 1 },
        { backgroundColor: c.card, borderColor: c.border },
      ]}>
      <PlayerAvatar value={playerProfile.avatarEmoji} size={avatarSize} />
    </PressableScale>
  ) : null;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={[
        layout.content,
        styles.content,
        layout.tabTop,
        // Phones (app + mobile web): the removed logo used to give the greeting breathing room at the top.
        // Desktop web has its own larger top padding (contentWide).
        !isMd && { paddingTop: Number(layout.tabTop?.paddingTop ?? 0) + PHONE_TOP_EXTRA },
        isMd && styles.contentWide,
      ]}
      refreshControl={
        Platform.OS === 'web' ? undefined : (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={c.textMuted}
            colors={[c.accent]}
            progressBackgroundColor={c.card}
          />
        )
      }>
      <View style={styles.header}>
        {/* Avatar leads the greeting like a profile header. */}
        {avatarButton}
        <View style={styles.headerText}>
          <Motion.View entering={fadeIn} style={styles.greetingRow}>
            <Icon name={greeting.icon} size={14} color={c.textMuted} importantForAccessibility="no" />
            <Text style={[styles.eyebrow, styles.shrink, { color: c.textMuted }]} numberOfLines={1}>
              {greeting.label}
            </Text>
          </Motion.View>
          <Motion.Text
            entering={listItemEntering(1)}
            style={[styles.name, { color: c.text }]}
            numberOfLines={1}
            accessibilityRole="header">
            {playerProfile ? playerProfile.name : 'Welcome'}
          </Motion.Text>
          {playerProfile ? null : (
            <Text style={[styles.headerSub, { color: c.textMuted }]}>Set up your profile to begin.</Text>
          )}
        </View>
        {/* Phones: the main action sits beside the greeting (desktop has it in the sidebar). */}
        {hasSidebar ? null : (
          <PressableScale
            style={[styles.ctaCompact, { backgroundColor: c.accent }]}
            accessibilityRole="button"
            accessibilityLabel="New session"
            onPress={() => router.push('../session/new')}>
            <Icon name="add" size={16} color={c.onAccent} importantForAccessibility="no" />
            <Text style={[styles.ctaCompactText, { color: c.onAccent }]} numberOfLines={1}>
              {shortCta ? 'New' : 'New session'}
            </Text>
          </PressableScale>
        )}
      </View>


      {playerProfile ? <HomeStats stats={stats} wide={isMd} /> : null}

      {error ? <Text style={[type.label, { color: c.loss }]}>{error}</Text> : null}

      <View style={styles.section}>
        <View style={ui.sectionHeaderRow}>
          <View style={styles.sectionTitleRow}>
            <Icon name="poker-chip" size={14} color={c.textMuted} style={styles.sectionIcon} />
            <Text style={[type.section, { color: c.textMuted }]} accessibilityRole="header">
              Active sessions
            </Text>
          </View>
        </View>
        <View style={[ui.card, { backgroundColor: c.card, borderColor: c.border }]}>
          {!isLoaded && playerProfile ? (
            <ActiveSessionsSkeleton />
          ) : activeSessions.length === 0 ? (
            <EmptyState
              compact
              icon="poker-chip"
              title="No active sessions"
              message="Start a new game to track buy-ins live."
            />
          ) : (
            activeSessions.map((session, index) => {
              const blindsText = formatSessionBlindsForDisplay(
                session.smallBlind,
                session.bigBlind,
                session.amountUnit,
                session.dollarsPerChip,
              );
              return (
                <Motion.View
                  key={session.id}
                  entering={listItemEntering(index)}
                  exiting={fadeOut}
                  layout={layoutTransition}>
                  <PressableScale
                    pressedScale={0.985}
                    onPress={() => router.push(`../session/${session.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={[
                      `Live session ${formatSessionTitle(session.date, session.location)}`,
                      `started ${formatSessionTime(session.date)}`,
                      `${sessionMetaById[session.id]?.playerCount ?? 0} players`,
                      blindsText ? `blinds ${blindsText}` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    style={(state) => [
                      ui.row,
                      index > 0 && ui.rowDivider,
                      { borderColor: c.border },
                      pressBg(c, state, c.card),
                    ]}>
                    {/* Pulsing dot = live, at every width (replaces the chip tile and the separate Live dot). */}
                    <View style={styles.pulseSlot}>
                      <LivePulse color={c.profit} />
                    </View>
                    <View style={ui.rowBody}>
                      {compactRows ? (
                        // Narrow: place as the title, then date + time, then players + stakes. Each line is
                        // short, so nothing wraps mid-line or leaves a dangling separator dot.
                        <>
                          <Text style={[type.rowTitle, { color: c.text }]} numberOfLines={1}>
                            {session.location?.trim() || formatSessionDay(session.date)}
                          </Text>
                          <MetaLine
                            textStyle={[styles.sessionMeta, { color: c.textMuted }]}
                            parts={[
                              session.location?.trim() ? formatSessionDay(session.date) : null,
                              formatSessionTime(session.date),
                            ]}
                          />
                          <MetaLine
                            textStyle={[styles.sessionMeta, { color: c.textMuted }]}
                            parts={[
                              <View key="players" style={styles.sessionMetaWithIcon}>
                              <Icon name="person" size={14} color={c.textMuted} />
                              <Text style={[styles.sessionMeta, { color: c.textMuted }]}>
                                {sessionMetaById[session.id]?.playerCount ?? 0}
                              </Text>
                            </View>,
                              blindsText,
                            ]}
                          />
                        </>
                      ) : (
                        <>
                          <SessionTitle
                            date={session.date}
                            location={session.location}
                            textStyle={[type.rowTitle, { color: c.text }]}
                          />
                          <MetaLine
                            textStyle={[styles.sessionMeta, { color: c.textMuted }]}
                            parts={[
                              formatSessionTime(session.date),
                              <View key="players" style={styles.sessionMetaWithIcon}>
                              <Icon name="person" size={14} color={c.textMuted} />
                              <Text style={[styles.sessionMeta, { color: c.textMuted }]}>
                                {sessionMetaById[session.id]?.playerCount ?? 0}
                              </Text>
                            </View>,
                              blindsText,
                            ]}
                          />
                        </>
                      )}
                    </View>
                    {compactRows ? null : <Text style={[styles.liveText, { color: c.profit }]}>Live</Text>}
                    <Icon name="chevron-right" size={20} color={c.textMuted} importantForAccessibility="no" />
                  </PressableScale>
                </Motion.View>
              );
            })
          )}
        </View>
      </View>

      {playerProfile ? (
        <>
          <HomeTrend entries={yearEntries} />
          {/* Desktop: results and leaderboard side by side; phones stack them. */}
          <View style={isMd ? styles.twoCol : styles.stack}>
            <RecentResults entries={recent} style={isMd && styles.col} />
            <FriendsBoard rows={board} myId={playerProfile.id} style={isMd && styles.col} />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function greetingForHour(hour: number): { label: string; icon: IconName } {
  if (hour >= 5 && hour < 12) return { label: 'Good morning', icon: 'sunrise' };
  if (hour >= 12 && hour < 18) return { label: 'Good afternoon', icon: 'wb-sunny' };
  return { label: 'Good evening', icon: 'moon-stars' };
}

/** Live indicator: solid dot with a ring that expands and fades, like a radar ping. Static under reduced motion. */
function LivePulse({ color }: { color: string }) {
  const reduceMotion = useReducedMotion();
  const ping = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    ping.set(withRepeat(withTiming(1, { duration: 1400, reduceMotion: ReduceMotion.System }), -1, false));
  }, [ping, reduceMotion]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - ping.value),
    transform: [{ scale: 1 + ping.value * 1.6 }],
  }));
  return (
    <View style={styles.pulseWrap}>
      {reduceMotion ? null : <Motion.View style={[styles.pulseRing, { backgroundColor: color }, ring]} />}
      <View style={[styles.liveDot, { backgroundColor: color }]} />
    </View>
  );
}

function ActiveSessionsSkeleton() {
  const c = useAppColors();
  return (
    <SkeletonGroup label="Loading active sessions">
      {[0, 1].map((index) => (
        <View key={index} style={[ui.row, index > 0 && ui.rowDivider, { borderColor: c.border }]}>
          <Skeleton width={32} height={32} radius={radius.tight} />
          <View style={[ui.rowBody, styles.skeletonBody]}>
            <Skeleton width="55%" height={15} />
            <Skeleton width="70%" height={12} />
          </View>
          <Skeleton width={40} height={16} radius={8} />
          <Icon name="chevron-right" size={20} color={c.textMuted} importantForAccessibility="no" />
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  twoCol: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
  },
  stack: {
    gap: 32,
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  skeletonBody: {
    gap: 7,
    paddingVertical: 2,
  },
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: 32,
  },
  // Desktop web: more breathing room above the greeting.
  contentWide: {
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shrink: {
    flexShrink: 1,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: type.label,
  ctaCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexShrink: 0,
  },
  ctaCompactText: {
    fontSize: 14,
    fontWeight: '600',
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: type.display,
  headerSub: {
    ...type.caption,
    marginTop: 2,
  },
  avatar: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
    includeFontPadding: false,
  },
  // Pulls the label 2px toward the icon so it matches the 6px icon gap of the other Home sections.
  sectionIcon: {
    marginRight: -2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  section: {
    gap: 14,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  // Just the pulsing dot (no tile): narrow slot so the title sits close.
  pulseSlot: {
    width: 16,
    // Row gap is tight for a bare dot; extra room before the title.
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseWrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  liveText: {
    ...type.label,
    fontWeight: '600',
  },
  sessionMetaWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sessionMeta: type.rowMeta,
});
