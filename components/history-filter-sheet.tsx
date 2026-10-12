import { ModalShell } from '@/components/session/modal-shell';
import { DateRangePicker } from '@/components/date-range-picker';
import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { countActiveFilters, type FilterState } from '@/lib/history-filters';
import { sanitizeAmountInput } from '@/lib/parse-amount';
import { useRef, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  draft: FilterState;
  setDraft: (update: (prev: FilterState) => FilterState) => void;
  locationSummary: string;
  onOpenLocations: () => void;
  matchCount: number;
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
};

export function HistoryFilterSheet({
  visible,
  draft,
  setDraft,
  locationSummary,
  onOpenLocations,
  matchCount,
  onReset,
  onApply,
  onClose,
}: Props) {
  const c = useAppColors();
  const scrollRef = useRef<ScrollView>(null);
  const active = countActiveFilters(draft);
  const scrollToEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);

  const applyLabel = matchCount === 0 ? 'No matches' : `Show ${matchCount}`;

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title="Filters"
      titleIcon={{ name: 'filter-alt', color: c.textMuted }}
      secondary={{ label: 'Reset', icon: 'replay', onPress: onReset, disabled: active === 0 }}
      primary={{ label: applyLabel, onPress: onApply, icon: 'check' }}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled">
        <Section
          icon="location-on"
          title="Location"
          onClear={draft.locations !== null ? () => setDraft((p) => ({ ...p, locations: null })) : undefined}>
          <PressableScale
            pressedScale={0.99}
            onPress={onOpenLocations}
            accessibilityRole="button"
            accessibilityLabel={`Locations: ${locationSummary}`}
            style={[styles.trigger, { backgroundColor: c.inputBg, borderColor: c.border }]}>
            <Text style={[styles.triggerText, { color: c.text }]} numberOfLines={1}>
              {locationSummary}
            </Text>
            <Icon name="chevron-right" size={18} color={c.textMuted} />
          </PressableScale>
        </Section>

        <Section
          icon="calendar"
          title="Dates"
          onClear={
            draft.startDate || draft.endDate
              ? () => setDraft((p) => ({ ...p, startDate: '', endDate: '' }))
              : undefined
          }>
          <DateRangePicker
            start={draft.startDate}
            end={draft.endDate}
            onChange={(startDate, endDate) => setDraft((p) => ({ ...p, startDate, endDate }))}
          />
        </Section>

        <Section
          icon="attach-money"
          title="Buy-in"
          onClear={
            draft.buyInMin || draft.buyInMax
              ? () => setDraft((p) => ({ ...p, buyInMin: '', buyInMax: '' }))
              : undefined
          }>
          <AmountRange
            label="buy-in"
            min={draft.buyInMin}
            max={draft.buyInMax}
            onMin={(v) => setDraft((p) => ({ ...p, buyInMin: sanitizeAmountInput(v) }))}
            onMax={(v) => setDraft((p) => ({ ...p, buyInMax: sanitizeAmountInput(v) }))}
            onFocus={scrollToEnd}
          />
        </Section>

        <Section
          icon="trend-up"
          title="Profit / loss"
          hint="Use a minus for losses, e.g. -50"
          onClear={
            draft.profitMin || draft.profitMax
              ? () => setDraft((p) => ({ ...p, profitMin: '', profitMax: '' }))
              : undefined
          }>
          <AmountRange
            label="profit"
            min={draft.profitMin}
            max={draft.profitMax}
            onMin={(v) => setDraft((p) => ({ ...p, profitMin: sanitizeAmountInput(v, { allowNegative: true }) }))}
            onMax={(v) => setDraft((p) => ({ ...p, profitMax: sanitizeAmountInput(v, { allowNegative: true }) }))}
            onFocus={scrollToEnd}
          />
        </Section>
      </ScrollView>
    </ModalShell>
  );
}

function Section({
  icon,
  title,
  hint,
  onClear,
  children,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  onClear?: () => void;
  children: ReactNode;
}) {
  const c = useAppColors();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Icon name={icon} size={16} color={c.textMuted} />
        <Text style={[styles.sectionTitle, { color: c.text }]} accessibilityRole="header">
          {title}
        </Text>
        {onClear ? (
          <PressableScale
            pressedScale={0.95}
            onPress={onClear}
            accessibilityRole="link"
            accessibilityLabel={`Clear ${title.toLowerCase()}`}
            {...({ dataSet: { textButton: 'true' } } as object)}
            style={styles.clearLink}>
            <Text style={[styles.clearText, { color: c.accentText }]}>Clear</Text>
          </PressableScale>
        ) : null}
      </View>
      {children}
      {hint ? <Text style={[styles.hint, { color: c.textHint }]}>{hint}</Text> : null}
    </View>
  );
}

function AmountRange({
  label,
  min,
  max,
  onMin,
  onMax,
  onFocus,
}: {
  label: string;
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  onFocus: () => void;
}) {
  const c = useAppColors();
  const field = (value: string, onChange: (v: string) => void, which: 'Min' | 'Max') => (
    <View style={[styles.amount, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
      <Text style={[styles.currency, { color: c.textMuted }]}>$</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        placeholder={which}
        placeholderTextColor={c.placeholder}
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
        accessibilityLabel={`${which === 'Min' ? 'Minimum' : 'Maximum'} ${label}`}
        style={[styles.amountInput, { color: c.text }]}
      />
    </View>
  );
  return (
    <View style={styles.rangeRow}>
      {field(min, onMin, 'Min')}
      <Text style={[styles.rangeSep, { color: c.textMuted }]}>to</Text>
      {field(max, onMax, 'Max')}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingBottom: 4, gap: 24 },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  clearLink: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: -8 },
  clearText: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  triggerText: { flex: 1, fontSize: 15, fontWeight: '500' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rangeSep: { fontSize: 13 },
  amount: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  currency: { fontSize: 15 },
  amountInput: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 12, fontVariant: ['tabular-nums'] },
});
