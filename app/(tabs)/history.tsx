import { LinearGradient } from 'expo-linear-gradient';
import { useOutsidePress } from '@/lib/use-outside-press';
import { ModalShell } from '@/components/session/modal-shell';
import { formatDuration } from '@/lib/date-format';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { MetaLine, SessionTitle } from '@/components/meta-line';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors } from '@/lib/app-theme';
import { pointer, pressBg, text } from '@/lib/ui';
import { radius, space } from '@/lib/spacing';
import { useAuth } from '@/lib/auth-context';
import {
  formatCurrency,
  formatSessionBlindsForDisplay,
  formatSignedCurrency,
  formatTightCompactNumber,
} from '@/lib/currency-format';
import { formatSessionTime, formatSessionTitle } from '@/components/session/session-title';
import { appAlert } from '@/lib/app-alert';
import {
  deleteSession,
  getCachedSessionHistory,
  getPlayerAppStatistics,
  getSessionHistoryPage,
  HISTORY_TAB_PAGE_SIZE,
  type PlayerAppStatistics,
} from '@/lib/firestore';
import type { SessionRecord } from '@/types';
import { Icon, type IconName } from '@/components/icon';
import { SearchInput } from '@/components/search-input';
import { useFocusEffect, useRouter } from 'expo-router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { userMessage } from '@/lib/user-message';
import { EmptyState } from '@/components/empty-state';
import { PLChart } from '@/components/pl-chart';
import { StatsSheet } from '@/components/stats-body';
import { Skeleton, SkeletonGroup } from '@/components/skeleton';
import { HistoryFilterSheet } from '@/components/history-filter-sheet';
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  filterEntries,
  matchesSearch,
  sessionYears,
  yearRange,
  type FilterState,
} from '@/lib/history-filters';
import {
  Animated as Motion,
  PressableScale,
  fadeIn,
  fadeOut,
  listItemEntering,
  webSafe,
} from '@/components/motion';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Keyframe, ReduceMotion, FadeIn } from 'react-native-reanimated';

const menuEntering = webSafe(
  new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.96 }] },
    100: { opacity: 1, transform: [{ scale: 1 }] },
  })
    .duration(160)
    .reduceMotion(ReduceMotion.System),
  FadeIn.duration(160).reduceMotion(ReduceMotion.System),
);

const SWIPE_ACTION_WIDTH = 96;
const EXACT_TOTAL_LIMIT = 10_000;

function formatLifetimeTotal(amount: number): string {
  return Math.abs(amount) < EXACT_TOTAL_LIMIT
    ? formatSignedCurrency(amount)
    : formatTightCompactNumber(amount, { signed: true, currency: true });
}

