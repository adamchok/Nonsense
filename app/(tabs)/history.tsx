import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  formatCurrency,
  formatSignedCurrency,
  formatTightCompactNumber,
} from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { getSessionHistoryForPlayer } from '@/lib/firestore';
import type { SessionRecord } from '@/types';

type HistoryEntry = SessionRecord & { totalBuyIn: number; cashOut: number; profit: number };

function getSessionDurationMs(entry: HistoryEntry): number {
  if (!entry.finishedAt) return 0;
  const start = entry.date.getTime();
  const end = entry.finishedAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default function HistoryScreen() {
  const c = useAppColors();
  const router = useRouter();
  const { playerProfile } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      (async () => {
        if (!playerProfile) {
          setLoading(false);
          return;
        }
        try {
          setError(null);
          const data = await getSessionHistoryForPlayer(playerProfile.id);
          if (isMounted) setHistory(data);
        } catch (e) {
          if (isMounted) setError(e instanceof Error ? e.message : 'Failed to load history.');
        } finally {
          if (isMounted) setLoading(false);
        }
      })();
      return () => {
        isMounted = false;
      };
    }, [playerProfile])
  );

  const totalProfit = history.reduce((s, h) => s + h.profit, 0);
  const totalDurationMs = history.reduce((sum, h) => sum + getSessionDurationMs(h), 0);
  const totalHoursPlayed = totalDurationMs / 3_600_000;

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <Text style={[styles.title, { color: c.text }]}>My Winnings</Text>

      <View style={styles.summaryRow}>
        <View
          style={[
            styles.summaryCard,
            styles.summaryCardHalf,
            { backgroundColor: c.card, borderColor: c.borderAccent },
          ]}>
          <Text style={[styles.summaryLabel, { color: c.textMuted }]}>Lifetime Profit/Loss</Text>
          <Text
            style={[
              styles.summaryValue,
              { color: totalProfit >= 0 ? c.profit : c.loss },
            ]}>
            {formatTightCompactNumber(totalProfit)}
          </Text>
          <Text style={[styles.summaryMeta, { color: c.textHint }]}>
            {history.length} session{history.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View
          style={[
            styles.summaryCard,
            styles.summaryCardHalf,
            { backgroundColor: c.card, borderColor: c.border },
          ]}>
          <Text style={[styles.summaryLabel, { color: c.textMuted }]}>Total Played</Text>
          <Text style={[styles.summaryValue, { color: c.text }]}>
            {totalHoursPlayed.toFixed(1)}h
          </Text>
          <Text style={[styles.summaryMeta, { color: c.textHint }]}>Across all sessions</Text>
        </View>
      </View>

      {error ? <Text style={{ color: c.loss }}>{error}</Text> : null}

      {loading ? (
        <Text style={{ color: c.textMuted }}>Loading...</Text>
      ) : history.length === 0 ? (
        <Text style={{ color: c.textMuted }}>
          No completed sessions yet. Finish a game to see your history.
        </Text>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.historyCard,
                { backgroundColor: c.card, borderColor: c.border },
              ]}
              onPress={() => router.push(`../session/summary/${item.id}`)}>
              <View style={styles.historyTop}>
                <Text style={[styles.historyLabel, { color: c.text }]}>
                  {formatDateTimeDMY(item.date)}
                </Text>
                <Text
                  style={[
                    styles.historyProfit,
                    { color: item.profit >= 0 ? c.profit : c.loss },
                  ]}>
                  {formatSignedCurrency(item.profit)}
                </Text>
              </View>
              <Text style={[styles.historyMeta, { color: c.textMuted }]}>
                {item.location ? item.location : 'No location'} • {formatDuration(getSessionDurationMs(item))}
              </Text>
              <Text style={[styles.historyDetail, { color: c.textHint }]}>
                Buy-in: {formatCurrency(item.totalBuyIn)}  Cash-out: {formatCurrency(item.cashOut)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
    paddingTop: 48,
    gap: 16,
  },
  /** Matches Settings tab screen title */
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  summaryCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCardHalf: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 13,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  summaryMeta: {
    fontSize: 12,
  },
  list: {
    flex: 1,
  },
  historyCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    marginBottom: 8,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyLabel: {
    fontWeight: '600',
    flex: 1,
  },
  historyProfit: {
    fontWeight: '700',
    fontSize: 15,
  },
  historyMeta: {
    fontSize: 12,
  },
  historyDetail: {
    fontSize: 12,
  },
});
