import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  formatBlinds,
  formatCurrency,
  formatSignedCurrency,
  formatTightCompactNumber,
} from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { getSessionHistoryPage, HISTORY_TAB_PAGE_SIZE } from '@/lib/firestore';
import type { SessionRecord } from '@/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
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

  const loadHistory = useCallback(async () => {
    if (!playerProfile) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      historyPageCursorRef.current = null;
      const page = await getSessionHistoryPage(
        playerProfile.id,
        HISTORY_TAB_PAGE_SIZE,
        null
      );
      setHistory(page.entries);
      historyPageCursorRef.current = page.lastDoc;
      setHasMoreHistory(page.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [playerProfile]);

  const loadMoreHistory = useCallback(async () => {
    if (!playerProfile || loadingMore || !hasMoreHistory) return;
    const cursor = historyPageCursorRef.current;
    if (!cursor) return;
    try {
      setLoadingMore(true);
      setError(null);
      const page = await getSessionHistoryPage(
        playerProfile.id,
        HISTORY_TAB_PAGE_SIZE,
        cursor
      );
      setHistory((prev) => mergeHistoryPages(prev, page.entries));
      historyPageCursorRef.current = page.lastDoc;
      setHasMoreHistory(page.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more history.');
    } finally {
      setLoadingMore(false);
    }
  }, [playerProfile, loadingMore, hasMoreHistory]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadHistory();
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

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: c.text }]}>My Winnings</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={[
              styles.filterButton,
              { backgroundColor: c.cardAlt, borderColor: c.border },
              refreshing && styles.refreshDisabled,
            ]}
            onPress={() => void handleRefresh()}
            accessibilityRole="button"
            accessibilityLabel="Refresh history">
            <Animated.View style={{ transform: [{ rotate: refreshRotate }] }}>
              <MaterialIcons name="refresh" size={20} color={c.textMuted} />
            </Animated.View>
          </Pressable>
          <View style={styles.sortWrap}>
            <Pressable
              style={[styles.filterButton, { backgroundColor: c.cardAlt, borderColor: c.border }]}
              onPress={() => setShowSortDropdown((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel="Open sort options">
              <MaterialIcons name="sort" size={20} color={c.textMuted} />
            </Pressable>
            {showSortDropdown ? (
              <View style={[styles.sortDropdown, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.sortSectionTitle, { color: c.textHint }]}>Sort by</Text>
                <Pressable
                  style={[styles.sortOption, sortBy === 'datetime' && { backgroundColor: c.accentBg }]}
                  onPress={() => {
                    setSortBy('datetime');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Date & time</Text>
                  {sortBy === 'datetime' ? <MaterialIcons name="check" size={16} color={c.accent} /> : null}
                </Pressable>
                <Pressable
                  style={[styles.sortOption, sortBy === 'buyIn' && { backgroundColor: c.accentBg }]}
                  onPress={() => {
                    setSortBy('buyIn');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Buy-in</Text>
                  {sortBy === 'buyIn' ? <MaterialIcons name="check" size={16} color={c.accent} /> : null}
                </Pressable>
                <Pressable
                  style={[styles.sortOption, sortBy === 'profit' && { backgroundColor: c.accentBg }]}
                  onPress={() => {
                    setSortBy('profit');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Profit</Text>
                  {sortBy === 'profit' ? <MaterialIcons name="check" size={16} color={c.accent} /> : null}
                </Pressable>
                <Pressable
                  style={[styles.sortOption, sortBy === 'duration' && { backgroundColor: c.accentBg }]}
                  onPress={() => {
                    setSortBy('duration');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Duration</Text>
                  {sortBy === 'duration' ? <MaterialIcons name="check" size={16} color={c.accent} /> : null}
                </Pressable>
                <View style={[styles.sortDivider, { backgroundColor: c.border }]} />
                <Text style={[styles.sortSectionTitle, { color: c.textHint }]}>Direction</Text>
                <Pressable
                  style={[styles.sortOption, sortDirection === 'desc' && { backgroundColor: c.accentBg }]}
                  onPress={() => {
                    setSortDirection('desc');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Descending</Text>
                  {sortDirection === 'desc' ? <MaterialIcons name="check" size={16} color={c.accent} /> : null}
                </Pressable>
                <Pressable
                  style={[styles.sortOption, sortDirection === 'asc' && { backgroundColor: c.accentBg }]}
                  onPress={() => {
                    setSortDirection('asc');
                    setShowSortDropdown(false);
                  }}>
                  <Text style={[styles.sortOptionText, { color: c.text }]}>Ascending</Text>
                  {sortDirection === 'asc' ? <MaterialIcons name="check" size={16} color={c.accent} /> : null}
                </Pressable>
              </View>
            ) : null}
          </View>
          <Pressable
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
            <MaterialIcons
              name="filter-alt"
              size={20}
              color={hasActiveFilters ? c.accent : c.textMuted}
            />
          </Pressable>
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

      {error ? <Text style={{ color: c.loss }}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={c.textMuted} />
        </View>
      ) : filteredHistory.length === 0 ? (
        <Text style={{ color: c.textMuted }}>
          {history.length === 0
            ? 'No completed sessions yet. Finish a game to see your history.'
            : 'No sessions match your current filters.'}
        </Text>
      ) : (
        <FlatList
          data={sortedHistory}
          keyExtractor={(item) => item.id}
          style={styles.list}
          ListFooterComponent={
            hasMoreHistory ? (
              <View style={styles.historyPaginationFooter}>
                <Pressable
                  style={[
                    styles.loadMoreBtn,
                    { backgroundColor: c.cardAlt, borderColor: c.border },
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
                </Pressable>
              </View>
            ) : history.length > 0 ? (
              null
            ) : null
          }
          renderItem={({ item }) => {
            const isHost = Boolean(playerProfile && item.hostId === playerProfile.id);
            const blindsText = formatBlinds(item.smallBlind, item.bigBlind);
            return (
              <Pressable
                style={[
                  styles.historyCard,
                  { backgroundColor: c.card, borderColor: c.border },
                ]}
                onPress={() => router.push(`../session/summary/${item.id}`)}>
                <View style={styles.historyTop}>
                  <View style={styles.historyTitleRow}>
                    <Text style={[styles.historyLabel, { color: c.text }]}>
                      {formatDateTimeDMY(item.date)}
                    </Text>
                    <View
                      style={[
                        styles.roleBadge,
                        { backgroundColor: isHost ? c.badge.host : c.badge.you },
                      ]}>
                      <Text style={styles.roleBadgeText}>
                        {isHost ? 'HOST' : 'PARTICIPANT'}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.historyProfit,
                      { color: item.profit >= 0 ? c.profit : c.loss },
                    ]}>
                    {formatSignedCurrency(item.profit)}
                  </Text>
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
              </Pressable>
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
                <Pressable onPress={() => setShowFilterModal(false)} hitSlop={10}>
                  <MaterialIcons name="close" size={20} color={c.textHint} />
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
                    <MaterialIcons name="chevron-right" size={20} color={c.textHint} />
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
                            onPress={(event) => {
                              event.stopPropagation();
                              setDraftFilters((prev) => ({ ...prev, startDate: '' }));
                              if (datePickerTarget === 'start') setDatePickerTarget(null);
                            }}
                            hitSlop={6}>
                            <MaterialIcons name="close" size={14} color={c.textHint} />
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
                            onPress={(event) => {
                              event.stopPropagation();
                              setDraftFilters((prev) => ({ ...prev, endDate: '' }));
                              if (datePickerTarget === 'end') setDatePickerTarget(null);
                            }}
                            hitSlop={6}>
                            <MaterialIcons name="close" size={14} color={c.textHint} />
                          </Pressable>
                        ) : null}
                      </View>
                    </Pressable>
                  </View>
                  {datePickerTarget ? (
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
                            <Text style={styles.inlineActionTextPrimary}>Done</Text>
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
                        { backgroundColor: c.inputBg, borderColor: c.border, color: c.text },
                      ]}
                      placeholder="Min"
                      placeholderTextColor={c.placeholder}
                      value={draftFilters.buyInMin}
                      onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, buyInMin: value }))}
                      keyboardType="decimal-pad"
                      onFocus={() => setTimeout(() => filterScrollRef.current?.scrollToEnd({ animated: true }), 150)}
                    />
                    <Text style={[styles.dashText, { color: c.textMuted }]}>–</Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: c.inputBg, borderColor: c.border, color: c.text },
                      ]}
                      placeholder="Max"
                      placeholderTextColor={c.placeholder}
                      value={draftFilters.buyInMax}
                      onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, buyInMax: value }))}
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
                        { backgroundColor: c.inputBg, borderColor: c.border, color: c.text },
                      ]}
                      placeholder="Min"
                      placeholderTextColor={c.placeholder}
                      value={draftFilters.profitMin}
                      onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, profitMin: value }))}
                      keyboardType="decimal-pad"
                      onFocus={() => setTimeout(() => filterScrollRef.current?.scrollToEnd({ animated: true }), 150)}
                    />
                    <Text style={[styles.dashText, { color: c.textMuted }]}>–</Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: c.inputBg, borderColor: c.border, color: c.text },
                      ]}
                      placeholder="Max"
                      placeholderTextColor={c.placeholder}
                      value={draftFilters.profitMax}
                      onChangeText={(value) => setDraftFilters((prev) => ({ ...prev, profitMax: value }))}
                      keyboardType="decimal-pad"
                      onFocus={() => setTimeout(() => filterScrollRef.current?.scrollToEnd({ animated: true }), 150)}
                    />
                  </View>
                </View>
              </ScrollView>

              <View style={styles.filterActions}>
                <Pressable
                  style={[styles.actionBtnSecondary, { borderColor: c.border }]}
                  onPress={clearDraftFilters}>
                  <Text style={[styles.actionBtnSecondaryLabel, { color: c.text }]}>Reset</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtnPrimary, { backgroundColor: c.accent }]}
                  onPress={applyFilters}>
                  <Text style={styles.actionBtnPrimaryLabel}>
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
                  hitSlop={10}>
                  <MaterialIcons name="close" size={20} color={c.textHint} />
                </Pressable>
              </View>
              <TextInput
                style={[
                  styles.input,
                  styles.locationSearchInput,
                  { backgroundColor: c.inputBg, borderColor: c.border, color: c.text },
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
                  <MaterialIcons
                    name={allLocationsSelected ? 'check-box' : 'check-box-outline-blank'}
                    size={18}
                    color={allLocationsSelected ? c.accent : c.textHint}
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
                      <MaterialIcons
                        name={selected ? 'check-box' : 'check-box-outline-blank'}
                        size={18}
                        color={selected ? c.accent : c.textHint}
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
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortWrap: {
    position: 'relative',
    zIndex: 40,
  },
  sortDropdown: {
    position: 'absolute',
    top: 42,
    right: 0,
    borderWidth: 1,
    borderRadius: 12,
    minWidth: 190,
    paddingVertical: 8,
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
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 4,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    marginHorizontal: 6,
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
  historyPaginationFooter: {
    paddingVertical: 16,
    paddingHorizontal: 4,
    gap: 10,
    alignItems: 'center',
  },
  loadMoreBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreBtnDisabled: {
    opacity: 0.7,
  },
  loadMoreBtnLabel: {
    fontSize: 14,
    fontWeight: '700',
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
    gap: 8,
  },
  historyTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  historyLabel: {
    fontWeight: '600',
    flexShrink: 1,
  },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
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
  modalRoot: {
    flex: 1,
  },
  modalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  filterCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  filterBody: {
    gap: 14,
  },
  filterSection: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownTriggerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dropdownOptionText: {
    fontSize: 14,
  },
  locationCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '70%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
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
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  dateButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
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
    fontSize: 14,
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
    borderRadius: 12,
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
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inlineActionTextPrimary: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  actionBtnSecondaryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtnPrimary: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  actionBtnPrimaryLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
