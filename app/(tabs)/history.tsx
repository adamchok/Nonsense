import { WebDateInput } from '@/components/web/web-date-input';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors } from '@/lib/app-theme';
import { pressBg } from '@/lib/ui';
import { useAuth } from '@/lib/auth-context';
import {
  formatCurrency,
  formatSessionBlindsForDisplay,
  formatSignedCurrency,
  formatTightCompactNumber,
} from '@/lib/currency-format';
import { parseAmount, sanitizeAmountInput } from '@/lib/parse-amount';
import { formatDateTimeDMY } from '@/lib/date-format';
import { appAlert } from '@/lib/app-alert';
import { deleteSession, getSessionHistoryPage, HISTORY_TAB_PAGE_SIZE, leaveSession } from '@/lib/firestore';
import type { SessionRecord } from '@/types';
import { Icon } from '@/components/icon';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { userMessage } from '@/lib/user-message';
import { EmptyState } from '@/components/empty-state';
import { PLChart } from '@/components/pl-chart';
import { Animated as Motion, PressableScale, layoutTransition, fadeOut, listItemEntering, webSafe } from '@/components/motion';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Keyframe, ReduceMotion, FadeIn } from 'react-native-reanimated';

/** Dropdown menus grow from their top-right anchor: fade + scale up from 0.96. */
const menuEntering = webSafe(
  new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.96 }] },
    100: { opacity: 1, transform: [{ scale: 1 }] },
  })
    .duration(160)
    .reduceMotion(ReduceMotion.System),
  FadeIn.duration(160).reduceMotion(ReduceMotion.System),
);

/** Width of the red action revealed by swiping a history row left. */
const SWIPE_ACTION_WIDTH = 96;

type HistoryEntry = SessionRecord & { totalBuyIn: number; cashOut: number; profit: number };
type SortKey = 'datetime' | 'buyIn' | 'profit' | 'duration';
type SortDirection = 'desc' | 'asc';
type FilterState = {
  locations: string[] | null;
  startDate: string;
  endDate: string;
  buyInMin: string;
  buyInMax: string;
  profitMin: string;
  profitMax: string;
};

const DEFAULT_FILTERS: FilterState = {
  locations: null,
  startDate: '',
  endDate: '',
  buyInMin: '',
  buyInMax: '',
  profitMin: '',
  profitMax: '',
};

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

function parseDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAmountInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return parseAmount(trimmed);
}

