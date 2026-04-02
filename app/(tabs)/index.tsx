import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatBlinds } from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { getBuyIns, getRecentSessionsForPlayer } from '@/lib/firestore';
import { useResolvedColorScheme } from '@/lib/theme-context';
import type { SessionRecord } from '@/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, type AppStateStatus, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  const c = useAppColors();
  const scheme = useResolvedColorScheme();
  const router = useRouter();
  const { playerProfile } = useAuth();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionMetaById, setSessionMetaById] = useState<Record<string, { playerCount: number; totalBuyIns: number }>>({});
  const [error, setError] = useState<string | null>(null);
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
      } catch (e) {
        if (opts?.signal?.aborted) {
          return;
        }
        setError(e instanceof Error ? e.message : 'Failed to load sessions.');
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
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Image
          source={
            scheme === 'dark'
              ? require('@/assets/images/logo-large.png')
              : require('@/assets/images/logo-light-large.png')
          }
          style={styles.logo}
        />
        {playerProfile ? (
          <>
            <Text style={[styles.welcomeGreeting, { color: c.text }]}>
              Hey, {playerProfile.name} 👋
            </Text>
            <Text style={[styles.welcomeSub, { color: c.textMuted }]}>
              Ready to deal some cards?
            </Text>
          </>
        ) : (
          <Text style={[styles.welcomeSub, { color: c.textMuted }]}>
            Set up your profile to begin.
          </Text>
        )}
      </View>

      <Pressable
        style={[styles.cta, { backgroundColor: c.accent }]}
        onPress={() => router.push('../session/new')}>
        <Text style={styles.ctaText}>Start New Session</Text>
      </Pressable>

      {error ? <Text style={{ color: c.loss }}>{error}</Text> : null}

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardLabel, { color: c.textMuted }]}>ACTIVE SESSIONS</Text>
          <Pressable
            style={[styles.refreshBtn, { borderColor: c.border, backgroundColor: c.cardAlt }]}
            onPress={() => void handleRefresh()}
            disabled={isRefreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh active sessions">
            <Animated.View style={{ transform: [{ rotate: refreshRotate }] }}>
              <MaterialIcons name="refresh" size={16} color={c.textMuted} />
            </Animated.View>
          </Pressable>
        </View>
        {activeSessions.length === 0 ? (
          <Text style={[styles.empty, { color: c.textHint }]}>
            No active sessions. Start a new game above.
          </Text>
        ) : (
          activeSessions.map((session) => {
            const blindsText = formatBlinds(session.smallBlind, session.bigBlind);
            return (
            <Pressable
              key={session.id}
              onPress={() => router.push(`../session/${session.id}`)}
              style={[
                styles.sessionRow,
                { borderColor: c.borderAccent, backgroundColor: c.cardAlt },
              ]}>
              <View style={styles.sessionTop}>
                <Text style={[styles.sessionTitle, { color: c.text }]} numberOfLines={1}>
                  {formatDateTimeDMY(session.date)}
                </Text>
                <View style={[styles.liveBadge, { backgroundColor: c.badge.live }]}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              </View>
              <View style={styles.sessionMetaRow}>
                <Text style={[styles.sessionMeta, { color: c.textMuted }]}>
                  {session.location ? session.location : 'No location'}
                </Text>
                <Text style={[styles.sessionMeta, { color: c.textMuted }]}> • </Text>
                <View style={styles.sessionMetaWithIcon}>
                  <MaterialIcons name="person" size={14} color={c.textMuted} />
                  <Text style={[styles.sessionMeta, { color: c.textMuted }]}>
                    {sessionMetaById[session.id]?.playerCount ?? 0}
                  </Text>
                </View>
                {blindsText ? (
                  <Text style={[styles.sessionMeta, { color: c.textMuted }]}>{` • ${blindsText}`}</Text>
                ) : null}
              </View>
            </Pressable>
            );
          })
        )}
      </View>
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
  header: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: 4,
  },
  logo: {
    width: 160,
    height: 160,
    resizeMode: 'contain',
    marginTop: 12,
    marginBottom: 12,
  },
  welcomeGreeting: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  welcomeSub: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: -2,
  },
  cta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    paddingTop: 14,
    gap: 14,
  },
  cardHeader: {
    position: 'relative',
    minHeight: 28,
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    paddingRight: 36,
  },
  refreshBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    borderRadius: 8,
    borderWidth: 1,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    fontSize: 14,
  },
  sessionRow: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  sessionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  sessionTitle: {
    fontWeight: '600',
    fontSize: 15,
    flex: 1,
  },
  liveBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
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
    fontWeight: '500',
  },
});
