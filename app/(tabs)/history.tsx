import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatDateDMY } from '@/lib/date-format';
import { getSessionHistoryForPlayer } from '@/lib/firestore';
import type { SessionRecord } from '@/types';

type HistoryEntry = SessionRecord & { totalBuyIn: number; cashOut: number; profit: number };

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

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <Text style={[styles.title, { color: c.text }]}>My Winnings</Text>

      <View
        style={[
          styles.summaryCard,
          { backgroundColor: c.card, borderColor: c.borderAccent },
        ]}>
        <Text style={[styles.summaryLabel, { color: c.textMuted }]}>Lifetime Profit/Loss</Text>
        <Text
          style={[
            styles.summaryValue,
            { color: totalProfit >= 0 ? c.profit : c.loss },
          ]}>
          {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
        </Text>
        <Text style={[styles.summaryMeta, { color: c.textHint }]}>
          {history.length} session{history.length !== 1 ? 's' : ''}
        </Text>
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
                  {item.label || 'Untitled Session'}
                </Text>
                <Text
                  style={[
                    styles.historyProfit,
                    { color: item.profit >= 0 ? c.profit : c.loss },
                  ]}>
                  {item.profit >= 0 ? '+' : ''}${item.profit.toFixed(2)}
                </Text>
              </View>
              <Text style={[styles.historyMeta, { color: c.textMuted }]}>
                {formatDateDMY(item.date)}
                {item.location ? ` • ${item.location}` : ''}
              </Text>
              <Text style={[styles.historyDetail, { color: c.textHint }]}>
                Buy-in: ${item.totalBuyIn.toFixed(2)}  Cash-out: ${item.cashOut.toFixed(2)}
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