function mergeHistoryPages(prev: HistoryEntry[], next: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();
  for (const e of prev) byId.set(e.id, e);
  for (const e of next) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

function hasAnyFilterValue(filter: FilterState): boolean {
  return (
    filter.locations !== null ||
    filter.startDate.trim() !== '' ||
    filter.endDate.trim() !== '' ||
    filter.buyInMin.trim() !== '' ||
    filter.buyInMax.trim() !== '' ||
    filter.profitMin.trim() !== '' ||
    filter.profitMax.trim() !== ''
  );
}

export default function HistoryScreen() {
  const c = useAppColors();
  const layout = usePageLayout();
  const router = useRouter();
  const { playerProfile } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const historyPageCursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end' | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('datetime');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const filterScrollRef = useRef<ScrollView>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshSpin = useRef(new Animated.Value(0)).current;
  /**
   * Rows already shown once. The list remounts on every focus (spinner in between), so rows
   * only play their entrance the first time their id appears: new or newly loaded ones.
   */
  const shownRowIdsRef = useRef(new Set<string>());
  /** Bumped on every fresh load and on blur so a stale response (or its cursor) can't land. */
  const loadGenerationRef = useRef(0);

  const loadHistory = useCallback(async () => {
    if (!playerProfile) {
      setLoading(false);
      return;
    }
    const generation = ++loadGenerationRef.current;
    try {
      setError(null);
      historyPageCursorRef.current = null;
      const page = await getSessionHistoryPage(
        playerProfile.id,
        HISTORY_TAB_PAGE_SIZE,
        null
      );
      if (generation !== loadGenerationRef.current) return;
      setHistory(page.entries);
      historyPageCursorRef.current = page.lastDoc;
      setHasMoreHistory(page.hasMore);
    } catch (e) {
      if (generation !== loadGenerationRef.current) return;
      setError(userMessage(e, 'Failed to load history.'));
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [playerProfile]);

  const loadMoreHistory = useCallback(async () => {
    if (!playerProfile || loadingMore || !hasMoreHistory) return;
    const cursor = historyPageCursorRef.current;
    if (!cursor) return;
    const generation = loadGenerationRef.current;
    try {
      setLoadingMore(true);
      setError(null);
      const page = await getSessionHistoryPage(
        playerProfile.id,
        HISTORY_TAB_PAGE_SIZE,
        cursor
      );
      if (generation !== loadGenerationRef.current) return;
      setHistory((prev) => mergeHistoryPages(prev, page.entries));
      historyPageCursorRef.current = page.lastDoc;
      setHasMoreHistory(page.hasMore);
    } catch (e) {
      if (generation !== loadGenerationRef.current) return;
      setError(userMessage(e, 'Failed to load more history.'));
    } finally {
      setLoadingMore(false);
    }
  }, [playerProfile, loadingMore, hasMoreHistory]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadHistory();
      return () => {
        // Invalidate in-flight loads when the screen blurs.
        loadGenerationRef.current += 1;
      };
    }, [loadHistory])
  );

  const locationOptions = useMemo(() => {
    const names = history
      .map((item) => item.location?.trim())
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b));
    return [...new Set(names)];
  }, [history]);
  const filteredLocationOptions = useMemo(() => {
    const query = locationSearch.trim().toLowerCase();
    if (!query) return locationOptions;
    return locationOptions.filter((name) => name.toLowerCase().includes(query));
  }, [locationOptions, locationSearch]);
  const refreshRotate = refreshSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const filteredHistory = useMemo(() => {
    const startDate = parseDateInput(filters.startDate);
    const endDate = parseDateInput(filters.endDate);
    const endExclusive = endDate
      ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1)
      : null;
    const buyInMin = parseAmountInput(filters.buyInMin);
    const buyInMax = parseAmountInput(filters.buyInMax);
    const profitMin = parseAmountInput(filters.profitMin);
    const profitMax = parseAmountInput(filters.profitMax);

    return history.filter((entry) => {
      if (filters.locations !== null) {
        const location = entry.location?.trim() ?? '';
        if (!filters.locations.includes(location)) return false;
      }
      if (startDate && entry.date < startDate) return false;
      if (endExclusive && entry.date >= endExclusive) return false;
      if (buyInMin !== null && entry.totalBuyIn < buyInMin) return false;
      if (buyInMax !== null && entry.totalBuyIn > buyInMax) return false;
      if (profitMin !== null && entry.profit < profitMin) return false;
      if (profitMax !== null && entry.profit > profitMax) return false;
      return true;
    });
  }, [filters, history]);
  const sortedHistory = useMemo(() => {
    const next = [...filteredHistory];
    const direction = sortDirection === 'asc' ? 1 : -1;
    next.sort((a, b) => {
      if (sortBy === 'buyIn') return (a.totalBuyIn - b.totalBuyIn) * direction;
      if (sortBy === 'profit') return (a.profit - b.profit) * direction;
      if (sortBy === 'duration') return (getSessionDurationMs(a) - getSessionDurationMs(b)) * direction;
      return (a.date.getTime() - b.date.getTime()) * direction;
    });
    return next;
  }, [filteredHistory, sortBy, sortDirection]);

  const totalProfit = filteredHistory.reduce((s, h) => s + h.profit, 0);
  const totalDurationMs = filteredHistory.reduce((sum, h) => sum + getSessionDurationMs(h), 0);
  const totalHoursPlayed = totalDurationMs / 3_600_000;
  const hasActiveFilters = hasAnyFilterValue(filters);
  const hasDraftFilters = hasAnyFilterValue(draftFilters);
  const allLocationsSelected = draftFilters.locations === null
    || (locationOptions.length > 0
      && locationOptions.every((name) => draftFilters.locations?.includes(name)));
  function openFilters() {
    setShowSortDropdown(false);
    setDraftFilters(filters);
    setShowFilterModal(true);
  }

  function applyFilters() {
    setFilters(draftFilters);
    setShowFilterModal(false);
    setShowLocationModal(false);
    setDatePickerTarget(null);
  }

  function clearDraftFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setShowLocationModal(false);
  }

  /**
   * Web fallback: the browser date field hands back YYYY-MM-DD ('' when cleared). It stays
   * open after a change, since typing a date fires several changes before it is finished.
   */
  function onWebDatePicked(value: string) {
    if (!datePickerTarget) return;
    const key = datePickerTarget === 'start' ? 'startDate' : 'endDate';
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  }

  function onDatePicked(event: DateTimePickerEvent, selectedDate?: Date) {
    if (event.type === 'dismissed') {
      setDatePickerTarget(null);
      return;
    }
    if (!selectedDate || !datePickerTarget) return;
    const formatted = formatDateInput(selectedDate);
    if (datePickerTarget === 'start') {
      setDraftFilters((prev) => ({ ...prev, startDate: formatted }));
    } else {
      setDraftFilters((prev) => ({ ...prev, endDate: formatted }));
    }
    if (Platform.OS !== 'ios') {
      setDatePickerTarget(null);
    }
  }

  useEffect(() => {
    if (!refreshing) {
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
  }, [refreshing, refreshSpin]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setShowSortDropdown(false);
    setRefreshing(true);
    try {
      await loadHistory();
    } finally {
      refreshSpin.stopAnimation(() => {
        refreshSpin.setValue(0);
      });
    }
  }, [refreshing, loadHistory, refreshSpin]);

  /**
   * A session you did not host can be created by anyone, listing you as a participant with
   * a result in your name. Leaving removes you from it and deletes that record.
   */
  const confirmLeaveSession = useCallback(
    (sessionId: string) => {
      const playerId = playerProfile?.id;
      if (!playerId) return;
      appAlert(
        'Remove this session?',
        'It leaves your history, statistics and leaderboards, and your result for it is deleted. Other players keep their own records. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await leaveSession(sessionId, playerId);
                  await loadHistory();
                } catch (e) {
                  appAlert('Error', userMessage(e, 'Failed to remove session.'));
                }
              })();
            },
          },
        ]
      );
    },
    [playerProfile?.id, loadHistory]
  );

  /** Host-only: deletes the whole session (ledger and every player's result) for everyone. */
  const confirmDeleteSession = useCallback(
    (sessionId: string) => {
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
                  await deleteSession(sessionId);
                  await loadHistory();
                } catch (e) {
                  appAlert('Error', userMessage(e, 'Failed to delete session.'));
                }
              })();
            },
          },
        ]
      );
    },
    [loadHistory]
  );

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: c.bg, paddingHorizontal: layout.gutter, paddingBottom: layout.gutter, gap: layout.sectionGap },
      ]}>
      {showSortDropdown ? (
        // Not a control (no role, no focus), so it gets no hover tint or tab stop.
        <Pressable style={styles.menuBackdrop} onPress={() => setShowSortDropdown(false)} accessible={false} focusable={false} tabIndex={-1} aria-hidden />
      ) : null}
      <View style={[styles.titleRow, showSortDropdown && styles.menuAnchorRaised]}>
        <Text style={[styles.title, { color: c.text }]}>My Winnings</Text>
        <View style={styles.headerActions}>
          <PressableScale
            pressedScale={0.92}
            style={[
              styles.filterButton,
              { backgroundColor: c.cardAlt, borderColor: c.border },
              refreshing && styles.refreshDisabled,
            ]}
            onPress={() => void handleRefresh()}
            accessibilityRole="button"
            accessibilityLabel="Refresh history">
            <Animated.View style={{ transform: [{ rotate: refreshRotate }] }}>
              <Icon name="refresh" size={20} color={c.textMuted} />
            </Animated.View>
          </PressableScale>
          <View style={styles.sortWrap}>
            <PressableScale
              pressedScale={0.92}
              style={[styles.filterButton, { backgroundColor: c.cardAlt, borderColor: c.border }]}
              onPress={() => setShowSortDropdown((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel="Open sort options">
              <Icon name="sort" size={20} color={c.textMuted} />
            </PressableScale>
            {showSortDropdown ? (
              <Motion.View
                entering={menuEntering}
                exiting={fadeOut}
                style={[styles.sortDropdown, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.sortSectionTitle, { color: c.textHint }]}>Sort by</Text>
                <Pressable
                  style={[styles.sortOption, sortBy === 'datetime' && { backgroundColor: c.accentBg }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortBy === 'datetime' }}
                  onPress={() => {
                    setSortBy('datetime');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Date & time</Text>
                  {sortBy === 'datetime' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
                <Pressable
                  style={[styles.sortOption, sortBy === 'buyIn' && { backgroundColor: c.accentBg }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortBy === 'buyIn' }}
                  onPress={() => {
                    setSortBy('buyIn');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Buy-in</Text>
                  {sortBy === 'buyIn' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
                <Pressable
                  style={[styles.sortOption, sortBy === 'profit' && { backgroundColor: c.accentBg }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortBy === 'profit' }}
                  onPress={() => {
                    setSortBy('profit');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Profit</Text>
                  {sortBy === 'profit' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
                <Pressable
                  style={[styles.sortOption, sortBy === 'duration' && { backgroundColor: c.accentBg }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortBy === 'duration' }}
                  onPress={() => {
                    setSortBy('duration');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Duration</Text>
                  {sortBy === 'duration' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
                <View style={[styles.sortDivider, { backgroundColor: c.border }]} />
                <Text style={[styles.sortSectionTitle, { color: c.textHint }]}>Direction</Text>
                <Pressable
                  style={[styles.sortOption, sortDirection === 'desc' && { backgroundColor: c.accentBg }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortDirection === 'desc' }}
                  onPress={() => {
                    setSortDirection('desc');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Descending</Text>
                  {sortDirection === 'desc' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
                <Pressable
                  style={[styles.sortOption, sortDirection === 'asc' && { backgroundColor: c.accentBg }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortDirection === 'asc' }}
                  onPress={() => {
                    setSortDirection('asc');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Ascending</Text>
                  {sortDirection === 'asc' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
              </Motion.View>
            ) : null}
          </View>
          <PressableScale
            pressedScale={0.92}
            style={[
              styles.filterButton,
              {
                backgroundColor: hasActiveFilters ? c.accentBg : c.cardAlt,
                borderColor: hasActiveFilters ? c.accentBorder : c.border,
              },
            ]}
            onPress={openFilters}
            accessibilityRole="button"
            accessibilityLabel="Open history filters">
            <Icon
              name="filter-alt"
              size={20}
              color={hasActiveFilters ? c.accentText : c.textMuted}
            />
          </PressableScale>
        </View>
      </View>

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
            {formatTightCompactNumber(totalProfit, { signed: true, currency: true })}
          </Text>
          <Text style={[styles.summaryMeta, { color: c.textHint }]}>
            {filteredHistory.length} session{filteredHistory.length !== 1 ? 's' : ''}
            {hasActiveFilters ? ' (filtered)' : ''}
            {hasMoreHistory ? ` · ${history.length} loaded` : ''}
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
          <Text style={[styles.summaryMeta, { color: c.textHint }]}>
            {hasMoreHistory ? 'Among loaded sessions' : 'Across all sessions'}
          </Text>
        </View>
      </View>

      {!loading && filteredHistory.length >= 2 ? (
        <View style={[styles.chartCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <PLChart entries={filteredHistory} />
        </View>
      ) : null}

      {error ? <Text style={[styles.historyMeta, { color: c.loss }]}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={c.textMuted} />
        </View>
      ) : filteredHistory.length === 0 ? (
        history.length === 0 ? (
          <EmptyState
            icon="history"
            title="No sessions yet"
            message="Finished games show up here with your profit and loss."
            action={{ label: 'Start a session', icon: 'add', onPress: () => router.push('../session/new') }}
          />
        ) : (
          <EmptyState
            icon="filter-alt"
            title="No matching sessions"
            message="Try changing or clearing your filters."
          />
        )
      ) : (
        <Motion.FlatList
          data={sortedHistory}
          keyExtractor={(item) => item.id}
          itemLayoutAnimation={layoutTransition}
          style={styles.list}
          ListFooterComponent={
            hasMoreHistory ? (
              <View style={styles.historyPaginationFooter}>
                <PressableScale
                  style={[
                    styles.loadMoreBtn,
                    { backgroundColor: c.card, borderColor: c.inputBorder },
                    loadingMore && styles.loadMoreBtnDisabled,
                  ]}
                  onPress={() => void loadMoreHistory()}
                  disabled={loadingMore}
                  accessibilityRole="button"
                  accessibilityLabel="Load more history">
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={c.textMuted} />
                  ) : (
                    <Text style={[styles.loadMoreBtnLabel, { color: c.text }]}>
                      Load more ({HISTORY_TAB_PAGE_SIZE} older)
                    </Text>
                  )}
                </PressableScale>
              </View>
            ) : history.length > 0 ? (
              null
            ) : null
          }
          renderItem={({ item, index }) => {
            const isHost = Boolean(playerProfile && item.hostId === playerProfile.id);
            const isFirstShow = !shownRowIdsRef.current.has(item.id);
            shownRowIdsRef.current.add(item.id);
            return (
              <HistoryRow
                item={item}
                isHost={isHost}
                isFirst={index === 0}
                isLast={index === sortedHistory.length - 1}
                entering={isFirstShow ? listItemEntering(index) : undefined}
                onOpen={() => router.push(`../session/summary/${item.id}`)}
                onRemove={() => (isHost ? confirmDeleteSession(item.id) : confirmLeaveSession(item.id))}
              />
            );
          }}
        />
      )}

      <Modal
        visible={showFilterModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowFilterModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={() => setShowFilterModal(false)}
          />

          <KeyboardAvoidingView
            pointerEvents="box-none"
            style={styles.modalCenter}
            enabled={!showLocationModal}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : -60}
          >
            <View style={[styles.filterCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.filterHeaderRow}>
                <Text style={[styles.filterTitle, { color: c.text }]}>Filters</Text>
                <Pressable
                  onPress={() => setShowFilterModal(false)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close filters">
                  <Icon name="close" size={20} color={c.textHint} />
                </Pressable>
              </View>

              <ScrollView
                ref={filterScrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.filterBody}
                keyboardShouldPersistTaps="handled">
                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: c.textMuted }]}>Location</Text>
                  <Pressable
                    style={[styles.dropdownTrigger, { backgroundColor: c.inputBg, borderColor: c.border }]}
                    onPress={() => {
                      setLocationSearch('');
                      setShowLocationModal(true);
                    }}>
                    <Text style={[styles.dropdownTriggerText, { color: c.text }]}>
                      {allLocationsSelected
                        ? `All Locations (${locationOptions.length})`
                        : draftFilters.locations?.length === 0
                          ? 'No locations selected'
                          : `${draftFilters.locations?.length ?? 0} selected`}
                    </Text>
                    <Icon name="chevron-right" size={20} color={c.textHint} />
                  </Pressable>
                </View>

                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: c.textMuted }]}>Date Range</Text>
                  <View style={styles.rowInputs}>
                    <Pressable
                      style={[
                        styles.dateButton,
                        { backgroundColor: c.inputBg, borderColor: c.border },
                        datePickerTarget === 'start' && { borderColor: c.accentBorder },
                      ]}
                      onPress={() => setDatePickerTarget('start')}>
                      <View style={styles.dateButtonInner}>
                        <Text
                          style={[
                            styles.dateButtonText,
                            { color: draftFilters.startDate ? c.text : c.placeholder },
                          ]}>
                          {draftFilters.startDate || 'Start date'}
                        </Text>
                        {draftFilters.startDate ? (
                          <Pressable
                            style={[styles.dateClearBtn]}
                            accessibilityRole="button"
                            accessibilityLabel="Clear start date"
                            onPress={(event) => {
                              event.stopPropagation();
                              setDraftFilters((prev) => ({ ...prev, startDate: '' }));
                              if (datePickerTarget === 'start') setDatePickerTarget(null);
                            }}
                            hitSlop={6}>
                            <Icon name="close" size={14} color={c.textHint} />
                          </Pressable>
                        ) : null}
                      </View>
                    </Pressable>
                    <Text style={[styles.dashText, { color: c.textMuted }]}>– </Text>
                    <Pressable
                      style={[
                        styles.dateButton,
                        { backgroundColor: c.inputBg, borderColor: c.border },
                        datePickerTarget === 'end' && { borderColor: c.accentBorder },
                      ]}
                      onPress={() => setDatePickerTarget('end')}>
                      <View style={styles.dateButtonInner}>
                        <Text
                          style={[
                            styles.dateButtonText,
                            { color: draftFilters.endDate ? c.text : c.placeholder },
                          ]}>
                          {draftFilters.endDate || 'End date'}
                        </Text>
                        {draftFilters.endDate ? (
                          <Pressable
                            style={[styles.dateClearBtn, { borderColor: c.border }]}
                            accessibilityRole="button"
                            accessibilityLabel="Clear end date"
                            onPress={(event) => {
                              event.stopPropagation();
                              setDraftFilters((prev) => ({ ...prev, endDate: '' }));
                              if (datePickerTarget === 'end') setDatePickerTarget(null);
                            }}
                            hitSlop={6}>
                            <Icon name="close" size={14} color={c.textHint} />
                          </Pressable>
                        ) : null}
                      </View>
                    </Pressable>
                  </View>
                  {datePickerTarget && Platform.OS === 'web' ? (
                    // datetimepicker renders nothing on web.
                    <WebDateInput
                      key={datePickerTarget}
                      value={datePickerTarget === 'start' ? draftFilters.startDate : draftFilters.endDate}
                      min={datePickerTarget === 'end' ? draftFilters.startDate : undefined}
                      max={datePickerTarget === 'start' ? draftFilters.endDate : undefined}
                      onChange={onWebDatePicked}
                      accessibilityLabel={datePickerTarget === 'start' ? 'Start date' : 'End date'}
                      colors={{ text: c.text, background: c.inputBg, border: c.accentBorder }}
                    />
                  ) : datePickerTarget ? (
                    <View style={[styles.pickerInlineWrap, { borderColor: c.border, backgroundColor: c.inputBg }]}>
                      <DateTimePicker
                        mode="date"
                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                        value={
                          parseDateInput(
                            datePickerTarget === 'start' ? draftFilters.startDate : draftFilters.endDate
                          ) ?? new Date()
                        }
                        onChange={onDatePicked}
                        maximumDate={datePickerTarget === 'start' ? parseDateInput(draftFilters.endDate) ?? undefined : undefined}
                        minimumDate={datePickerTarget === 'end' ? parseDateInput(draftFilters.startDate) ?? undefined : undefined}
                      />
                      {Platform.OS === 'ios' ? (
                        <View style={styles.pickerInlineActions}>
                          <Pressable
                            style={[styles.inlineActionBtn, { borderColor: c.border }]}
                            onPress={() => {
                              if (datePickerTarget === 'start') {
                                setDraftFilters((prev) => ({ ...prev, startDate: '' }));
                              } else {
                                setDraftFilters((prev) => ({ ...prev, endDate: '' }));
                              }
                            }}>
                            <Text style={[styles.inlineActionText, { color: c.text }]}>Clear</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.inlineActionBtn, { backgroundColor: c.accent }]}
                            onPress={() => setDatePickerTarget(null)}>
                            <Text style={[styles.inlineActionTextPrimary, { color: c.onAccent }]}>Done</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: c.textMuted }]}>Buy-in Range</Text>
                  <View style={styles.rowInputs}>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
                      ]}
                      accessibilityLabel="Minimum buy-in"
                      placeholder="Min"
                      placeholderTextColor={c.placeholder}
                      value={draftFilters.buyInMin}
                      onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, buyInMin: sanitizeAmountInput(value) }))}
                      keyboardType="decimal-pad"
                      onFocus={() => setTimeout(() => filterScrollRef.current?.scrollToEnd({ animated: true }), 150)}
                    />
                    <Text style={[styles.dashText, { color: c.textMuted }]}>–</Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
                      ]}
                      accessibilityLabel="Maximum buy-in"
                      placeholder="Max"
                      placeholderTextColor={c.placeholder}
                      value={draftFilters.buyInMax}
                      onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, buyInMax: sanitizeAmountInput(value) }))}
                      keyboardType="decimal-pad"
                      onFocus={() => setTimeout(() => filterScrollRef.current?.scrollToEnd({ animated: true }), 150)}
                    />
                  </View>
                </View>

                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: c.textMuted }]}>Profit Range</Text>
                  <View style={styles.rowInputs}>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
                      ]}
                      accessibilityLabel="Minimum profit"
                      placeholder="Min"
                      placeholderTextColor={c.placeholder}
                      value={draftFilters.profitMin}
                      onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, profitMin: sanitizeAmountInput(value, { allowNegative: true }) }))}
                      keyboardType="decimal-pad"
                      onFocus={() => setTimeout(() => filterScrollRef.current?.scrollToEnd({ animated: true }), 150)}
                    />
                    <Text style={[styles.dashText, { color: c.textMuted }]}>–</Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
                      ]}
                      accessibilityLabel="Maximum profit"
                      placeholder="Max"
                      placeholderTextColor={c.placeholder}
                      value={draftFilters.profitMax}
                      onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, profitMax: sanitizeAmountInput(value, { allowNegative: true }) }))}
                      keyboardType="decimal-pad"
                      onFocus={() => setTimeout(() => filterScrollRef.current?.scrollToEnd({ animated: true }), 150)}
                    />
                  </View>
                </View>
              </ScrollView>

              <View style={styles.filterActions}>
                <Pressable
                  style={[styles.actionBtnSecondary, { borderColor: c.inputBorder, backgroundColor: c.card }]}
                  onPress={clearDraftFilters}>
                  <Text style={[styles.actionBtnSecondaryLabel, { color: c.text }]}>Reset</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtnPrimary, { backgroundColor: c.accent }]}
                  onPress={applyFilters}>
                  <Text style={[styles.actionBtnPrimaryLabel, { color: c.onAccent }]}>
                    Apply{hasDraftFilters ? '' : ' (Show all)'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={showLocationModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowLocationModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={() => {
              setShowLocationModal(false);
              setLocationSearch('');
            }}
          />
          <View style={styles.modalCenter}>
            <View style={[styles.locationCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.filterHeaderRow}>
                <Text style={[styles.filterTitle, { color: c.text }]}>Select locations</Text>
                <Pressable
                  onPress={() => {
                    setShowLocationModal(false);
                    setLocationSearch('');
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close location picker">
                  <Icon name="close" size={20} color={c.textHint} />
                </Pressable>
              </View>
              <TextInput
                style={[
                  styles.input,
                  styles.locationSearchInput,
                  { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
                ]}
                placeholder="Search locations"
                placeholderTextColor={c.placeholder}
                value={locationSearch}
                onChangeText={setLocationSearch}
              />
              <ScrollView
                style={styles.locationList}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled">
                <Pressable
                  style={styles.dropdownOption}
                  onPress={() =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      locations: allLocationsSelected ? [] : null,
                    }))
                  }>
                  <Icon
                    name={allLocationsSelected ? 'check-box' : 'check-box-outline-blank'}
                    size={18}
                    color={allLocationsSelected ? c.accentText : c.textHint}
                  />
                  <Text style={[styles.dropdownOptionText, { color: c.text }]}>All locations</Text>
                </Pressable>
                {filteredLocationOptions.map((locationName) => {
                  const selected = allLocationsSelected || Boolean(draftFilters.locations?.includes(locationName));
                  return (
                    <Pressable
                      key={locationName}
                      style={styles.dropdownOption}
                      onPress={() =>
                        setDraftFilters((prev) => ({
                          ...prev,
                          locations: selected
                            ? (allLocationsSelected
                              ? locationOptions.filter((v) => v !== locationName)
                              : (prev.locations ?? []).filter((v) => v !== locationName))
                            : [...(prev.locations ?? []), locationName],
                        }))
                      }>
                      <Icon
                        name={selected ? 'check-box' : 'check-box-outline-blank'}
                        size={18}
                        color={selected ? c.accentText : c.textHint}
                      />
                      <Text style={[styles.dropdownOptionText, { color: c.text }]}>
                        {locationName}
                      </Text>
                    </Pressable>
                  );
                })}
                {filteredLocationOptions.length === 0 ? (
                  <Text style={[styles.emptyText, { color: c.textHint }]}>No locations found.</Text>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type HistoryRowProps = {
  item: HistoryEntry;
  isHost: boolean;
  isFirst: boolean;
  isLast: boolean;
  entering: ReturnType<typeof listItemEntering> | undefined;
  onOpen: () => void;
  onRemove: () => void;
};

/**
 * One history session. Tap opens the summary; swipe left (or the more button, long-press, or
 * the accessibility action) offers the same remove/delete, which still asks to confirm.
 */
function HistoryRow({ item, isHost, isFirst, isLast, entering, onOpen, onRemove }: HistoryRowProps) {
  const c = useAppColors();
  const swipeRef = useRef<SwipeableMethods>(null);
  const removeLabel = isHost ? 'Delete session' : 'Remove from history';
  const blindsText = formatSessionBlindsForDisplay(item.smallBlind, item.bigBlind, item.amountUnit, item.dollarsPerChip);

  const remove = () => {
    swipeRef.current?.close();
    onRemove();
  };

  return (
    <Motion.View entering={entering} exiting={fadeOut}>
      <ReanimatedSwipeable
        ref={swipeRef}
        friction={2}
        rightThreshold={SWIPE_ACTION_WIDTH / 2}
        overshootRight={false}
        containerStyle={[
          styles.historySwipeContainer,
          { backgroundColor: c.loss },
          isFirst && styles.historyCardFirst,
          isLast && styles.historySwipeContainerLast,
        ]}
        renderRightActions={() => (
          <Pressable
            onPress={remove}
            style={styles.historySwipeAction}
            accessibilityRole="button"
            accessibilityLabel={removeLabel}
            // The row already exposes this action (more button + accessibility action).
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            tabIndex={-1}>
            <Icon name="delete-outline" size={20} color="#fff" />
            <Text style={styles.historySwipeLabel}>{isHost ? 'Delete' : 'Remove'}</Text>
          </Pressable>
        )}>
        <PressableScale
          pressedScale={0.985}
          style={(state) => [
            styles.historyCard,
            isFirst && styles.historyCardFirst,
            isLast && styles.historyCardLast,
            { borderColor: c.border },
            pressBg(c, state, c.card),
          ]}
          onPress={onOpen}
          onLongPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`${formatDateTimeDMY(item.date)}, ${isHost ? 'host' : 'participant'}, ${item.profit >= 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(item.profit))}, ${item.location ? item.location : 'no location'}`}
          accessibilityHint="Opens the session summary"
          accessibilityActions={[{ name: 'remove', label: removeLabel }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'remove') onRemove();
          }}>
          <View style={styles.historyTop}>
            <View style={styles.historyTitleRow}>
              <Text style={[styles.historyLabel, { color: c.text }]}>{formatDateTimeDMY(item.date)}</Text>
              <View style={[styles.roleBadge, { backgroundColor: isHost ? c.badge.host : c.badge.you }]}>
                <Text style={styles.roleBadgeText}>{isHost ? 'HOST' : 'PARTICIPANT'}</Text>
              </View>
            </View>
            <View style={styles.historyTopRight}>
              <Text style={[styles.historyProfit, { color: item.profit >= 0 ? c.profit : c.loss }]}>
                {formatSignedCurrency(item.profit)}
              </Text>
              <PressableScale
                onPress={onRemove}
                hitSlop={8}
                pressedScale={0.9}
                style={styles.historyMoreBtn}
                accessibilityRole="button"
                accessibilityLabel={removeLabel}>
                <Icon name="more-vert" size={20} color={c.textMuted} />
              </PressableScale>
            </View>
          </View>
          <Text style={[styles.historyMeta, { color: c.textMuted }]}>
            {item.location ? item.location : 'No location'}
            {blindsText ? ` • ${blindsText}` : ''}
            {' • '}
            {formatDuration(getSessionDurationMs(item))}
          </Text>
          <Text style={[styles.historyDetail, { color: c.textHint }]}>
            Buy-in: {formatCurrency(item.totalBuyIn)}  Cash-out: {formatCurrency(item.cashOut)}
          </Text>
        </PressableScale>
      </ReanimatedSwipeable>
    </Motion.View>
  );
}

const styles = StyleSheet.create({
  historySwipeContainer: {
    overflow: 'hidden',
  },
  /** Only the last row's corners are rounded at the bottom; clip the red layer to match. */
  historySwipeContainerLast: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  historySwipeAction: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  historySwipeLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  screen: {
    flex: 1,
    paddingTop: 48,
  },
  /** Matches Settings tab screen title (display 28/700). */
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 30,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortWrap: {
    position: 'relative',
    zIndex: 40,
  },
  /** Invisible layer behind an open dropdown: tapping anywhere outside the menu closes it. */
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  menuAnchorRaised: {
    zIndex: 10,
  },
  sortDropdown: {
    position: 'absolute',
    transformOrigin: 'top right',
    top: '100%',
    marginTop: 8,
    right: 0,
    borderWidth: 1,
    borderRadius: 14,
    minWidth: 180,
    paddingVertical: 4,
    elevation: 10,
  },
  sortCurrentRow: {
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  sortCurrentLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sortCurrentValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  sortSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.66,
    textTransform: 'uppercase',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 4,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sortDivider: {
    height: 1,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  refreshDisabled: {
    opacity: 0.6,
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  chartCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryCardHalf: {
    flex: 1,
    minWidth: 0,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.66,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summaryMeta: {
    fontSize: 12,
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  historyPaginationFooter: {
    paddingVertical: 16,
    paddingHorizontal: 4,
    gap: 10,
    alignItems: 'center',
  },
  loadMoreBtn: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 18,
    minWidth: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreBtnDisabled: {
    opacity: 0.7,
  },
  loadMoreBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  historyPaginationHint: {
    fontSize: 12,
    textAlign: 'center',
  },
  historyEndHint: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 14,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: '20%',
  },
  /** Rows of one card: side + top borders on every row; radius and bottom border on the ends. */
  historyCard: {
    minHeight: 52,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 2,
  },
  historyCardFirst: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  historyCardLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  historyTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Small visual circle; hitSlop keeps the tap target at 44px.
  historyMoreBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -4,
  },
  historyTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  historyLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    flexShrink: 1,
  },
  roleBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  historyProfit: {
    fontWeight: '600',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  historyMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  historyDetail: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  modalRoot: {
    flex: 1,
  },
  modalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  filterCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  filterBody: {
    gap: 16,
  },
  filterSection: {
    gap: 7,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderRadius: 9,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownTriggerText: {
    fontSize: 15,
    fontWeight: '500',
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  dropdownOptionText: {
    fontSize: 15,
  },
  locationCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '70%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  locationList: {
    maxHeight: 220,
  },
  locationSearchInput: {
    flex: 0,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 14,
  },
  chipsRow: {
    gap: 8,
    paddingRight: 2,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rowInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  dateButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  dateButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dateButtonText: {
    fontSize: 15,
    flex: 1,
  },
  dateClearBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashText: {
    fontSize: 14,
    fontWeight: '400',
  },
  pickerInlineWrap: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
    gap: 8,
  },
  pickerInlineActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  inlineActionBtn: {
    borderWidth: 1,
    borderRadius: 9,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  inlineActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inlineActionTextPrimary: {
    fontSize: 13,
    fontWeight: '700',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnSecondary: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  actionBtnSecondaryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  actionBtnPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  actionBtnPrimaryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
