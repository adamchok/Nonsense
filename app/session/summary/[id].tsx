import { appAlert } from '@/lib/app-alert';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatSessionBlindsForDisplay, formatSignedCurrency } from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import {
  getEarlyCashOuts,
  getPlayerProfile,
  getResults,
  getSessionMeta,
  invalidateSessionScanCache,
  updateSessionLocation,
} from '@/lib/firestore';
import { computeSettlements } from '@/lib/settlement';
import type { AppColors } from '@/lib/app-theme';
import type { EarlyCashOut, SessionAmountUnit, SessionResult } from '@/types';
import { Icon } from '@/components/icon';
import { LocationEditorModal } from '@/components/session/location-editor-modal';
import { SessionSummarySkeleton } from '@/components/session/session-skeletons';
import { ConfettiBurst, ScaleFadeIn } from '@/components/celebration';
import { Animated, PressableScale, fadeIn, listItemEntering, useCountUp } from '@/components/motion';
import { FadeIn, FadeInDown, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { userMessage } from '@/lib/user-message';

const WINNER_DELAY_MS = 120;
const STANDINGS_START_MS = 380;
const STANDINGS_STEP_MS = 70;
const COUNT_UP_MS = 700;

function celebrationRowDelay(index: number): number {
  return index === 0 ? WINNER_DELAY_MS : STANDINGS_START_MS + (index - 1) * STANDINGS_STEP_MS;
}

type ResultRowProps = {
  item: SessionResult;
  index: number;
  isMe: boolean;
  isEarly: boolean;
  barColor: string;
  celebrate: boolean;
  c: AppColors;
};

function ResultRow({ item, index, isMe, isEarly, barColor, celebrate, c }: ResultRowProps) {
  const reduceMotion = useReducedMotion();
  const delay = celebrationRowDelay(index);
  const [counting, setCounting] = useState(!celebrate || reduceMotion);
  useEffect(() => {
    if (counting) return;
    const t = setTimeout(() => setCounting(true), delay);
    return () => clearTimeout(t);
  }, [counting, delay]);
  const shownProfit = useCountUp(counting ? item.profit : 0, COUNT_UP_MS);

  const row = (
    <View
      accessible
      accessibilityLabel={[
        `Rank ${index + 1}`,
        item.playerName,
        isMe ? 'you' : null,
        isEarly ? 'cashed out early' : null,
        `${item.profit >= 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(item.profit))}`,
        `in ${formatCurrency(item.totalBuyIn)}`,
        `out ${formatCurrency(item.cashOut)}`,
      ]
        .filter(Boolean)
        .join(', ')}
      style={[
        styles.resultRow,
        { backgroundColor: c.card, borderColor: c.border },
        index === 0 && { borderColor: c.accentBorder },
      ]}>
      {barColor !== 'transparent' ? (
        <View style={[styles.rankBar, { backgroundColor: barColor }]} />
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
              {isEarly && (
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
            {formatSignedCurrency(shownProfit)}
          </Text>
        </View>
        <View style={styles.amountChips}>
          <View style={[styles.amountChip, { backgroundColor: c.chipMinusBg, borderColor: c.border }]}>
            <Text style={[styles.amountChipLabel, { color: c.textMuted }]}>In</Text>
            <Text style={[styles.amountChipValue, { color: c.text }]}>{formatCurrency(item.totalBuyIn)}</Text>
          </View>
          <Icon name="arrow-right" size={14} color={c.textHint} />
          <View style={[styles.amountChip, { backgroundColor: c.chipPlusBg, borderColor: c.border }]}>
            <Text style={[styles.amountChipLabel, { color: c.textMuted }]}>Out</Text>
            <Text style={[styles.amountChipValue, { color: c.text }]}>{formatCurrency(item.cashOut)}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  if (celebrate && index === 0) {
    return <ScaleFadeIn delay={delay}>{row}</ScaleFadeIn>;
  }
  const entering = celebrate
    ? FadeInDown.duration(260).delay(delay).reduceMotion(ReduceMotion.System)
    : listItemEntering(index);
  return <Animated.View entering={entering}>{row}</Animated.View>;
}

export default function SessionSummaryScreen() {
  const { id, settled } = useLocalSearchParams<{ id: string; settled?: string }>();
  const [celebrate] = useState(settled === '1');
  const navigation = useNavigation();
  const c = useAppColors();
  const layout = usePageLayout(40);
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
  const [sessionHostId, setSessionHostId] = useState<string | undefined>();
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const goToHistory = useCallback(() => {
    router.replace('/(tabs)/history');
  }, []);

  useEffect(() => {
    if (settled === '1') router.setParams({ settled: undefined });
  }, [settled]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [data, early, meta] = await Promise.all([
          getResults(id),
          getEarlyCashOuts(id),
          getSessionMeta(id),
        ]);
        if (cancelled) return;
        if (!meta) {
          setLoadError('Session not found. It may have been deleted.');
          appAlert('Session not found', 'This session no longer exists.');
          return;
        }
        setLoadError(null);
        setResults(data.sort((a, b) => b.profit - a.profit));
        setEarlyCashOuts(early);
        setSessionDate(meta.date);
        setSessionFinishedAt(meta.finishedAt);
        setSessionLocation(meta.location);
        setSessionSmallBlind(meta.smallBlind);
        setSessionBigBlind(meta.bigBlind);
        setSessionAmountUnit(meta.amountUnit);
        setSessionDollarsPerChip(meta.dollarsPerChip);
        setSessionHostId(meta.hostId);
        if (meta.hostId) {
          let hostName = data.find((r) => r.playerId === meta.hostId)?.playerName;
          if (!hostName) {
            const prof = await getPlayerProfile(meta.hostId);
            hostName = prof?.name;
          }
          if (!cancelled) setSessionHostName(hostName);
        } else {
          setSessionHostName(undefined);
        }
      } catch (e) {
        if (cancelled) return;
        setLoadError(userMessage(e, 'Failed to load results.'));
        appAlert('Error', userMessage(e, 'Failed to load results.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const earlyPlayerIds = useMemo(
    () => new Set(earlyCashOuts.map((ec) => ec.playerId)),
    [earlyCashOuts]
  );

  const settlements = useMemo(() => computeSettlements(results), [results]);
  const isHost = Boolean(user && sessionHostId && user.uid === sessionHostId);
  const locationText = sessionLocation?.trim() ? sessionLocation.trim() : '—';

  async function saveLocation(next: string) {
    if (!id) return;
    try {
      await updateSessionLocation(id, next);
      setSessionLocation(next.trim() || undefined);
      invalidateSessionScanCache();
      setIsEditingLocation(false);
    } catch (e) {
      appAlert('Could not save location', userMessage(e, 'Please try again.'));
    }
  }
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
      if (Platform.OS === 'web') {
        await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
        return;
      }
      const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
      await Share.share({ message });
    } catch (e) {
      appAlert('Share failed', userMessage(e, 'Could not open share options.'));
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
          hitSlop={8}
          style={styles.headerBackBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to history">
          <Icon name="arrow-left" size={20} color={c.text} />
        </Pressable>
      ),
      headerRight: () => (
        <Pressable
          onPress={handleShareWhatsApp}
          hitSlop={8}
          style={[styles.headerShareBtn, Platform.OS === 'web' && { marginRight: layout.gutter }]}
          accessibilityRole="button"
          accessibilityLabel="Share on WhatsApp">
          <Icon name="whatsapp" size={16} color="#000" />
        </Pressable>
      ),
    });
  }, [navigation, sessionDate, handleShareWhatsApp, goToHistory, c.text, layout.gutter]);

  if (loading) {
    return <SessionSummarySkeleton contentStyle={layout.content} />;
  }

  if (results.length === 0) {
    return (
      <View style={[styles.screen, styles.emptyScreen, { backgroundColor: c.bg }]}>
        <View style={[styles.emptyIconWrap, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
          <Icon name="clipboard-text-outline" size={40} color={c.accentText} />
        </View>
        <Text style={[styles.emptyTitle, { color: c.text }]}>
          {loadError ? "Couldn't load summary" : 'No results yet'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: c.textMuted }]}>
          {loadError ?? 'Finish cash-out for this session to see standings and settlement here.'}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: c.accent, opacity: pressed ? 0.9 : 1 },
          ]}
          accessibilityRole="button"
          onPress={() => router.back()}>
          <Text style={[styles.buttonLabel, { color: c.onAccent }]}>Go back</Text>
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

  const settlementEntering = celebrate
    ? FadeIn.duration(260)
        .delay(celebrationRowDelay(results.length))
        .reduceMotion(ReduceMotion.System)
    : fadeIn;

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[layout.content, styles.scrollContent]}
        keyboardShouldPersistTaps="handled">
        <Animated.View entering={fadeIn} style={[styles.metaCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.metaGrid}>
            <View style={styles.metaGridRow}>
              <PressableScale
                pressedScale={0.98}
                disabled={!isHost}
                onPress={() => setIsEditingLocation(true)}
                accessibilityRole={isHost ? 'button' : undefined}
                accessibilityLabel={isHost ? `Location, ${locationText}. Edit location` : undefined}
                style={styles.metaGridCell}>
                <View style={[styles.metaIconWrapSmall, { backgroundColor: c.accentBg }]}>
                  <Icon name="map-marker-outline" size={16} color={c.green} />
                </View>
                <View style={styles.metaItemText}>
                  <Text style={[styles.metaLabel, { color: c.textMuted }]}>Location</Text>
                  <Text style={[styles.metaValue, styles.metaGridValue, { color: c.text }]} numberOfLines={1}>
                    {locationText}
                  </Text>
                </View>
                {isHost ? <Icon name="edit" size={14} color={c.textMuted} /> : null}
              </PressableScale>
              <View style={styles.metaGridCell}>
                <View style={[styles.metaIconWrapSmall, { backgroundColor: c.yellowBg }]}>
                  <Icon name="crown-outline" size={16} color={c.yellow} />
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
                  <Icon name="clock-outline" size={16} color={c.blue} />
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
                  <Icon name="cash-multiple" size={16} color={c.chipText} />
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
        </Animated.View>

        <View style={styles.resultsBlock}>
          <View style={styles.sectionHeader}>
            <Icon name="trophy-outline" size={20} color={c.warning} />
            <Text style={[styles.sectionTitle, { color: c.text }]}>Standings</Text>
          </View>
          {results.map((item, index) => (
            <ResultRow
              key={item.playerId}
              item={item}
              index={index}
              isMe={Boolean(user?.uid && item.playerId === user.uid)}
              isEarly={earlyPlayerIds.has(item.playerId)}
              barColor={rankBarColor(index)}
              celebrate={celebrate}
              c={c}
            />
          ))}
        </View>

        <Animated.View entering={settlementEntering} style={styles.settlementBlock}>
          <View style={styles.sectionHeader}>
            <Icon name="bank-transfer" size={26} color={c.green} />
            <Text style={[styles.sectionTitle, { color: c.text }]}>Settlement</Text>
          </View>
          {settlements.length > 0 ? (
            <View style={[styles.settlementCard, { backgroundColor: c.card, borderColor: c.border }]}>
              {settlements.map((s, i) => (
                <View key={i}>
                  {i > 0 ? <View style={[styles.settlementDivider, { backgroundColor: c.border }]} /> : null}
                  <View
                    style={styles.settlementRow}
                    accessible
                    accessibilityLabel={`${s.from} pays ${s.to} ${formatCurrency(s.amount)}`}>
                    <View style={styles.settlementNames}>
                      <Text style={[styles.settlementFrom, { color: c.text }]} numberOfLines={1}>
                        {s.from}
                      </Text>
                      <View style={styles.settlementFlow}>
                        <Icon name="arrow-right-bold" size={14} color={c.textMuted} />
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
              <Icon name="check-circle-outline" size={28} color={c.accentText} />
              <Text style={[styles.settlementEmptyTitle, { color: c.text }]}>All square</Text>
              <Text style={[styles.settlementEmptySub, { color: c.textMuted }]}>
                No transfers needed — chip counts already match.
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
      {celebrate ? <ConfettiBurst colors={[c.accent, c.green, c.yellow]} /> : null}
      {isEditingLocation ? (
        <LocationEditorModal
          visible
          initialLocation={sessionLocation ?? ''}
          onClose={() => setIsEditingLocation(false)}
          onSubmit={saveLocation}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
  },
  metaCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
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
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaItemText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.66,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  metaGridValue: {
    fontSize: 14,
  },
  resultsBlock: {
    gap: 8,
  },
  settlementBlock: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontWeight: '600',
    fontSize: 17,
    lineHeight: 22,
  },
  resultRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rankBar: {
    width: 4,
  },
  rankBarPlaceholder: {
    width: 4,
  },
  resultBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    minWidth: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rankBadgeText: {
    fontWeight: '700',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  resultName: {
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  youBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  youBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  earlyBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  earlyBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  resultProfit: {
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
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
    borderRadius: 8,
    borderWidth: 1,
  },
  amountChipLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.66,
  },
  amountChipValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  settlementCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  settlementDivider: {
    height: 1,
  },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 12,
  },
  settlementNames: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  settlementFrom: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  settlementFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settlementTo: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  settlementAmountPill: {
    borderRadius: 9,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  settlementAmount: {
    fontWeight: '600',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
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
    fontWeight: '600',
  },
  settlementEmptySub: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  headerShareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
});
