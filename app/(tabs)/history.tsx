import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  formatCurrency,
  formatSignedCurrency,
  formatTightCompactNumber,
} from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { getSessionHistoryForPlayer } from '@/lib/firestore';
import type { SessionRecord } from '@/types';

type HistoryEntry = SessionRecord & { totalBuyIn: number; cashOut: number; profit: number };
type FilterState = {
  location: string | null;
  startDate: string;
  endDate: string;
  buyInMin: string;
  buyInMax: string;
  profitMin: string;
  profitMax: string;
};

const DEFAULT_FILTERS: FilterState = {
  location: null,
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

function hasAnyFilterValue(filter: FilterState): boolean {
  return (
    filter.location !== null ||
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
  const [error, setError] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end' | null>(null);
  const filterScrollRef = useRef<ScrollView>(null);

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

  const locationOptions = useMemo(() => {
    const names = history
      .map((item) => item.location?.trim())
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b));
    return [...new Set(names)];
  }, [history]);

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
      if (filters.location !== null) {
        const location = entry.location?.trim() ?? '';
        if (location !== filters.location) return false;
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

  const totalProfit = filteredHistory.reduce((s, h) => s + h.profit, 0);
  const totalDurationMs = filteredHistory.reduce((sum, h) => sum + getSessionDurationMs(h), 0);
  const totalHoursPlayed = totalDurationMs / 3_600_000;
  const hasActiveFilters = hasAnyFilterValue(filters);
  const hasDraftFilters = hasAnyFilterValue(draftFilters);

  function openFilters() {
    setDraftFilters(filters);
    setShowFilterModal(true);
  }

  function applyFilters() {
    setFilters(draftFilters);
    setShowFilterModal(false);
    setDatePickerTarget(null);
  }

  function clearDraftFilters() {
    setDraftFilters(DEFAULT_FILTERS);
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

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: c.text }]}>My Winnings</Text>
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
            name="filter-list"
            size={20}
            color={hasActiveFilters ? c.accent : c.textMuted}
          />
        </Pressable>
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
          <Text style={[styles.summaryMeta, { color: c.textHint }]}>Across all sessions</Text>
        </View>
      </View>

      {error ? <Text style={{ color: c.loss }}>{error}</Text> : null}

      {loading ? (
        <Text style={{ color: c.textMuted }}>Loading...</Text>
      ) : filteredHistory.length === 0 ? (
        <Text style={{ color: c.textMuted }}>
          {history.length === 0
            ? 'No completed sessions yet. Finish a game to see your history.'
            : 'No sessions match your current filters.'}
        </Text>
      ) : (
        <FlatList
          data={filteredHistory}
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
                  {formatDateTimeDMY(item.date)}
                </Text>
                <Text
                  style={[
                    styles.historyProfit,
                    { color: item.profit >= 0 ? c.profit : c.loss },
                  ]}>
                  {formatSignedCurrency(item.profit)}
                </Text>
              </View>
              <Text style={[styles.historyMeta, { color: c.textMuted }]}>
                {item.location ? item.location : 'No location'} • {formatDuration(getSessionDurationMs(item))}
              </Text>
              <Text style={[styles.historyDetail, { color: c.textHint }]}>
                Buy-in: {formatCurrency(item.totalBuyIn)}  Cash-out: {formatCurrency(item.cashOut)}
              </Text>
            </Pressable>
          )}
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
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : -60}
          >
            <View style={[styles.filterCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.filterHeaderRow}>
                <Text style={[styles.filterTitle, { color: c.text }]}>Filter History</Text>
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
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                    <Pressable
                      style={[
                        styles.chip,
                        {
                          backgroundColor: draftFilters.location === null ? c.accentBg : c.chipBg,
                          borderColor: draftFilters.location === null ? c.accentBorder : c.chipBorder,
                        },
                      ]}
                      onPress={() => setDraftFilters((prev) => ({ ...prev, location: null }))}>
                      <Text
                        style={[
                          styles.chipText,
                          { color: draftFilters.location === null ? c.accent : c.chipText },
                        ]}>
                        All
                      </Text>
                    </Pressable>
                    {locationOptions.map((locationName) => {
                      const selected = draftFilters.location === locationName;
                      return (
                        <Pressable
                          key={locationName}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: selected ? c.accentBg : c.chipBg,
                              borderColor: selected ? c.accentBorder : c.chipBorder,
                            },
                          ]}
                          onPress={() =>
                            setDraftFilters((prev) => ({
                              ...prev,
                              location: selected ? null : locationName,
                            }))
                          }>
                          <Text style={[styles.chipText, { color: selected ? c.accent : c.chipText }]}>
                            {locationName}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
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
                      <Text
                        style={[
                          styles.dateButtonText,
                          { color: draftFilters.startDate ? c.text : c.placeholder },
                        ]}>
                        {draftFilters.startDate || 'Start date'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.dateButton,
                        { backgroundColor: c.inputBg, borderColor: c.border },
                        datePickerTarget === 'end' && { borderColor: c.accentBorder },
                      ]}
                      onPress={() => setDatePickerTarget('end')}>
                      <Text
                        style={[
                          styles.dateButtonText,
                          { color: draftFilters.endDate ? c.text : c.placeholder },
                        ]}>
                        {draftFilters.endDate || 'End date'}
                      </Text>
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
  filterButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 10,
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
  dateButtonText: {
    fontSize: 14,
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
