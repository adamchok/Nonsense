import { appAlert } from '@/lib/app-alert';
import { buildSessionShareText } from '@/lib/session-share';
import * as Clipboard from 'expo-clipboard';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatSessionBlindsForDisplay, formatSignedCurrency } from '@/lib/currency-format';
import { formatSessionTitle } from '@/components/session/session-title';
import { radius, space } from '@/lib/spacing';
import { text } from '@/lib/ui';
import {
  deleteSession,
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
import { useNavigation } from "expo-router/react-navigation";
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
              <Text style={[text.label, styles.rankBadgeText, { color: c.textSecondary }]}>{index + 1}</Text>
            </View>
            <Text style={[text.rowTitle, styles.resultName, { color: c.text }]} numberOfLines={1}>
              {item.playerName}
            </Text>
            <View style={styles.badgesRow}>
              {isMe && (
                <View style={[styles.youBadge, { backgroundColor: c.badge.you }]}>
                  <Text style={[text.micro, styles.badgeText]}>YOU</Text>
                </View>
              )}
              {isEarly && (
                <View style={[styles.earlyBadge, { backgroundColor: c.badge.cashedOut }]}>
                  <Text style={[text.micro, styles.badgeText]}>Early</Text>
                </View>
              )}
            </View>
          </View>
          <Text
            style={[
              text.heading,
              styles.resultProfit,
              { color: item.profit >= 0 ? c.profit : c.loss },
            ]}>
            {formatSignedCurrency(shownProfit)}
          </Text>
        </View>
        <View style={styles.amountChips}>
          <View style={[styles.amountChip, { backgroundColor: c.chipMinusBg, borderColor: c.border }]}>
            <Text style={[text.micro, { color: c.textMuted }]}>In</Text>
            <Text style={[text.label, styles.amountChipValue, { color: c.text }]}>{formatCurrency(item.totalBuyIn)}</Text>
          </View>
          <Icon name="arrow-right" size={14} color={c.textHint} />
          <View style={[styles.amountChip, { backgroundColor: c.chipPlusBg, borderColor: c.border }]}>
            <Text style={[text.micro, { color: c.textMuted }]}>Out</Text>
            <Text style={[text.label, styles.amountChipValue, { color: c.text }]}>{formatCurrency(item.cashOut)}</Text>
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
  const [isCopied, setIsCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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
  const locationCell = (
    <>
      <View style={[styles.metaIconWrapSmall, { backgroundColor: c.accentBg }]}>
        <Icon name="map-marker-outline" size={16} color={c.green} />
      </View>
      <View style={styles.metaItemText}>
        <Text style={[text.label, { color: c.textMuted }]}>Location</Text>
        <Text style={[text.rowTitle, { color: c.text }]} numberOfLines={1}>
          {locationText}
        </Text>
      </View>
    </>
  );

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
  function confirmDeleteSession() {
    if (!id || !isHost) return;
    appAlert(
      'Delete this session?',
      "It's removed for every player, along with its buy-ins and results, and drops out of everyone's history, statistics and leaderboards. This cannot be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setIsDeleting(true);
                await deleteSession(id);
                invalidateSessionScanCache();
                goToHistory();
              } catch (e) {
                setIsDeleting(false);
                appAlert('Error', userMessage(e, 'Failed to delete session.'));
              }
            })();
          },
        },
      ]
    );
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

  const buildSettlementMessage = useCallback(
    (bold: boolean): string =>
      buildSessionShareText(
        {
          date: sessionDate,
          location: sessionLocation,
          hostName: sessionHostName,
          blinds: blindsShareText,
          duration: durationText,
          results,
          settlements,
        },
        { bold }
      ),
    [blindsShareText, durationText, results, sessionDate, sessionHostName, sessionLocation, settlements]
  );

  const handleShareWhatsApp = useCallback(async () => {
    const message = buildSettlementMessage(true);
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

  const handleCopyResults = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(buildSettlementMessage(false));
    } catch (e) {
      appAlert('Copy failed', userMessage(e, 'Could not copy the results.'));
      return;
    }
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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
      title: sessionDate ? formatSessionTitle(sessionDate, sessionLocation) : 'Session Summary',
      headerLeft: () => (
        <Pressable
          onPress={goToHistory}
          hitSlop={8}
          style={[styles.headerBackBtn, Platform.OS === 'web' && { marginLeft: layout.gutter - 10 }]}
          accessibilityRole="button"
          accessibilityLabel="Back to history">
          <Icon name="arrow-left" size={20} color={c.text} />
        </Pressable>
      ),
      headerRight: () => (
        <View style={[styles.headerActions, Platform.OS === 'web' && { marginRight: layout.gutter }]}>
          <Pressable
            onPress={() => void handleCopyResults()}
            hitSlop={8}
            style={[styles.headerCopyBtn, { backgroundColor: c.card, borderColor: c.inputBorder }]}
            accessibilityRole="button"
            accessibilityLabel={isCopied ? 'Results copied' : 'Copy results'}>
            <Icon name={isCopied ? 'check' : 'content-copy'} size={16} color={isCopied ? c.profit : c.text} />
          </Pressable>
          <Pressable
            onPress={handleShareWhatsApp}
            hitSlop={8}
            style={styles.headerShareBtn}
            accessibilityRole="button"
            accessibilityLabel="Share on WhatsApp">
            <Icon name="whatsapp" size={16} color="#000" />
          </Pressable>
        </View>
      ),
    });
  }, [
    navigation,
    sessionDate,
    sessionLocation,
    handleShareWhatsApp,
    handleCopyResults,
    isCopied,
    goToHistory,
    c.text,
    c.card,
    c.inputBorder,
    c.profit,
    layout.gutter,
  ]);

  if (loading) {
    return <SessionSummarySkeleton contentStyle={layout.content} />;
  }

  if (results.length === 0) {
    return (
      <View style={[styles.screen, styles.emptyScreen, { backgroundColor: c.bg }]}>
        <View style={[styles.emptyIconWrap, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
          <Icon name="clipboard-text-outline" size={40} color={c.accentText} />
        </View>
        <Text style={[text.title, styles.centered, { color: c.text }]}>
          {loadError ? "Couldn't load summary" : 'No results yet'}
        </Text>
        <Text style={[text.body, styles.emptySubtitle, { color: c.textMuted }]}>
          {loadError ?? 'Finish cash-out for this session to see standings and settlement here.'}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: c.accent, opacity: pressed ? 0.9 : 1 },
          ]}
          accessibilityRole="button"
          onPress={() => router.back()}>
          <Text style={[text.button, { color: c.onAccent }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const rankBarColor = (rank: number) => {
    if (rank === 0) return c.accent;
    if (rank === 1) return c.textHint;
    if (rank === 2) return c.accentBorder;
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
              {isHost ? (
                <PressableScale
                  pressedScale={0.98}
                  onPress={() => setIsEditingLocation(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Location, ${locationText}. Edit location`}
                  style={styles.metaGridCell}>
                  {locationCell}
                  <Icon name="edit" size={14} color={c.textMuted} />
                </PressableScale>
              ) : (
                <View style={styles.metaGridCell}>{locationCell}</View>
              )}
              <View style={styles.metaGridCell}>
                <View style={[styles.metaIconWrapSmall, { backgroundColor: c.yellowBg }]}>
                  <Icon name="crown-outline" size={16} color={c.yellow} />
                </View>
                <View style={styles.metaItemText}>
                  <Text style={[text.label, { color: c.textMuted }]}>Host</Text>
                  <Text style={[text.rowTitle, { color: c.text }]} numberOfLines={1}>
                    {sessionHostName?.trim() ? sessionHostName.trim() : '—'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.metaGridRow}>
              <View style={styles.metaGridCell}>
                <View style={[styles.metaIconWrapSmall, { backgroundColor: c.cardAlt }]}>
                  <Icon name="clock-outline" size={16} color={c.textSecondary} />
                </View>
                <View style={styles.metaItemText}>
                  <Text style={[text.label, { color: c.textMuted }]}>Duration</Text>
                  <Text style={[text.rowTitle, { color: c.text }]} numberOfLines={1}>
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
                  <Text style={[text.label, { color: c.textMuted }]}>Blinds</Text>
                  <Text style={[text.rowTitle, { color: c.text }]} numberOfLines={1}>
                    {blindsShareText ?? '—'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        <View style={styles.resultsBlock}>
          <View style={styles.sectionHeader}>
            <Icon name="trophy-outline" size={20} color={c.accentText} />
            <Text style={[text.heading, { color: c.text }]}>Standings</Text>
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
            <Text style={[text.heading, { color: c.text }]}>Settlement</Text>
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
                      <Text style={[text.rowTitle, { color: c.text }]} numberOfLines={1}>
                        {s.from}
                      </Text>
                      <View style={styles.settlementFlow}>
                        <Icon name="arrow-right-bold" size={14} color={c.textMuted} />
                        <Text style={[text.label, styles.settlementTo, { color: c.textSecondary }]} numberOfLines={1}>
                          {s.to}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.settlementAmountPill, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
                      <Text style={[text.amount, { color: c.accentText }]}>{formatCurrency(s.amount)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.settlementEmpty, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
              <Icon name="check-circle-outline" size={28} color={c.accentText} />
              <Text style={[text.heading, { color: c.text }]}>All square</Text>
              <Text style={[text.caption, styles.centered, { color: c.textMuted }]}>
                No transfers needed — chip counts already match.
              </Text>
            </View>
          )}
        </Animated.View>

        {isHost ? (
          <PressableScale
            onPress={confirmDeleteSession}
            disabled={isDeleting}
            style={(state) => [
              styles.deleteBtn,
              { borderColor: c.border },
              (state as { hovered?: boolean }).hovered || state.pressed ? { backgroundColor: c.cardAlt } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Delete session"
            accessibilityHint="Removes this session for every player"
            accessibilityState={{ disabled: isDeleting, busy: isDeleting }}>
            {isDeleting ? (
              <ActivityIndicator size="small" color={c.lossLight} />
            ) : (
              <Icon name="delete-outline" size={18} color={c.lossLight} importantForAccessibility="no" />
            )}
            <Text style={[text.button, { color: c.lossLight }]}>Delete session</Text>
          </PressableScale>
        ) : null}
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
  emptySubtitle: {
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
    alignItems: 'center',
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
    fontVariant: ['tabular-nums'],
  },
  resultName: {
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
  earlyBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resultProfit: {
    fontWeight: '700',
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
  amountChipValue: {
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
  settlementFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settlementTo: {
    flex: 1,
  },
  settlementAmountPill: {
    borderRadius: 9,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  settlementEmpty: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  badgeText: {
    // Badge fills stay dark in both themes, so the label stays white.
    color: '#fff',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  centered: {
    textAlign: 'center',
  },
  deleteBtn: {
    marginTop: space.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerCopyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerShareBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    // Offsets the larger target so the arrow stays where the 32px button drew it.
    marginLeft: -6,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