type HistoryEntry = SessionRecord & { totalBuyIn: number; cashOut: number; profit: number };
type SortKey = 'datetime' | 'buyIn' | 'profit' | 'duration';
type SortDirection = 'desc' | 'asc';
function getSessionDurationMs(entry: HistoryEntry): number {
  if (!entry.finishedAt) return 0;
  const start = entry.date.getTime();
  const end = entry.finishedAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

function mergeHistoryPages(prev: HistoryEntry[], next: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();
  for (const e of prev) byId.set(e.id, e);
  for (const e of next) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

const CHART_TO_LIST_GAP = 16;
const CHIP_ROW_GAP = 14;
const NARROW_SUMMARY_WIDTH = 380;
const SORT_TRIGGER_ID = 'history-sort-trigger';
const SORT_MENU_ID = 'history-sort-menu';

export default function HistoryScreen() {
  const c = useAppColors();
  const layout = usePageLayout();
  const { width: screenWidth } = useBreakpoint();
  const narrowSummary = screenWidth < NARROW_SUMMARY_WIDTH;
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
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const closeSortDropdown = useCallback(() => setShowSortDropdown(false), []);
  useOutsidePress(showSortDropdown, closeSortDropdown, [SORT_MENU_ID, SORT_TRIGGER_ID]);
  const [sortBy, setSortBy] = useState<SortKey>('datetime');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);
  const shownRowIdsRef = useRef(new Set<string>());
  const loadGenerationRef = useRef(0);

  const loadHistory = useCallback(async (force = false) => {
    if (!playerProfile) {
      setLoading(false);
      return;
    }
    const generation = ++loadGenerationRef.current;
    try {
      setError(null);
      historyPageCursorRef.current = null;
      const page = await getSessionHistoryPage(playerProfile.id, HISTORY_TAB_PAGE_SIZE, null);
      if (generation !== loadGenerationRef.current) return;
      setHistory(page.entries);
      historyPageCursorRef.current = page.lastDoc;
      setHasMoreHistory(page.hasMore);
      if (page.hasMore) {
        getCachedSessionHistory(playerProfile.id, force)
          .then((all) => {
            if (generation !== loadGenerationRef.current) return;
            setHistory(all);
            historyPageCursorRef.current = null;
            setHasMoreHistory(false);
          })
          .catch((e) => console.warn('Full history load failed; keeping paged history.', e));
      }
    } catch (e) {
      if (generation !== loadGenerationRef.current) return;
      setError(userMessage(e, 'Failed to load history.'));
    } finally {
      if (generation === loadGenerationRef.current) {
        hasLoadedRef.current = true;
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
      const page = await getSessionHistoryPage(playerProfile.id, HISTORY_TAB_PAGE_SIZE, cursor);
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

  const loadingAllRef = useRef(false);
  const loadRemainingHistory = useCallback(async () => {
    if (!playerProfile || loadingAllRef.current) return;
    loadingAllRef.current = true;
    const generation = loadGenerationRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      let cursor = historyPageCursorRef.current;
      while (cursor) {
        const page = await getSessionHistoryPage(playerProfile.id, HISTORY_TAB_PAGE_SIZE, cursor);
        if (generation !== loadGenerationRef.current) return;
        setHistory((prev) => mergeHistoryPages(prev, page.entries));
        cursor = page.hasMore ? page.lastDoc : null;
        historyPageCursorRef.current = page.lastDoc;
        setHasMoreHistory(page.hasMore);
      }
    } catch (e) {
      if (generation === loadGenerationRef.current) setError(userMessage(e, 'Failed to load older sessions.'));
    } finally {
      loadingAllRef.current = false;
      setLoadingMore(false);
    }
  }, [playerProfile]);

  const [lifetime, setLifetime] = useState<PlayerAppStatistics | null>(null);
  const playerId = playerProfile?.id;
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) setLoading(true);
      void loadHistory();
      let cancelled = false;
      if (playerId) {
        getPlayerAppStatistics(playerId)
          .then((data) => {
            if (!cancelled) setLifetime(data);
          })
          .catch(() => {
            if (!cancelled) setLifetime(null);
          });
      }
      return () => {
        cancelled = true;
        loadGenerationRef.current += 1;
      };
    }, [loadHistory, playerId]),
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const scrollYRef = useRef(0);
  const listHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const updateEdges = useCallback(() => {
    const top = scrollYRef.current > 2;
    const bottom = scrollYRef.current + listHeightRef.current < contentHeightRef.current - 2;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  const isSearching = searchQuery.trim().length > 0;
  const showSearch = searchOpen || searchQuery.length > 0;
  const toggleSearch = () => {
    if (showSearch) setSearchQuery('');
    setSearchOpen(!showSearch);
  };
  const filteredHistory = useMemo(
    () => filterEntries(history, filters).filter((e) => matchesSearch(e, searchQuery)),
    [filters, history, searchQuery],
  );
  const draftMatchCount = useMemo(
    () =>
      showFilterModal
        ? filterEntries(history, draftFilters).filter((e) => matchesSearch(e, searchQuery)).length
        : 0,
    [showFilterModal, history, draftFilters, searchQuery],
  );
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

  const hasActiveFilters = countActiveFilters(filters) > 0;
  const useLifetime = Boolean(lifetime && !hasActiveFilters && !isSearching && hasMoreHistory);
  const totalProfit = useLifetime && lifetime ? lifetime.totalProfit : filteredHistory.reduce((s, h) => s + h.profit, 0);
  const totalDurationMs =
    useLifetime && lifetime
      ? lifetime.totalPlayTimeMs
      : filteredHistory.reduce((sum, h) => sum + getSessionDurationMs(h), 0);
  const totalHoursPlayed = totalDurationMs / 3_600_000;
  const sessionCount = useLifetime && lifetime ? lifetime.finishedSessions : filteredHistory.length;
  const isLoadingRest = hasMoreHistory && !useLifetime;
  const hasNonDateFilters = countActiveFilters({ ...filters, startDate: '', endDate: '' }) > 0;
  const allLocationsSelected =
    draftFilters.locations === null ||
    (locationOptions.length > 0 && locationOptions.every((name) => draftFilters.locations?.includes(name)));
  function openFilters() {
    setShowSortDropdown(false);
    setDraftFilters(filters);
    setShowFilterModal(true);
  }

  function applyFilters() {
    setFilters(draftFilters);
    if (countActiveFilters(draftFilters) > 0 && hasMoreHistory) void loadRemainingHistory();
    setShowFilterModal(false);
    setShowLocationModal(false);
  }

  function clearDraftFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setShowLocationModal(false);
  }

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setShowSortDropdown(false);
    setRefreshing(true);
    void loadHistory(true);
  }, [refreshing, loadHistory]);

  const openSessionSummary = useCallback(
    (sessionId: string) => router.push(`../session/summary/${sessionId}`),
    [router],
  );

  const years = useMemo(() => {
    const first = lifetime?.firstSessionDate?.getFullYear();
    const last = lifetime?.lastSessionDate?.getFullYear();
    const span = first && last ? Array.from({ length: last - first + 1 }, (_, i) => first + i) : [];
    return [...new Set([...sessionYears(history), ...span])].sort((a, b) => b - a);
  }, [history, lifetime]);
  const selectedYear = useMemo(() => {
    const today = new Date();
    return (
      years.find((y) => {
        const r = yearRange(y, today);
        return filters.startDate === r.start && filters.endDate === r.end;
      }) ?? null
    );
  }, [years, filters.startDate, filters.endDate]);
  const hasDateFilter = Boolean(filters.startDate || filters.endDate);
  const selectPeriod = useCallback(
    (year: number | null) => {
      const r = year === null ? { start: '', end: '' } : yearRange(year, new Date());
      setFilters((prev) => ({ ...prev, startDate: r.start, endDate: r.end }));
      if (year !== null && hasMoreHistory) void loadRemainingHistory();
    },
    [hasMoreHistory, loadRemainingHistory],
  );
  const titlePeriod = selectedYear ? `in ${selectedYear}` : hasDateFilter ? 'in selected dates' : undefined;
  const chartPeriod = useLifetime ? `(last ${history.length})` : titlePeriod;

  const chartHeader = useMemo(
    () => (
      isSearching ? null : (
        <>
          {filteredHistory.length >= 2 ? (
            <View
              style={[
                styles.chartCard,
                { backgroundColor: c.card, borderColor: c.border },
              ]}>
              <PLChart entries={filteredHistory} titlePeriod={chartPeriod} onOpen={openSessionSummary} />
            </View>
          ) : null}
        </>
      )
    ),
    [filteredHistory, isSearching, chartPeriod, c.card, c.border, openSessionSummary],
  );

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
        ],
      );
    },
    [loadHistory],
  );

  const summary = (
    <View style={styles.summaryRow}>
      <View
        style={[
          styles.summaryCard,
          styles.summaryCardHalf,
          { backgroundColor: c.card, borderColor: c.borderAccent },
        ]}>
        <Text style={[styles.summaryLabel, { color: c.textMuted }]}>
          {titlePeriod ? `Profit/loss ${titlePeriod}` : 'Lifetime profit/loss'}
        </Text>
        {loading ? (
          <SummaryValueSkeleton valueWidth={96} metaWidth={70} />
        ) : (
          <>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                styles.summaryValue,
                narrowSummary && styles.summaryValueNarrow,
                { color: totalProfit >= 0 ? c.profit : c.loss },
              ]}>
              {formatLifetimeTotal(totalProfit)}
            </Text>
            <Text style={[styles.summaryMeta, { color: c.textHint }]}>
              {sessionCount} session{sessionCount !== 1 ? 's' : ''}
              {hasNonDateFilters ? ' (filtered)' : ''}
            </Text>
          </>
        )}
      </View>
      <View style={[styles.summaryCard, styles.summaryCardHalf, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.summaryLabel, { color: c.textMuted }]}>Total played</Text>
        {loading ? (
          <SummaryValueSkeleton valueWidth={64} metaWidth={110} />
        ) : (
          <>
            <Text style={[styles.summaryValue, narrowSummary && styles.summaryValueNarrow, { color: c.text }]}>
              {totalHoursPlayed.toFixed(1)}h
            </Text>
            <Text style={[styles.summaryMeta, { color: c.textHint }]}>
              {isLoadingRest ? 'Loading older sessions…' : titlePeriod ? `In ${titlePeriod.slice(3)}` : 'Across all sessions'}
            </Text>
          </>
        )}
      </View>
    </View>
  );

  const statsLink = (
    <PressableScale
      pressedScale={0.985}
      onPress={() => setShowStats(true)}
      accessibilityRole="button"
      accessibilityLabel="All statistics"
      style={(state) => [styles.statsLink, { borderColor: c.border }, pressBg(c, state, c.card)]}>
      <Icon name="bar-chart" size={18} color={c.textMuted} importantForAccessibility="no" />
      <Text style={[styles.statsLinkLabel, { color: c.text }]}>All statistics</Text>
      <Icon name="chevron-right" size={18} color={c.textMuted} importantForAccessibility="no" />
    </PressableScale>
  );

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: c.bg,
          paddingHorizontal: layout.gutter,
          paddingBottom: layout.gutter,
          gap: layout.sectionGap,
        },
        layout.tabTop,
        layout.column,
      ]}>
      {showSortDropdown ? (
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setShowSortDropdown(false)}
          accessible={false}
          focusable={false}
          tabIndex={-1}
          aria-hidden
        />
      ) : null}
      <View style={[styles.titleRow, showSortDropdown && styles.menuAnchorRaised]}>
        <View style={styles.pageTitleRow}>
          <Icon name="history" size={26} color={c.textMuted} importantForAccessibility="no" />
          <Text style={[styles.title, { color: c.text }]}>History</Text>
        </View>
        <View style={styles.headerActions}>
          {history.length > 0 ? (
            <PressableScale
              pressedScale={0.92}
              style={[
                styles.filterButton,
                showSearch
                  ? { backgroundColor: c.accentBg, borderColor: c.accentBorder }
                  : { backgroundColor: c.card, borderColor: c.inputBorder },
              ]}
              onPress={toggleSearch}
              accessibilityRole="button"
              accessibilityLabel={showSearch ? 'Close search' : 'Search sessions'}
              accessibilityState={{ expanded: showSearch }}>
              <Icon name="search" size={20} color={showSearch ? c.accentText : c.text} />
            </PressableScale>
          ) : null}
          <View style={styles.sortWrap}>
            <PressableScale
              pressedScale={0.92}
              style={[styles.filterButton, { backgroundColor: c.card, borderColor: c.inputBorder }]}
              onPress={() => setShowSortDropdown((prev) => !prev)}
              nativeID={SORT_TRIGGER_ID}
              accessibilityRole="button"
              accessibilityLabel="Open sort options">
              <Icon name="sort" size={20} color={c.text} />
            </PressableScale>
            {showSortDropdown ? (
              <Motion.View
                nativeID={SORT_MENU_ID}
                entering={menuEntering}
                exiting={fadeOut}
                style={[styles.sortDropdown, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.sortSectionTitle, { color: c.textHint }]}>Sort by</Text>
                <Pressable
                  style={(state) => [styles.sortOption, pressBg(c, state)]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortBy === 'datetime' }}
                  onPress={() => {
                    setSortBy('datetime');
                    setShowSortDropdown(false);
                  }}>
                  <View style={styles.sortOptionLabel}>
                    <Icon name="calendar" size={18} color={sortBy === 'datetime' ? c.accentText : c.textMuted} />
                    <Text style={[styles.sortOptionText, { color: c.text }]}>Date & time</Text>
                  </View>
                  {sortBy === 'datetime' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
                <Pressable
                  style={(state) => [styles.sortOption, pressBg(c, state)]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortBy === 'buyIn' }}
                  onPress={() => {
                    setSortBy('buyIn');
                    setShowSortDropdown(false);
                  }}>
                  <View style={styles.sortOptionLabel}>
                    <Icon name="money-in" size={18} color={sortBy === 'buyIn' ? c.accentText : c.textMuted} />
                    <Text style={[styles.sortOptionText, { color: c.text }]}>Buy-in</Text>
                  </View>
                  {sortBy === 'buyIn' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
                <Pressable
                  style={(state) => [styles.sortOption, pressBg(c, state)]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortBy === 'profit' }}
                  onPress={() => {
                    setSortBy('profit');
                    setShowSortDropdown(false);
                  }}>
                  <View style={styles.sortOptionLabel}>
                    <Icon name="trend-up" size={18} color={sortBy === 'profit' ? c.accentText : c.textMuted} />
                    <Text style={[styles.sortOptionText, { color: c.text }]}>Profit</Text>
                  </View>
                  {sortBy === 'profit' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
                <Pressable
                  style={(state) => [styles.sortOption, pressBg(c, state)]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortBy === 'duration' }}
                  onPress={() => {
                    setSortBy('duration');
                    setShowSortDropdown(false);
                  }}>
                  <View style={styles.sortOptionLabel}>
                    <Icon name="timer" size={18} color={sortBy === 'duration' ? c.accentText : c.textMuted} />
                    <Text style={[styles.sortOptionText, { color: c.text }]}>Duration</Text>
                  </View>
                  {sortBy === 'duration' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
                <View style={[styles.sortDivider, { backgroundColor: c.border }]} />
                <Text style={[styles.sortSectionTitle, { color: c.textHint }]}>Direction</Text>
                <Pressable
                  style={(state) => [styles.sortOption, pressBg(c, state)]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortDirection === 'desc' }}
                  onPress={() => {
                    setSortDirection('desc');
                    setShowSortDropdown(false);
                  }}>
                  <View style={styles.sortOptionLabel}>
                    <Icon name="sort" size={18} color={sortDirection === 'desc' ? c.accentText : c.textMuted} />
                    <Text style={[styles.sortOptionText, { color: c.text }]}>Descending</Text>
                  </View>
                  {sortDirection === 'desc' ? <Icon name="check" size={16} color={c.accentText} /> : null}
                </Pressable>
                <Pressable
                  style={(state) => [styles.sortOption, pressBg(c, state)]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortDirection === 'asc' }}
                  onPress={() => {
                    setSortDirection('asc');
                    setShowSortDropdown(false);
                  }}>
                  <View style={styles.sortOptionLabel}>
                    <Icon name="sort-asc" size={18} color={sortDirection === 'asc' ? c.accentText : c.textMuted} />
                    <Text style={[styles.sortOptionText, { color: c.text }]}>Ascending</Text>
                  </View>
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
                backgroundColor: hasActiveFilters ? c.accentBg : c.card,
                borderColor: hasActiveFilters ? c.accentBorder : c.inputBorder,
              },
            ]}
            onPress={openFilters}
            accessibilityRole="button"
            accessibilityLabel="Open history filters">
            <Icon name="filter-alt" size={20} color={hasActiveFilters ? c.accentText : c.text} />
          </PressableScale>
        </View>
      </View>

      {error ? <Text style={[styles.historyMeta, { color: c.loss }]}>{error}</Text> : null}

      {history.length > 0 && (showSearch || years.length >= 2) ? (
        <View style={[styles.quickFilters, { marginVertical: CHIP_ROW_GAP - layout.sectionGap }]}>
          {showSearch ? (
            <Motion.View entering={fadeIn} exiting={fadeOut}>
              <SearchInput
                autoFocus={searchOpen && !searchQuery}
                placeholder="Search place, date or stakes"
                accessibilityLabel="Search sessions by place, date or stakes"
                autoCorrect={false}
                autoComplete="off"
                value={searchQuery}
                onChangeText={(t) => {
                  setSearchQuery(t);
                  if (t.trim() && hasMoreHistory) void loadRemainingHistory();
                }}
              />
            </Motion.View>
          ) : null}
        {years.length >= 2 || isSearching ? (
          <View style={styles.periodBar}>
            {years.length >= 2 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.periodScroll}
                contentContainerStyle={styles.periodRow}
                accessibilityRole="radiogroup"
                accessibilityLabel="Period">
                {[null, ...years].map((y) => {
                  const on = y === null ? !hasDateFilter : selectedYear === y;
                  return (
                    <PressableScale
                      key={y ?? 'all'}
                      pressedScale={0.95}
                      onPress={() => selectPeriod(y)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      style={[
                        styles.periodChip,
                        { backgroundColor: on ? c.accentBg : c.card, borderColor: on ? c.accentBorder : c.border },
                      ]}>
                      <Text style={[styles.periodChipText, { color: on ? c.accentText : c.textSecondary }]}>
                        {y ?? 'All'}
                      </Text>
                    </PressableScale>
                  );
                })}
              </ScrollView>
                ) : (
              <View style={styles.periodScroll} />
            )}
            {isSearching ? (
              <Text
                style={[styles.resultCount, { color: c.textMuted }]}
                numberOfLines={1}
                accessibilityLiveRegion="polite"
                aria-live="polite">
                {filteredHistory.length} {filteredHistory.length === 1 ? 'result' : 'results'}
              </Text>
            ) : null}
          </View>
        ) : null}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingStack}>
          {summary}
          <HistorySkeleton />
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
            icon={searchQuery.trim() ? 'search' : 'filter-alt'}
            title={
              isSearching && hasMoreHistory
                ? 'Searching all sessions…'
                : isSearching
                  ? `No results for “${searchQuery.trim()}”${titlePeriod ? ` ${titlePeriod}` : ''}`
                  : 'No matching sessions'
            }
            message={
              isSearching
                ? hasDateFilter
                  ? 'Your search is limited to this period.'
                  : 'Search by venue, day, month, year or stakes.'
                : 'Try changing or clearing your filters.'
            }
            action={
              isSearching && hasDateFilter
                ? { label: selectedYear ? 'Search all years' : 'Search all dates', icon: 'search', onPress: () => selectPeriod(null) }
                : isSearching
                  ? { label: 'Clear search', icon: 'close', onPress: () => setSearchQuery('') }
                  : undefined
            }
            secondaryAction={
              isSearching && hasDateFilter ? { label: 'Clear search', onPress: () => setSearchQuery('') } : undefined
            }
          />
        )
      ) : (
        <View style={styles.list}>
          <Motion.FlatList
            data={sortedHistory}
            keyExtractor={(item) => item.id}
            style={styles.list}
            onScroll={(e) => {
              scrollYRef.current = e.nativeEvent.contentOffset.y;
              updateEdges();
            }}
            scrollEventThrottle={16}
            onLayout={(e) => {
              listHeightRef.current = e.nativeEvent.layout.height;
              updateEdges();
            }}
            onContentSizeChange={(_, h) => {
              contentHeightRef.current = h;
              updateEdges();
            }}
            refreshControl={
              Platform.OS === 'web' ? undefined : (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={c.textMuted}
                  colors={[c.accent]}
                  progressBackgroundColor={c.card}
                />
              )
            }
            ListHeaderComponent={
              <View style={styles.listHeader}>
                {summary}
                {statsLink}
                {chartHeader}
              </View>
            }
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
                      <View style={styles.loadMoreContent}>
                        <Icon name="expand-more" size={18} color={c.text} />
                        <Text style={[styles.loadMoreBtnLabel, { color: c.text }]}>
                          Load more ({HISTORY_TAB_PAGE_SIZE} older)
                        </Text>
                      </View>
                    )}
                  </PressableScale>
                </View>
              ) : history.length > 0 ? null : null
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
                  onOpen={openSessionSummary}
                  onRemove={isHost ? confirmDeleteSession : undefined}
                />
              );
            }}
          />
          {edges.top ? (
            <LinearGradient colors={[c.bg, `${c.bg}00`]} style={[styles.edgeFade, styles.edgeFadeTop, pointer.none]} />
          ) : null}
          {edges.bottom ? (
            <LinearGradient colors={[`${c.bg}00`, c.bg]} style={[styles.edgeFade, styles.edgeFadeBottom, pointer.none]} />
          ) : null}
        </View>
      )}

      <StatsSheet playerId={playerProfile?.id ?? null} visible={showStats} onClose={() => setShowStats(false)} />

      <HistoryFilterSheet
        visible={showFilterModal}
        draft={draftFilters}
        setDraft={setDraftFilters}
        locationSummary={
          allLocationsSelected
            ? `All locations (${locationOptions.length})`
            : draftFilters.locations?.length === 0
              ? 'No locations selected'
              : `${draftFilters.locations?.length ?? 0} of ${locationOptions.length} selected`
        }
        onOpenLocations={() => {
          setLocationSearch('');
          setShowLocationModal(true);
        }}
        matchCount={draftMatchCount}
        onReset={clearDraftFilters}
        onApply={applyFilters}
        onClose={() => setShowFilterModal(false)}
      />

      <ModalShell
        visible={showLocationModal}
        onClose={() => {
          setShowLocationModal(false);
          setLocationSearch('');
        }}
        title="Select locations"
        titleIcon={{ name: 'place', color: c.textMuted }}
        cancelLabel="Done">
        <SearchInput
          placeholder="Search locations"
          accessibilityLabel="Search locations"
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
          value={locationSearch}
          onChangeText={setLocationSearch}
        />
        <ScrollView style={styles.locationList} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
          <CheckRow
            label="All locations"
            bold
            checked={allLocationsSelected}
            onPress={() =>
              setDraftFilters((prev) => ({
                ...prev,
                locations: allLocationsSelected ? [] : null,
              }))
            }
          />
          <View style={[styles.checkDivider, { backgroundColor: c.border }]} />
          {filteredLocationOptions.map((locationName) => {
            const selected = allLocationsSelected || Boolean(draftFilters.locations?.includes(locationName));
            return (
              <CheckRow
                key={locationName}
                label={locationName}
                checked={selected}
                onPress={() =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    locations: selected
                      ? allLocationsSelected
                        ? locationOptions.filter((v) => v !== locationName)
                        : (prev.locations ?? []).filter((v) => v !== locationName)
                      : [...(prev.locations ?? []), locationName],
                  }))
                }
              />
            );
          })}
          {filteredLocationOptions.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.textHint }]}>No locations found.</Text>
          ) : null}
        </ScrollView>
      </ModalShell>
    </View>
  );
}

