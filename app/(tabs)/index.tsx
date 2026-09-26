import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatSessionBlindsForDisplay } from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { getBuyIns, getRecentSessionsForPlayer } from '@/lib/firestore';
import { useResolvedColorScheme } from '@/lib/theme-context';
import type { SessionRecord } from '@/types';
import { Icon } from '@/components/icon';
import { Skeleton, SkeletonGroup } from '@/components/skeleton';
import { radius } from '@/lib/spacing';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, type AppStateStatus, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { text as type, pressBg, ui } from '@/lib/ui';
import { userMessage } from '@/lib/user-message';
import { EmptyState } from '@/components/empty-state';
import { Animated as Motion, PressableScale, fadeIn, fadeOut, layoutTransition, listItemEntering } from '@/components/motion';

export default function HomeScreen() {
  const c = useAppColors();
  const layout = usePageLayout(40);
  const scheme = useResolvedColorScheme();
  const router = useRouter();
  const { playerProfile } = useAuth();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionMetaById, setSessionMetaById] = useState<Record<string, { playerCount: number; totalBuyIns: number }>>({});
  const [error, setError] = useState<string | null>(null);
  /** False until the first load settles, so the card shows bones instead of a false "No active sessions". */
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
        <Motion.Image
          entering={fadeIn}
          source={
            scheme === 'dark'
              ? require('@/assets/images/logo-large.png')
              : require('@/assets/images/logo-light-large.png')
          }
          style={styles.logo}
          accessible={false}
        />
        {playerProfile ? (
          <>
            <Motion.Text entering={listItemEntering(1)} style={[styles.welcomeGreeting, { color: c.text }]}>
              Hey, {playerProfile.name} 👋
            </Motion.Text>
            <Motion.Text entering={listItemEntering(2)} style={[styles.welcomeSub, { color: c.textMuted }]}>
              Ready to deal some cards?
            </Motion.Text>
          </>
        ) : (
          <Text style={[styles.welcomeSub, { color: c.textMuted }]}>
            Set up your profile to begin.
          </Text>
        )}
      </View>

      <PressableScale
        style={[ui.button, { backgroundColor: c.accent }]}
        accessibilityRole="button"
        onPress={() => router.push('../session/new')}>
        <Icon name="add" size={20} color={c.onAccent} importantForAccessibility="no" />
        <Text style={[type.button, styles.ctaText, { color: c.onAccent }]}>Start New Session</Text>
      </PressableScale>

      {error ? <Text style={[type.label, { color: c.loss }]}>{error}</Text> : null}

      <View style={styles.section}>
        <View style={ui.sectionHeaderRow}>
          <Text style={[type.section, { color: c.textMuted }]} accessibilityRole="header">
            Active sessions
          </Text>
          <PressableScale
            pressedScale={0.92}
            style={(state) => [ui.iconButton, styles.refreshBtn, { borderColor: c.border }, pressBg(c, state, c.card)]}
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
                <View style={[styles.liveBadge, { backgroundColor: c.badge.live }]}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
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

/** Bones in the exact spots of an active-session row: tile, date, meta line, LIVE badge, chevron. */
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
          <Skeleton width={36} height={17} radius={4} />
          <Icon name="chevron-right" size={20} color={c.textMuted} importantForAccessibility="no" />
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  /** Text lines are 20 + 16 tall with a 2px gap; bones are shorter, so pad the gap to match. */
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
  header: {
    alignItems: 'center',
    gap: 6,
  },
  logo: {
    width: 144,
    height: 144,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  welcomeGreeting: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  welcomeSub: {
    fontSize: 15,
    lineHeight: 21,
  },
  ctaText: {
  },
  section: {
    gap: 14,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
  },
  liveBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#fff',
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
