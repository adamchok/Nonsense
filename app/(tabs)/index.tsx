import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatSessionBlindsForDisplay } from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { getBuyIns, getRecentSessionsForPlayer } from '@/lib/firestore';
import type { SessionRecord } from '@/types';
import { Icon } from '@/components/icon';
import { Skeleton, SkeletonGroup } from '@/components/skeleton';
import { radius } from '@/lib/spacing';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Animated, AppState, type AppStateStatus, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { text as type, pressBg, ui } from '@/lib/ui';
import { userMessage } from '@/lib/user-message';
import { EmptyState } from '@/components/empty-state';
import { Animated as Motion, PressableScale, fadeIn, fadeOut, layoutTransition, listItemEntering } from '@/components/motion';

export default function HomeScreen() {
  const c = useAppColors();
  const layout = usePageLayout(40);
  const router = useRouter();
  const { playerProfile } = useAuth();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionMetaById, setSessionMetaById] = useState<Record<string, { playerCount: number; totalBuyIns: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshSpin = useRef(new Animated.Value(0)).current;

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
          })
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
    [playerProfile]
  );

  useFocusEffect(
    useCallback(() => {
      const ac = new AbortController();
      void loadSessions({ signal: ac.signal });
      return () => ac.abort();
    }, [loadSessions])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && playerProfile) {
        void loadSessions();
      }
    });
    return () => sub.remove();
  }, [playerProfile, loadSessions]);

  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status === 'active'),
    [sessions]
  );
  const refreshRotate = refreshSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    if (!isRefreshing) {
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
  }, [isRefreshing, refreshSpin]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    let loaded = false;
    try {
      await loadSessions();
      loaded = true;
    } finally {
      setIsRefreshing(false);
      if (loaded) {
        refreshSpin.stopAnimation(() => {
          refreshSpin.setValue(0);
        });
      }
    }
  }, [isRefreshing, loadSessions, refreshSpin]);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={[layout.content, styles.content]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Motion.Text entering={fadeIn} style={[styles.eyebrow, { color: c.textMuted }]}>
            {greetingForHour(new Date().getHours())}
          </Motion.Text>
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
        {playerProfile ? (
          <PressableScale
            pressedScale={0.94}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            style={[styles.avatar, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={styles.avatarEmoji}>{playerProfile.avatarEmoji ?? '🙂'}</Text>
          </PressableScale>
        ) : null}
      </View>

      <View style={styles.ctaBlock}>
        <PressableScale
          style={[ui.button, styles.cta, { backgroundColor: c.accent }]}
          accessibilityRole="button"
          onPress={() => router.push('../session/new')}>
          <Icon name="add" size={22} color={c.onAccent} importantForAccessibility="no" />
          <Text style={[type.button, styles.ctaText, { color: c.onAccent }]}>Start New Session</Text>
        </PressableScale>
        <Text style={[styles.ctaHint, { color: c.textHint }]}>Track buy-ins live and settle up at the end.</Text>
      </View>

      {error ? <Text style={[type.label, { color: c.loss }]}>{error}</Text> : null}

      <View style={styles.section}>
        <View style={ui.sectionHeaderRow}>
          <View style={styles.sectionTitleRow}>
            <Text style={[type.section, { color: c.textMuted }]} accessibilityRole="header">
              Active sessions
            </Text>
            {isLoaded && activeSessions.length > 0 ? (
              <View style={[styles.countPill, { backgroundColor: c.accentBg }]}>
                <Text style={[styles.countPillText, { color: c.accentText }]}>{activeSessions.length}</Text>
              </View>
            ) : null}
          </View>
          <PressableScale
            pressedScale={0.92}
            style={(state) => [ui.iconButton, styles.refreshBtn, pressBg(c, state, 'transparent')]}
            onPress={() => void handleRefresh()}
            disabled={isRefreshing}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh active sessions">
            <Animated.View style={{ transform: [{ rotate: refreshRotate }] }}>
              <Icon name="refresh" size={18} color={c.textMuted} />
            </Animated.View>
          </PressableScale>
        </View>
        <View style={[ui.card, { backgroundColor: c.card, borderColor: c.border }]}>
          {!isLoaded && playerProfile ? (
            <ActiveSessionsSkeleton />
          ) : activeSessions.length === 0 ? (
            <EmptyState
              compact
              icon="style"
              title="No active sessions"
              message="Start a new game to track buy-ins live."
            />
          ) : (
            activeSessions.map((session, index) => {
              const blindsText = formatSessionBlindsForDisplay(
                session.smallBlind,
                session.bigBlind,
                session.amountUnit,
                session.dollarsPerChip
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
                  `Live session ${formatDateTimeDMY(session.date)}`,
                  session.location ? session.location : 'No location',
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
                <View style={[ui.tile, { backgroundColor: c.accentBg }]}>
                  <Icon name="style" size={18} color={c.accentText} />
                </View>
                <View style={ui.rowBody}>
                  <Text style={[type.rowTitle, { color: c.text }]} numberOfLines={1}>
                    {formatDateTimeDMY(session.date)}
                  </Text>
                  <View style={styles.sessionMetaRow}>
                    <Text style={[styles.sessionMeta, { color: c.textMuted }]}>
                      {session.location ? session.location : 'No location'}
                    </Text>
                    <Text style={[styles.sessionMeta, { color: c.textMuted }]}> • </Text>
                    <View style={styles.sessionMetaWithIcon}>
                      <Icon name="person" size={14} color={c.textMuted} />
                      <Text style={[styles.sessionMeta, { color: c.textMuted }]}>
                        {sessionMetaById[session.id]?.playerCount ?? 0}
                      </Text>
                    </View>
                    {blindsText ? (
                      <Text style={[styles.sessionMeta, { color: c.textMuted }]}>{` • ${blindsText}`}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.live}>
                  <LiveDot color={c.profit} />
                  <Text style={[styles.liveText, { color: c.profit }]}>Live</Text>
                </View>
                <Icon name="chevron-right" size={20} color={c.textMuted} importantForAccessibility="no" />
              </PressableScale>
              </Motion.View>
              );
            })
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function LiveDot({ color }: { color: string }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withTiming(0.35, { duration: 900, reduceMotion: ReduceMotion.System }), -1, true);
  }, [pulse, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Motion.View style={[styles.liveDot, { backgroundColor: color }, animated]} />;
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
  skeletonBody: {
    gap: 7,
    paddingVertical: 2,
  },
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  name: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 24,
  },
  ctaBlock: {
    gap: 10,
  },
  cta: {
    minHeight: 56,
    borderRadius: 16,
  },
  ctaText: {
    fontSize: 16,
  },
  ctaHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countPill: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: 14,
  },
  refreshBtn: {
    width: 36,
    height: 36,
  },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sessionMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 2,
  },
  sessionMetaWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sessionMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
});
