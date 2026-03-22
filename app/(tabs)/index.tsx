import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatDateDMY } from '@/lib/date-format';
import { getRecentSessionsForHost } from '@/lib/firestore';
import { useResolvedColorScheme } from '@/lib/theme-context';
import type { SessionRecord } from '@/types';

export default function HomeScreen() {
  const c = useAppColors();
  const scheme = useResolvedColorScheme();
  const router = useRouter();
  const { playerProfile } = useAuth();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function load() {
        if (!playerProfile) {
          return;
        }

        try {
          setError(null);
          const nextSessions = await getRecentSessionsForHost(playerProfile.id);
          if (isMounted) {
            setSessions(nextSessions);
          }
        } catch (e) {
          if (isMounted) {
            setError(e instanceof Error ? e.message : 'Failed to load sessions.');
          }
        }
      }

      void load();
      return () => {
        isMounted = false;
      };
    }, [playerProfile])
  );

  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status === 'active'),
    [sessions]
  );

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

      <View style={styles.statsRow}>
        <View
          style={[
            styles.statCard,
            { backgroundColor: c.card, borderColor: c.border },
          ]}>
          <Text style={[styles.statValue, { color: c.text }]}>{sessions.length}</Text>
          <Text style={[styles.statLabel, { color: c.textMuted }]}>Sessions</Text>
        </View>
        <View
          style={[
            styles.statCard,
            { backgroundColor: c.card, borderColor: c.border },
          ]}>
          <Text style={[styles.statValue, { color: c.text }]}>{activeSessions.length}</Text>
          <Text style={[styles.statLabel, { color: c.textMuted }]}>Active</Text>
        </View>
      </View>

      {error ? <Text style={{ color: c.loss }}>{error}</Text> : null}

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.cardLabel, { color: c.textMuted }]}>ACTIVE SESSIONS</Text>
        {activeSessions.length === 0 ? (
          <Text style={[styles.empty, { color: c.textHint }]}>
            No active sessions. Start a new game above.
          </Text>
        ) : (
          activeSessions.map((session) => (
            <Pressable
              key={session.id}
              onPress={() => router.push(`../session/${session.id}`)}
              style={[
                styles.sessionRow,
                { borderColor: c.borderAccent, backgroundColor: c.cardAlt },
              ]}>
              <View style={styles.sessionTop}>
                <Text style={[styles.sessionTitle, { color: c.text }]} numberOfLines={1}>
                  {session.label || 'Untitled Session'}
                </Text>
                <View style={[styles.liveBadge, { backgroundColor: c.badge.live }]}>
                  <Text style={[styles.liveBadgeText, { color: c.profit }]}>LIVE</Text>
                </View>
              </View>
              <Text style={[styles.sessionMeta, { color: c.textMuted }]}>
                {formatDateDMY(session.date)}
                {session.location ? ` · ${session.location}` : ''}
              </Text>
            </Pressable>
          ))
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
    marginTop: 12
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
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
  },
  sessionMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
});
