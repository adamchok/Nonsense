import { appAlert } from '@/lib/app-alert';
import { medalColor } from '@/lib/medal-colors';
import { useResolvedColorScheme } from '@/lib/theme-context';
import { getAvatarEmoji } from '@/lib/avatar';
import { PlayerAvatar } from '@/components/player-avatar';
import { buildSessionShareText } from '@/lib/session-share';
import * as Clipboard from 'expo-clipboard';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatSessionBlindsForDisplay, formatSignedCurrency } from '@/lib/currency-format';
import { formatSessionDay, formatSessionTime, formatSessionTitle } from '@/components/session/session-title';
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
  fetchFriendsList,
} from '@/lib/firestore';
import { computeSettlements } from '@/lib/settlement';
import type { AppColors } from '@/lib/app-theme';
import type { EarlyCashOut, SessionAmountUnit, SessionResult } from '@/types';
import { Icon } from '@/components/icon';
import { PlayerActionMenu, type MenuAnchor } from '@/components/session/player-action-menu';
import { ShareCard } from '@/components/session/share-card';
import { isShareCancel, shareViewAsImage } from '@/lib/share-image';
import { LocationEditorModal } from '@/components/session/location-editor-modal';
import { SessionSummarySkeleton } from '@/components/session/session-skeletons';
import { ConfettiBurst, ScaleFadeIn } from '@/components/celebration';
import { Animated, PressableScale, fadeIn, listItemEntering, useCountUp } from '@/components/motion';
import { FadeIn, FadeInDown, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { useNavigation } from 'expo-router/react-navigation';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
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

/** "nonsense-2026-10-02-the-garage.png": sorts by date and says which game it was. */
function shareImageName(date?: Date, location?: string): string {
  if (!date) return 'nonsense-results.png';
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const place = (location ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `nonsense-${day}${place ? `-${place}` : ''}.png`;
}

type ResultRowProps = {
  item: SessionResult;
  index: number;
  isMe: boolean;
  isEarly: boolean;
  avatar: string;
  medal: string | null;
  barColor: string;
  celebrate: boolean;
  c: AppColors;
};

function ResultRow({ item, index, isMe, isEarly, avatar, medal, barColor, celebrate, c }: ResultRowProps) {
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
            {/* Only the winner gets a badge: a gold medal with a crown. Everyone else starts with their avatar. */}
            {index === 0 && medal ? (
              <View style={[styles.medal, { backgroundColor: `${medal}26`, borderColor: medal }]}>
                <Icon name="crown-outline" size={16} color={medal} weight="fill" />
              </View>
            ) : null}
            <PlayerAvatar value={avatar} size={32} />
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
          <Text style={[text.heading, styles.resultProfit, { color: item.profit >= 0 ? c.profit : c.loss }]}>
            {formatSignedCurrency(shownProfit)}
          </Text>
        </View>
        <View style={styles.amountChips}>
          <View style={[styles.amountChip, { backgroundColor: c.chipMinusBg, borderColor: c.border }]}>
            <Icon name="money-in" size={12} color={c.textMuted} />
            <Text style={[text.micro, { color: c.textMuted }]}>In</Text>
            <Text style={[text.label, styles.amountChipValue, { color: c.text }]}>
              {formatCurrency(item.totalBuyIn)}
            </Text>
          </View>
          <Icon name="arrow-right" size={14} color={c.textHint} />
          <View style={[styles.amountChip, { backgroundColor: c.chipPlusBg, borderColor: c.border }]}>
            <Icon name="money-out" size={12} color={c.textMuted} />
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
  const { isMd } = useBreakpoint();
  // Desktop has room for a bigger section title; phones keep the compact heading.
  const sectionTitleStyle = isMd ? text.title : text.heading;
  const sectionIconSize = isMd ? 24 : 20;
  const { user, playerProfile } = useAuth();
  // Above the early returns: hook order must not change between loading and loaded renders.
  const isDark = useResolvedColorScheme() === 'dark';
  const [friendAvatarMap, setFriendAvatarMap] = useState<ReadonlyMap<string, string | undefined>>(new Map());
  useEffect(() => {
    if (!playerProfile) return;
    let cancelled = false;
    fetchFriendsList(playerProfile.id)
      .then((friends) => {
        if (!cancelled) setFriendAvatarMap(new Map(friends.map((f) => [f.playerId, f.avatarEmoji])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playerProfile]);
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
        const [data, early, meta] = await Promise.all([getResults(id), getEarlyCashOuts(id), getSessionMeta(id)]);
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

  const earlyPlayerIds = useMemo(() => new Set(earlyCashOuts.map((ec) => ec.playerId)), [earlyCashOuts]);

  const settlements = useMemo(() => computeSettlements(results), [results]);
  const shareCardRef = useRef<View>(null);
  const shareButtonRef = useRef<View>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareAnchor, setShareAnchor] = useState<MenuAnchor | null>(null);
  const isHost = Boolean(user && sessionHostId && user.uid === sessionHostId);
  const locationText = sessionLocation?.trim() ? sessionLocation.trim() : '—';
  const locationCell = (
    <>
      <View style={[styles.metaIconWrapSmall, { backgroundColor: c.accentBg }]}>
        <Icon name="map-marker-outline" size={16} color={c.green} />
      </View>
      <View style={styles.metaItemText}>
        <Text style={[text.label, { color: c.textMuted }]}>Location</Text>
        <View style={styles.locationValueRow}>
          <Text style={[text.rowTitle, styles.locationValue, { color: c.text }]} numberOfLines={1}>
            {locationText}
          </Text>
          {/* Only the pencil is the button, right beside the value it edits (not the whole tile). */}
          {isHost ? (
            <PressableScale
              pressedScale={0.9}
              onPress={() => setIsEditingLocation(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Edit location, currently ${locationText}`}
              style={styles.locationEditBtn}>
              <Icon name="edit" size={14} color={c.textMuted} />
            </PressableScale>
          ) : null}
        </View>
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
      ],
    );
  }

  const durationMs =
    sessionDate && sessionFinishedAt ? Math.max(0, sessionFinishedAt.getTime() - sessionDate.getTime()) : 0;
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
    sessionDollarsPerChip,
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
        { bold },
      ),
    [blindsShareText, durationText, results, sessionDate, sessionHostName, sessionLocation, settlements],
  );

  const shareTitle = sessionDate
    ? `Nonsense · ${formatSessionTitle(sessionDate, sessionLocation)}`
    : 'Nonsense results';

  // Text via the system share sheet (WhatsApp, Telegram, iMessage, ...). Plain text: *bold* markers only render in WhatsApp.
  const handleShareText = useCallback(async () => {
    const message = buildSettlementMessage(false);
    try {
      if (Platform.OS !== 'web') {
        await Share.share({ message, title: shareTitle });
        return;
      }
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: shareTitle, text: message });
        return;
      }
      // Desktop browsers without Web Share: copy instead, with the same "copied" tick as the copy button.
      await Clipboard.setStringAsync(message);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      appAlert('Results copied', 'Paste them into any chat to share.');
    } catch (e) {
      if (isShareCancel(e)) return;
      appAlert('Share failed', userMessage(e, 'Could not open share options.'));
    }
  }, [buildSettlementMessage, shareTitle]);

  // Image: capture the off-screen ShareCard as a PNG, then hand it to the share sheet (or download it on web).
  const handleShareImage = useCallback(async () => {
    try {
      await shareViewAsImage(shareCardRef, { fileName: shareImageName(sessionDate, sessionLocation), title: shareTitle });
    } catch (e) {
      if (isShareCancel(e)) return;
      appAlert('Share failed', userMessage(e, 'Could not create the results image.'));
    }
  }, [shareTitle, sessionDate, sessionLocation]);

  const openShareMenu = useCallback(() => {
    const node = shareButtonRef.current;
    if (!node) {
      setShareAnchor(null);
      setShareMenuOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setShareAnchor({ x, y, width, height });
      setShareMenuOpen(true);
    });
  }, []);

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
    }, [goToHistory]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      // Short header ("Session summary") so the copy/share buttons never squeeze it; the session name is the page heading.
      title: sessionDate ? `Session summary · ${formatSessionTitle(sessionDate, sessionLocation)}` : 'Session summary',
      headerTitle: 'Session summary',
      headerLeft: () => (
        <Pressable
          onPress={goToHistory}
          hitSlop={12}
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
            ref={shareButtonRef}
            onPress={openShareMenu}
            hitSlop={8}
            style={[styles.headerShareBtn, { backgroundColor: c.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Share results"
            aria-haspopup="menu">
            <Icon name="share" size={18} color={c.onAccent} />
          </Pressable>
        </View>
      ),
    });
  }, [
    navigation,
    sessionDate,
    sessionLocation,
    openShareMenu,
    handleCopyResults,
    isCopied,
    goToHistory,
    c.text,
    c.card,
    c.inputBorder,
    c.profit,
    c.accent,
    c.onAccent,
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
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: c.accent, opacity: pressed ? 0.9 : 1 }]}
          accessibilityRole="button"
          onPress={() => router.back()}>
          <Text style={[text.button, { color: c.onAccent }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Left bar matches the medal colour so bar and badge always agree.
  const rankBarColor = (rank: number) => medalColor(rank, c, isDark) ?? 'transparent';

  const settlementEntering = celebrate
    ? FadeIn.duration(260).delay(celebrationRowDelay(results.length)).reduceMotion(ReduceMotion.System)
    : fadeIn;

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[layout.content, styles.scrollContent]}
        keyboardShouldPersistTaps="handled">
        {/* Heading: the date; the venue lives in the Location tile right below. */}
        {sessionDate ? (
          <View style={isMd ? styles.pageHeading : styles.pageHeadingStack}>
            <View style={styles.pageHeadingPart}>
              <Icon name="calendar" size={isMd ? 24 : 18} color={c.textMuted} />
              <Text style={[styles.pageTitle, isMd && styles.pageTitleWide, { color: c.text }]} numberOfLines={1}>
                {formatSessionDay(sessionDate, undefined, true)}
              </Text>
            </View>
            {/* Start – end time, muted, beside the date ("6:41 PM – 11:18 PM"). */}
            <View style={styles.pageHeadingPart}>
              <Icon name="clock-outline" size={isMd ? 18 : 16} color={c.textMuted} />
              <Text style={[text.label, isMd && styles.pageTimeWide, { color: c.textMuted }]} numberOfLines={1}>
                {formatSessionTime(sessionDate)}
                {sessionFinishedAt ? ` – ${formatSessionTime(sessionFinishedAt)}` : ''}
              </Text>
            </View>
          </View>
        ) : null}
        <Animated.View entering={fadeIn} style={[styles.metaCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.metaGrid}>
            <View style={styles.metaGridRow}>
              <View style={styles.metaGridCell}>{locationCell}</View>
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
            <Icon name="trophy-outline" size={sectionIconSize} color={c.accentText} />
            <Text style={[sectionTitleStyle, { color: c.text }]}>Standings</Text>
          </View>
          {results.map((item, index) => (
            <ResultRow
              key={item.playerId}
              item={item}
              index={index}
              isMe={Boolean(user?.uid && item.playerId === user.uid)}
              isEarly={earlyPlayerIds.has(item.playerId)}
              avatar={getAvatarEmoji(item.playerId, playerProfile, friendAvatarMap)}
              medal={medalColor(index, c, isDark)}
              barColor={rankBarColor(index)}
              celebrate={celebrate}
              c={c}
            />
          ))}
        </View>

        <Animated.View entering={settlementEntering} style={styles.settlementBlock}>
          <View style={styles.sectionHeader}>
            <Icon name="bank" size={sectionIconSize} color={c.green} />
            <Text style={[sectionTitleStyle, { color: c.text }]}>Settlement</Text>
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
                    {/* One line: "Jordan [hand with coins] Alex" = Jordan pays Alex. */}
                    <View style={styles.settlementNames}>
                      <Text style={[text.rowTitle, styles.settlementName, { color: c.text }]} numberOfLines={1}>
                        {s.from}
                      </Text>
                      <Icon name="pays" size={18} color={c.green} accessibilityLabel="pays" />
                      <Text style={[text.rowTitle, styles.settlementName, { color: c.text }]} numberOfLines={1}>
                        {s.to}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.settlementAmountPill,
                        { backgroundColor: c.accentBg, borderColor: c.accentBorder },
                      ]}>
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
              // Same filled card as Settings' Sign out, so destructive buttons look alike across the app.
              { borderColor: c.border, backgroundColor: c.card },
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
      {/* Off-screen source for "Share as image"; never visible or focusable. */}
      <View style={styles.shareCardHost} importantForAccessibility="no-hide-descendants" aria-hidden>
        <ShareCard
          ref={shareCardRef}
          date={sessionDate}
          location={sessionLocation}
          hostId={sessionHostId}
          blinds={blindsShareText}
          duration={durationText}
          finishedAt={sessionFinishedAt}
          results={results}
          settlements={settlements}
          avatarFor={(playerId) => getAvatarEmoji(playerId, playerProfile, friendAvatarMap)}
        />
      </View>
      <PlayerActionMenu
        visible={shareMenuOpen}
        title="Share results"
        anchor={shareAnchor}
        onClose={() => setShareMenuOpen(false)}
        actions={[
          { key: 'text', label: 'Share as text', icon: 'share', onSelect: () => void handleShareText() },
          { key: 'image', label: 'Share as image', icon: 'image', onSelect: () => void handleShareImage() },
        ]}
      />
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
  pageHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  // Phones: time sits under the date instead of squeezing beside it.
  pageHeadingStack: {
    gap: 6,
  },
  pageTimeWide: {
    fontSize: 15,
  },
  pageHeadingPart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  pageTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  pageTitleWide: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
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
  locationValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationValue: {
    flexShrink: 1,
  },
  locationEditBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginVertical: -6,
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
    gap: 12,
    paddingHorizontal: 4,
    marginBottom: 4,
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
  medal: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settlementName: {
    flexShrink: 1,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareCardHost: {
    position: 'absolute',
    left: -10000,
    top: 0,
    pointerEvents: 'none',
  },
  headerShareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 36px visible circle (hover ring); hitSlop keeps the tap target past 44px.
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: -2,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
