import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatSessionBlindsForDisplay, formatSignedCurrency } from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { getEarlyCashOuts, getPlayerProfile, getResults, getSessionMeta } from '@/lib/firestore';
import { computeSettlements } from '@/lib/settlement';
import type { EarlyCashOut, SessionAmountUnit, SessionResult } from '@/types';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function SessionSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const c = useAppColors();
  const { user } = useAuth();
  const [results, setResults] = useState<SessionResult[]>([]);
  const [earlyCashOuts, setEarlyCashOuts] = useState<EarlyCashOut[]>([]);
  const [sessionDate, setSessionDate] = useState<Date | undefined>();
  const [sessionFinishedAt, setSessionFinishedAt] = useState<Date | undefined>();
  const [sessionLocation, setSessionLocation] = useState<string | undefined>();
  const [sessionSmallBlind, setSessionSmallBlind] = useState<number | undefined>();
  const [sessionBigBlind, setSessionBigBlind] = useState<number | undefined>();
  const [sessionAmountUnit, setSessionAmountUnit] = useState<SessionAmountUnit>('cash');
  const [sessionDollarsPerChip, setSessionDollarsPerChip] = useState<number | undefined>();
  const [sessionHostName, setSessionHostName] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const goToHistory = useCallback(() => {
    router.replace('/(tabs)/history');
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [data, early, meta] = await Promise.all([
          getResults(id),
          getEarlyCashOuts(id),
          getSessionMeta(id),
        ]);
        setResults(data.sort((a, b) => b.profit - a.profit));
        setEarlyCashOuts(early);
        setSessionDate(meta.date);
        setSessionFinishedAt(meta.finishedAt);
        setSessionLocation(meta.location);
        setSessionSmallBlind(meta.smallBlind);
        setSessionBigBlind(meta.bigBlind);
        setSessionAmountUnit(meta.amountUnit);
        setSessionDollarsPerChip(meta.dollarsPerChip);
        if (meta.hostId) {
          let hostName = data.find((r) => r.playerId === meta.hostId)?.playerName;
          if (!hostName) {
            const prof = await getPlayerProfile(meta.hostId);
            hostName = prof?.name;
          }
          setSessionHostName(hostName);
        } else {
          setSessionHostName(undefined);
        }
      } catch (e) {
        appAlert('Error', e instanceof Error ? e.message : 'Failed to load results.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const earlyPlayerIds = new Set(earlyCashOuts.map((ec) => ec.playerId));

  const settlements = computeSettlements(results);
  const durationMs =
    sessionDate && sessionFinishedAt
      ? Math.max(0, sessionFinishedAt.getTime() - sessionDate.getTime())
      : 0;
  const durationText = (() => {
    if (!durationMs) return 'N/A';
    const totalMinutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  })();

  const blindsShareText = formatSessionBlindsForDisplay(
    sessionSmallBlind,
    sessionBigBlind,
    sessionAmountUnit,
    sessionDollarsPerChip
  );

  const buildSettlementMessage = useCallback((): string => {
    const title = sessionDate
      ? `Nonsense - ${formatDateTimeDMY(sessionDate)}`
      : 'Nonsense Session Summary';
    const lines: string[] = [title];
    lines.push(`Location: ${sessionLocation?.trim() ? sessionLocation.trim() : 'N/A'}`);
    lines.push(`Host: ${sessionHostName?.trim() ? sessionHostName.trim() : 'N/A'}`);
    lines.push(`Blinds: ${blindsShareText ?? 'N/A'}`);
    lines.push(`Duration: ${durationText}`);
    lines.push('', 'Results:');

    for (const item of results) {
      lines.push(
        `- ${item.playerName}: In ${formatCurrency(item.totalBuyIn)}, Out ${formatCurrency(item.cashOut)}, P/L ${formatSignedCurrency(item.profit)}`
      );
    }

    if (settlements.length > 0) {
      lines.push('', 'Settlement:');
      for (const s of settlements) {
        lines.push(`- ${s.from} pays ${s.to} ${formatCurrency(s.amount)}`);
      }
    } else {
      lines.push('', 'Settlement: No payments needed.');
    }

    lines.push('', 'Generated by Nonsense');
    return lines.join('\n');
  }, [blindsShareText, durationText, results, sessionDate, sessionHostName, sessionLocation, settlements]);

  const handleShareWhatsApp = useCallback(async () => {
    const message = buildSettlementMessage();
    try {
      const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
      await Share.share({ message });
    } catch (e) {
      appAlert('Share failed', e instanceof Error ? e.message : 'Could not open share options.');
    }
  }, [buildSettlementMessage]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goToHistory();
        return true;
      });
      return () => sub.remove();
    }, [goToHistory])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: sessionDate ? formatDateTimeDMY(sessionDate) : 'Session Summary',
      headerLeft: () => (
        <Pressable
          onPress={goToHistory}
          style={styles.headerBackBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to history">
          <MaterialCommunityIcons name="arrow-left" size={20} color={c.text} />
        </Pressable>
      ),
      headerRight: () => (
        <Pressable
          onPress={handleShareWhatsApp}
          style={styles.headerShareBtn}
          accessibilityRole="button"
          accessibilityLabel="Share on WhatsApp">
          <MaterialCommunityIcons name="whatsapp" size={16} color="#fff" />
        </Pressable>
      ),
    });
  }, [navigation, sessionDate, handleShareWhatsApp, goToHistory, c.text]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={[styles.loadingText, { color: c.textMuted }]}>Loading summary…</Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={[styles.screen, styles.emptyScreen, { backgroundColor: c.bg }]}>
        <View style={[styles.emptyIconWrap, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={40} color={c.accent} />
        </View>
        <Text style={[styles.emptyTitle, { color: c.text }]}>No results yet</Text>
        <Text style={[styles.emptySubtitle, { color: c.textMuted }]}>
          Finish cash-out for this session to see standings and settlement here.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: c.accent, opacity: pressed ? 0.9 : 1 },
          ]}
          onPress={() => router.back()}>
          <Text style={styles.buttonLabel}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const rankBarColor = (rank: number) => {
    if (rank === 0) return c.accent;
    if (rank === 1) return c.blue;
    if (rank === 2) return c.warning;
    return 'transparent';
  };

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={[styles.metaCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.metaGrid}>
          <View style={styles.metaGridRow}>
            <View style={styles.metaGridCell}>
              <View style={[styles.metaIconWrapSmall, { backgroundColor: c.accentBg }]}>
                <MaterialCommunityIcons name="map-marker-outline" size={16} color={c.green} />
              </View>
              <View style={styles.metaItemText}>
                <Text style={[styles.metaLabel, { color: c.textMuted }]}>Location</Text>
                <Text style={[styles.metaValue, styles.metaGridValue, { color: c.text }]} numberOfLines={1}>
                  {sessionLocation?.trim() ? sessionLocation.trim() : '—'}
                </Text>
              </View>
            </View>
            <View style={styles.metaGridCell}>
              <View style={[styles.metaIconWrapSmall, { backgroundColor: c.yellowBg }]}>
                <MaterialCommunityIcons name="crown-outline" size={16} color={c.yellow} />
              </View>
              <View style={styles.metaItemText}>
                <Text style={[styles.metaLabel, { color: c.textMuted }]}>Host</Text>
                <Text style={[styles.metaValue, styles.metaGridValue, { color: c.text }]} numberOfLines={1}>
                  {sessionHostName?.trim() ? sessionHostName.trim() : '—'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.metaGridRow}>
            <View style={styles.metaGridCell}>
              <View style={[styles.metaIconWrapSmall, { backgroundColor: c.blueBg }]}>
                <MaterialCommunityIcons name="clock-outline" size={16} color={c.blue} />
              </View>
              <View style={styles.metaItemText}>
                <Text style={[styles.metaLabel, { color: c.textMuted }]}>Duration</Text>
                <Text style={[styles.metaValue, styles.metaGridValue, { color: c.text }]} numberOfLines={1}>
                  {durationText}
                </Text>
              </View>
            </View>
            <View style={styles.metaGridCell}>
              <View
                style={[
                  styles.metaIconWrapSmall,
                  { backgroundColor: c.chipBg, borderColor: c.chipBorder, borderWidth: 1 },
                ]}>
                <MaterialCommunityIcons name="cash-multiple" size={16} color={c.chipText} />
              </View>
              <View style={styles.metaItemText}>
                <Text style={[styles.metaLabel, { color: c.textMuted }]}>Blinds</Text>
                <Text style={[styles.metaValue, styles.metaGridValue, { color: c.text }]} numberOfLines={1}>
                  {blindsShareText ?? '—'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.resultsBlock}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="trophy-outline" size={20} color={c.warning} />
          <Text style={[styles.sectionTitle, { color: c.text }]}>Standings</Text>
        </View>
        {results.map((item, index) => {
          const bar = rankBarColor(index);
          const isMe = Boolean(user?.uid && item.playerId === user.uid);
          return (
            <View
              key={item.playerId}
              style={[
                styles.resultRow,
                { backgroundColor: c.card, borderColor: c.border },
                index === 0 && { borderColor: c.accentBorder },
              ]}>
              {bar !== 'transparent' ? (
                <View style={[styles.rankBar, { backgroundColor: bar }]} />
              ) : (
                <View style={styles.rankBarPlaceholder} />
              )}
              <View style={styles.resultBody}>
                <View style={styles.resultTop}>
                  <View style={styles.resultLeft}>
                    <View style={[styles.rankBadge, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
                      <Text style={[styles.rankBadgeText, { color: c.textSecondary }]}>{index + 1}</Text>
                    </View>
                    <Text style={[styles.resultName, { color: c.text }]} numberOfLines={1}>
                      {item.playerName}
                    </Text>
                    <View style={styles.badgesRow}>
                      {isMe && (
                        <View style={[styles.youBadge, { backgroundColor: c.badge.you }]}>
                          <Text style={styles.youBadgeText}>YOU</Text>
                        </View>
                      )}
                      {earlyPlayerIds.has(item.playerId) && (
                        <View style={[styles.earlyBadge, { backgroundColor: c.badge.cashedOut }]}>
                          <Text style={styles.earlyBadgeText}>Early</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.resultProfit,
                      { color: item.profit >= 0 ? c.profit : c.loss },
                    ]}>
                    {formatSignedCurrency(item.profit)}
                  </Text>
                </View>
                <View style={styles.amountChips}>
                  <View style={[styles.amountChip, { backgroundColor: c.chipMinusBg, borderColor: c.border }]}>
                    <Text style={[styles.amountChipLabel, { color: c.textMuted }]}>In</Text>
                    <Text style={[styles.amountChipValue, { color: c.text }]}>{formatCurrency(item.totalBuyIn)}</Text>
                  </View>
                  <MaterialCommunityIcons name="arrow-right" size={14} color={c.textHint} />
                  <View style={[styles.amountChip, { backgroundColor: c.chipPlusBg, borderColor: c.border }]}>
                    <Text style={[styles.amountChipLabel, { color: c.textMuted }]}>Out</Text>
                    <Text style={[styles.amountChipValue, { color: c.text }]}>{formatCurrency(item.cashOut)}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.settlementBlock}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="bank-transfer" size={26} color={c.green} />
          <Text style={[styles.sectionTitle, { color: c.text }]}>Settlement</Text>
        </View>
        {settlements.length > 0 ? (
          <View style={[styles.settlementCard, { backgroundColor: c.card, borderColor: c.border }]}>
            {settlements.map((s, i) => (
              <View key={i}>
                {i > 0 ? <View style={[styles.settlementDivider, { backgroundColor: c.border }]} /> : null}
                <View style={styles.settlementRow}>
                  <View style={styles.settlementNames}>
                    <Text style={[styles.settlementFrom, { color: c.text }]} numberOfLines={1}>
                      {s.from}
                    </Text>
                    <View style={styles.settlementFlow}>
                      <MaterialCommunityIcons name="arrow-right-bold" size={14} color={c.textMuted} />
                      <Text style={[styles.settlementTo, { color: c.textSecondary }]} numberOfLines={1}>
                        {s.to}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.settlementAmountPill, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
                    <Text style={[styles.settlementAmount, { color: c.warning }]}>{formatCurrency(s.amount)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.settlementEmpty, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
            <MaterialCommunityIcons name="check-circle-outline" size={28} color={c.accent} />
            <Text style={[styles.settlementEmptyTitle, { color: c.text }]}>All square</Text>
            <Text style={[styles.settlementEmptySub, { color: c.textMuted }]}>
              No transfers needed — chip counts already match.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 15,
  },
  emptyScreen: {
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 8,
    gap: 16,
    paddingBottom: 40,
  },
  metaCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 0,
  },
  metaGrid: {
    gap: 12,
  },
  metaGridRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  metaGridCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  metaIconWrapSmall: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaItemText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  metaGridValue: {
    fontSize: 14,
  },
  resultsBlock: {
    gap: 12,
  },
  settlementBlock: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: -0.2,
  },
  resultRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },
  rankBar: {
    width: 4,
  },
  rankBarPlaceholder: {
    width: 4,
  },
  resultBody: {
    flex: 1,
    padding: 14,
    gap: 10,
    minWidth: 0,
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  rankBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rankBadgeText: {
    fontWeight: '800',
    fontSize: 13,
  },
  resultName: {
    fontWeight: '600',
    fontSize: 16,
    flexShrink: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  youBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  youBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  earlyBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  earlyBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  resultProfit: {
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: -0.2,
  },
  amountChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  amountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  amountChipLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  amountChipValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  settlementCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  settlementDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  settlementNames: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  settlementFrom: {
    fontSize: 15,
    fontWeight: '700',
  },
  settlementFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settlementTo: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  settlementAmountPill: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  settlementAmount: {
    fontWeight: '800',
    fontSize: 16,
  },
  settlementEmpty: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  settlementEmptyTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  settlementEmptySub: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  headerShareBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
