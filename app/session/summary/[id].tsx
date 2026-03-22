import { useNavigation } from '@react-navigation/native';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAppColors } from '@/lib/app-theme';
import { getEarlyCashOuts, getResults, getSessionLabel } from '@/lib/firestore';
import type { EarlyCashOut, SessionResult } from '@/types';

interface Settlement {
  from: string;
  to: string;
  amount: number;
}

function computeSettlements(results: SessionResult[]): Settlement[] {
  const balances = results.map((r) => ({
    name: r.playerName,
    balance: r.profit,
  }));

  const debtors = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({ ...b, balance: Math.abs(b.balance) }))
    .sort((a, b) => b.balance - a.balance);

  const creditors = balances
    .filter((b) => b.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const transfer = Math.min(debtors[i].balance, creditors[j].balance);
    if (transfer > 0.01) {
      settlements.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount: Math.round(transfer * 100) / 100,
      });
    }
    debtors[i].balance -= transfer;
    creditors[j].balance -= transfer;
    if (debtors[i].balance < 0.01) i++;
    if (creditors[j].balance < 0.01) j++;
  }

  return settlements;
}

export default function SessionSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const c = useAppColors();
  const [results, setResults] = useState<SessionResult[]>([]);
  const [earlyCashOuts, setEarlyCashOuts] = useState<EarlyCashOut[]>([]);
  const [sessionLabel, setSessionLabel] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    const trimmed = sessionLabel?.trim();
    navigation.setOptions({
      title: trimmed && trimmed.length > 0 ? trimmed : 'Session Summary',
    });
  }, [navigation, sessionLabel]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [data, early, label] = await Promise.all([
          getResults(id),
          getEarlyCashOuts(id),
          getSessionLabel(id),
        ]);
        setResults(data.sort((a, b) => b.profit - a.profit));
        setEarlyCashOuts(early);
        setSessionLabel(label);
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load results.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const earlyPlayerIds = new Set(earlyCashOuts.map((ec) => ec.playerId));

  const settlements = computeSettlements(results);

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.textMuted }}>Loading...</Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.textMuted }}>No results found. Complete cash-out first.</Text>
        <Pressable style={[styles.button, { backgroundColor: c.accent }]} onPress={() => router.back()}>
          <Text style={styles.buttonLabel}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled">
      <View style={styles.resultsBlock}>
        <Text style={[styles.sectionTitle, { color: c.text }]}>Results</Text>
        {results.map((item, index) => (
          <View
            key={item.playerId}
            style={[
              styles.resultRow,
              { backgroundColor: c.card, borderColor: c.border },
            ]}>
            <View style={styles.resultLeft}>
              <Text style={[styles.rank, { color: c.textMuted }]}>#{index + 1}</Text>
              <Text style={[styles.resultName, { color: c.text }]}>{item.playerName}</Text>
              {earlyPlayerIds.has(item.playerId) && (
                <View style={[styles.earlyBadge, { backgroundColor: c.badge.cashedOut }]}>
                  <Text style={styles.earlyBadgeText}>EARLY</Text>
                </View>
              )}
            </View>
            <View style={styles.resultRight}>
              <Text style={[styles.resultDetail, { color: c.textMuted }]}>
                In: ${item.totalBuyIn.toFixed(2)}  Out: ${item.cashOut.toFixed(2)}
              </Text>
              <Text
                style={[
                  styles.resultProfit,
                  { color: item.profit >= 0 ? c.profit : c.loss },
                ]}>
                {item.profit >= 0 ? '+' : ''}${item.profit.toFixed(2)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {settlements.length > 0 ? (
        <View style={styles.settlementBlock}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Settlement</Text>
          <View
            style={[
              styles.settlementCard,
              { backgroundColor: c.card, borderColor: c.border },
            ]}>
            {settlements.map((s, i) => (
              <View key={i} style={styles.settlementRow}>
                <Text style={{ color: c.chipValueText }}>
                  {s.from} pays {s.to}
                </Text>
                <Text style={[styles.settlementAmount, { color: c.warning }]}>
                  ${s.amount.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Pressable style={[styles.button, { backgroundColor: c.accent }]} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.buttonLabel}>Back to Home</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 12,
    gap: 10,
    paddingBottom: 32,
  },
  /** Keeps Results + rows grouped; Settlement always follows this block in document order. */
  resultsBlock: {
    gap: 10,
  },
  settlementBlock: {
    gap: 10,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15,
    marginTop: 6,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 6,
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rank: {
    fontWeight: '700',
    fontSize: 13,
    width: 24,
  },
  resultName: {
    fontWeight: '600',
  },
  earlyBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  earlyBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resultRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  resultDetail: {
    fontSize: 11,
  },
  resultProfit: {
    fontWeight: '700',
    fontSize: 15,
  },
  settlementCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settlementAmount: {
    fontWeight: '700',
  },
  button: {
    marginTop: 'auto',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
});