function CheckRow({
  label,
  checked,
  onPress,
  bold,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  bold?: boolean;
}) {
  const c = useAppColors();
  return (
    <Pressable
      style={(state) => [styles.dropdownOption, pressBg(c, state)]}
      role="checkbox"
      aria-checked={checked}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}>
      <View
        style={[
          styles.checkBox,
          checked ? { backgroundColor: c.accent, borderColor: c.accent } : { borderColor: c.inputBorder },
        ]}>
        {checked ? <Icon name="check" size={14} color={c.onAccent} weight="bold" /> : null}
      </View>
      <Text style={[styles.dropdownOptionText, bold && styles.checkLabelBold, { color: c.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

type HistoryRowProps = {
  item: HistoryEntry;
  isHost: boolean;
  isFirst: boolean;
  isLast: boolean;
  entering: ReturnType<typeof listItemEntering> | undefined;
  onOpen: (id: string) => void;
  onRemove?: (id: string) => void;
};

const HistoryRow = memo(function HistoryRow({
  item,
  isHost,
  isFirst,
  isLast,
  entering,
  onOpen: openById,
  onRemove: removeById,
}: HistoryRowProps) {
  const onOpen = () => openById(item.id);
  const onRemove = removeById ? () => removeById(item.id) : undefined;
  const c = useAppColors();
  const swipeRef = useRef<SwipeableMethods>(null);
  const removeLabel = 'Delete session';
  const blindsText = formatSessionBlindsForDisplay(
    item.smallBlind,
    item.bigBlind,
    item.amountUnit,
    item.dollarsPerChip,
  );

  const remove = () => {
    swipeRef.current?.close();
    onRemove?.();
  };
  const { isMd: isWide } = useBreakpoint();
  const profitColor = item.profit >= 0 ? c.profit : c.loss;
  const titleRow = (
    <View style={styles.historyTitleRow}>
      <SessionTitle
        date={item.date}
        location={item.location}
        textStyle={[styles.historyLabel, { color: c.text }]}
        style={styles.historyTitleShrink}
      />
    </View>
  );
  const metaLine = (
    <MetaLine
      textStyle={[styles.historyMeta, { color: c.textMuted }]}
      parts={[formatSessionTime(item.date), formatDuration(getSessionDurationMs(item)), blindsText]}
    />
  );

  return (
    <Motion.View entering={entering} exiting={fadeOut}>
      <ReanimatedSwipeable
        ref={swipeRef}
        enabled={Boolean(onRemove)}
        friction={2}
        rightThreshold={SWIPE_ACTION_WIDTH / 2}
        overshootRight={false}
        containerStyle={[
          styles.historySwipeContainer,
          isFirst && styles.historyCardFirst,
          isLast && styles.historySwipeContainerLast,
        ]}
        renderRightActions={() => (
          <Pressable
            onPress={remove}
            style={[styles.historySwipeAction, { backgroundColor: c.loss }]}
            accessibilityRole="button"
            accessibilityLabel={removeLabel}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            tabIndex={-1}>
            <Icon name="delete-outline" size={20} color="#fff" />
            <Text style={styles.historySwipeLabel}>Delete</Text>
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
          accessibilityLabel={`${formatSessionTitle(item.date, item.location)}, ${formatSessionTime(item.date)}, ${isHost ? 'host' : 'participant'}, ${item.profit >= 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(item.profit))}`}
          accessibilityHint="Opens the session summary"
          accessibilityActions={onRemove ? [{ name: 'remove', label: removeLabel }] : undefined}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'remove') onRemove?.();
          }}>
          {isWide ? (
            <View style={styles.historyWideRow}>
              <View style={styles.historyWideMain}>
                {titleRow}
                {metaLine}
              </View>
              <MoneyColumn label="Buy-in" icon="money-in" value={formatCurrency(item.totalBuyIn)} />
              <MoneyColumn label="Cash-out" icon="money-out" value={formatCurrency(item.cashOut)} />
              <Text style={[styles.historyProfit, styles.historyProfitWide, { color: profitColor }]}>
                {formatSignedCurrency(item.profit)}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.historyTop}>
                {titleRow}
                <Text style={[styles.historyProfit, { color: profitColor }]}>{formatSignedCurrency(item.profit)}</Text>
              </View>
              {metaLine}
            </>
          )}
        </PressableScale>
      </ReanimatedSwipeable>
    </Motion.View>
  );
});

function MoneyColumn({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  const c = useAppColors();
  return (
    <View style={styles.moneyCol}>
      <View style={styles.moneyLabel}>
        <Icon name={icon} size={14} color={c.textHint} />
        <Text style={[text.label, { color: c.textHint }]}>{label}</Text>
      </View>
      <Text style={[text.amount, { color: c.text }]}>{value}</Text>
    </View>
  );
}

function SummaryValueSkeleton({ valueWidth, metaWidth }: { valueWidth: number; metaWidth: number }) {
  return (
    <>
      <Skeleton width={valueWidth} height={24} style={styles.skeletonValue} />
      <Skeleton width={metaWidth} height={11} style={styles.skeletonLine} />
    </>
  );
}

const SKELETON_ROWS = [
  { date: 120, badge: 44, profit: 64, meta: '62%', detail: '54%' },
  { date: 112, badge: 80, profit: 56, meta: '48%', detail: '58%' },
  { date: 124, badge: 80, profit: 70, meta: '56%', detail: '52%' },
  { date: 116, badge: 44, profit: 60, meta: '66%', detail: '56%' },
  { date: 120, badge: 80, profit: 52, meta: '50%', detail: '54%' },
] as const;

function HistorySkeleton() {
  const c = useAppColors();
  const layout = usePageLayout();
  return (
    <SkeletonGroup label="Loading history" style={styles.list}>
      <View
        style={[styles.chartCard, { backgroundColor: c.card, borderColor: c.border, marginBottom: layout.sectionGap }]}>
        <View style={styles.skeletonChartTitleRow}>
          <Skeleton width={120} height={12} />
          <Skeleton width={104} height={34} radius={17} />
        </View>
        <Skeleton height={SKELETON_PLOT_HEIGHT} radius={8} style={styles.skeletonPlot} />
        <Skeleton width={110} height={10} style={styles.skeletonCaption} />
      </View>
      {SKELETON_ROWS.map((row, index) => (
        <View
          key={index}
          style={[
            styles.historyCard,
            index === 0 && styles.historyCardFirst,
            index === SKELETON_ROWS.length - 1 && styles.historyCardLast,
            { borderColor: c.border, backgroundColor: c.card },
          ]}>
          <View style={styles.historyTop}>
            <View style={styles.historyTitleRow}>
              <Skeleton width={row.date} height={15} />
              <Skeleton width={row.badge} height={17} radius={4} />
            </View>
            <Skeleton width={row.profit} height={15} />
          </View>
          <Skeleton width={row.meta} height={11} style={styles.skeletonLine} />
          <Skeleton width={row.detail} height={11} style={styles.skeletonLine} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

const SKELETON_PLOT_HEIGHT = 186;

const styles = StyleSheet.create({
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  skeletonValue: {
    marginVertical: 3,
  },
  skeletonLine: {
    marginVertical: 2.5,
  },
  skeletonChartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 40,
    marginBottom: 8,
  },
  skeletonPlot: {
    marginTop: 12,
  },
  skeletonCaption: {
    alignSelf: 'center',
    marginTop: 6.5,
    marginBottom: 2.5,
  },
  historySwipeContainer: {
    overflow: 'hidden',
  },
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
    ...text.label,
    color: '#fff',
    fontWeight: '600',
  },
  screen: {
    flex: 1,
    paddingTop: 48,
  },
  title: text.display,
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
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
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
  sortSectionTitle: {
    ...text.section,
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
  sortOptionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sortOptionText: {
    ...text.rowTitle,
    fontWeight: '500',
  },
  sortDivider: {
    height: 1,
    marginHorizontal: 8,
    marginVertical: 4,
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
    paddingBottom: 16,
    paddingHorizontal: 12,
  },
  listHeader: {
    gap: space.md,
    marginBottom: CHART_TO_LIST_GAP,
  },
  loadingStack: {
    flex: 1,
    gap: space.md,
  },
  statsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  statsLinkLabel: {
    ...text.rowTitle,
    flex: 1,
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
    ...text.label,
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summaryValueNarrow: {
    fontSize: 20,
    lineHeight: 26,
  },
  summaryMeta: {
    ...text.caption,
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  edgeFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 28,
  },
  edgeFadeTop: {
    top: 0,
  },
  edgeFadeBottom: {
    bottom: 0,
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
  periodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultCount: {
    ...text.caption,
    flexShrink: 0,
  },
  quickFilters: {
    gap: 10,
  },
  periodScroll: {
    flex: 1,
  },
  periodRow: {
    gap: 8,
  },
  periodChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  periodChipText: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  loadMoreContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadMoreBtnLabel: text.button,
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
  historyWideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    paddingVertical: 4,
  },
  historyWideMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  moneyLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moneyCol: {
    width: 110,
    alignItems: 'flex-end',
    gap: 2,
  },
  historyProfitWide: {
    width: 120,
    textAlign: 'right',
    fontSize: 18,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  historyTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  historyTitleShrink: {
    flexShrink: 1,
  },
  historyLabel: {
    ...text.rowTitle,
    flexShrink: 1,
  },
  historyProfit: text.amount,
  historyMeta: text.rowMeta,
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  dropdownOptionText: {
    ...text.rowTitle,
    fontWeight: '400',
    flex: 1,
  },
  checkLabelBold: {
    fontWeight: '600',
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 12,
  },
  locationList: {
    maxHeight: 320,
    marginHorizontal: -8,
  },
  emptyText: {
    ...text.caption,
    textAlign: 'center',
    paddingVertical: 14,
  },
});
