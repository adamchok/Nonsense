import { ModalBackdrop } from '@/components/modal-backdrop';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors } from '@/lib/app-theme';
import { pressBg, text } from '@/lib/ui';
import { useAuth } from '@/lib/auth-context';
import {
  formatCurrency,
  formatSessionBlindsForDisplay,
  formatSignedCurrency,
  formatTightCompactNumber,
} from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { appAlert } from '@/lib/app-alert';
import { deleteSession, getSessionHistoryPage, HISTORY_TAB_PAGE_SIZE } from '@/lib/firestore';
import type { SessionRecord } from '@/types';
import { Icon } from '@/components/icon';
import { useFocusEffect, useRouter } from 'expo-router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { userMessage } from '@/lib/user-message';
import { EmptyState } from '@/components/empty-state';
import { PLChart } from '@/components/pl-chart';
import { Skeleton, SkeletonGroup } from '@/components/skeleton';
import { HistoryFilterSheet } from '@/components/history-filter-sheet';
import { DEFAULT_FILTERS, countActiveFilters, filterEntries, type FilterState } from '@/lib/history-filters';
import { Animated as Motion, PressableScale, layoutTransition, fadeOut, listItemEntering, webSafe } from '@/components/motion';
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

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function mergeHistoryPages(prev: HistoryEntry[], next: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();
  for (const e of prev) byId.set(e.id, e);
  for (const e of next) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
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
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('datetime');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSpin] = useState(() => new Animated.Value(0));
  const shownRowIdsRef = useRef(new Set<string>());
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

  const filteredHistory = useMemo(() => filterEntries(history, filters), [filters, history]);
  const draftMatchCount = useMemo(
    () => (showFilterModal ? filterEntries(history, draftFilters).length : 0),
    [showFilterModal, history, draftFilters]
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

  const totalProfit = filteredHistory.reduce((s, h) => s + h.profit, 0);
  const totalDurationMs = filteredHistory.reduce((sum, h) => sum + getSessionDurationMs(h), 0);
  const totalHoursPlayed = totalDurationMs / 3_600_000;
  const hasActiveFilters = countActiveFilters(filters) > 0;
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
  }

  function clearDraftFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setShowLocationModal(false);
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

  const openSessionSummary = useCallback(
    (sessionId: string) => router.push(`../session/summary/${sessionId}`),
    [router]
  );

  const chartHeader = useMemo(
    () =>
      filteredHistory.length >= 2 ? (
        <View
          style={[
            styles.chartCard,
            { backgroundColor: c.card, borderColor: c.border, marginBottom: layout.sectionGap },
          ]}>
          <PLChart entries={filteredHistory} onOpen={openSessionSummary} />
        </View>
      ) : null,
    [filteredHistory, c.card, c.border, layout.sectionGap, openSessionSummary]
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
        layout.compactTop,
      ]}>
      {showSortDropdown ? (
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
          {loading ? (
            <SummaryValueSkeleton valueWidth={96} metaWidth={70} />
          ) : (
            <>
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
            </>
          )}
        </View>
        <View
          style={[
            styles.summaryCard,
            styles.summaryCardHalf,
            { backgroundColor: c.card, borderColor: c.border },
          ]}>
          <Text style={[styles.summaryLabel, { color: c.textMuted }]}>Total Played</Text>
          {loading ? (
            <SummaryValueSkeleton valueWidth={64} metaWidth={110} />
          ) : (
            <>
              <Text style={[styles.summaryValue, { color: c.text }]}>
                {totalHoursPlayed.toFixed(1)}h
              </Text>
              <Text style={[styles.summaryMeta, { color: c.textHint }]}>
                {hasMoreHistory ? 'Among loaded sessions' : 'Across all sessions'}
              </Text>
            </>
          )}
        </View>
      </View>

      {error ? <Text style={[styles.historyMeta, { color: c.loss }]}>{error}</Text> : null}

      {loading ? (
        <HistorySkeleton />
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
          ListHeaderComponent={chartHeader}
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
                onRemove={isHost ? () => confirmDeleteSession(item.id) : undefined}
              />
            );
          }}
        />
      )}

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

      <Modal
        visible={showLocationModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowLocationModal(false)}>
        <View style={styles.modalRoot}>
          <ModalBackdrop
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
  onRemove?: () => void;
};

function HistoryRow({ item, isHost, isFirst, isLast, entering, onOpen, onRemove }: HistoryRowProps) {
  const c = useAppColors();
  const swipeRef = useRef<SwipeableMethods>(null);
  const removeLabel = 'Delete session';
  const blindsText = formatSessionBlindsForDisplay(item.smallBlind, item.bigBlind, item.amountUnit, item.dollarsPerChip);

  const remove = () => {
    swipeRef.current?.close();
    onRemove?.();
  };

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
          accessibilityLabel={`${formatDateTimeDMY(item.date)}, ${isHost ? 'host' : 'participant'}, ${item.profit >= 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(item.profit))}, ${item.location ? item.location : 'no location'}`}
          accessibilityHint="Opens the session summary"
          accessibilityActions={onRemove ? [{ name: 'remove', label: removeLabel }] : undefined}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'remove') onRemove?.();
          }}>
          <View style={styles.historyTop}>
            <View style={styles.historyTitleRow}>
              <Text style={[styles.historyLabel, { color: c.text }]}>{formatDateTimeDMY(item.date)}</Text>
              {isHost ? (
                <View style={[styles.roleBadge, { backgroundColor: c.badge.host }]}>
                  <Text style={styles.roleBadgeText}>HOST</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.historyTopRight}>
              <Text style={[styles.historyProfit, { color: item.profit >= 0 ? c.profit : c.loss }]}>
                {formatSignedCurrency(item.profit)}
              </Text>
              {onRemove ? (
                <PressableScale
                  onPress={onRemove}
                  hitSlop={8}
                  pressedScale={0.9}
                  style={styles.historyMoreBtn}
                  accessibilityRole="button"
                  accessibilityLabel={removeLabel}>
                  <Icon name="delete-outline" size={18} color={c.textMuted} />
                </PressableScale>
              ) : null}
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
        style={[
          styles.chartCard,
          { backgroundColor: c.card, borderColor: c.border, marginBottom: layout.sectionGap },
        ]}>
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
            <View style={styles.historyTopRight}>
              <Skeleton width={row.profit} height={15} />
              <View style={styles.historyMoreBtn}>
                <Icon name="delete-outline" size={18} color={c.textMuted} />
              </View>
            </View>
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
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  screen: {
    flex: 1,
    paddingTop: 48,
  },
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
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterTitle: text.modalTitle,
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
});
