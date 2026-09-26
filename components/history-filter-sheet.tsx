import { scrim } from '@/lib/ui';
import { DateRangePicker } from '@/components/date-range-picker';
import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { countActiveFilters, type FilterState } from '@/lib/history-filters';
import { sanitizeAmountInput } from '@/lib/parse-amount';
import { SHEET_BREAKPOINT } from '@/lib/spacing';
import { useRef, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


type Props = {
  visible: boolean;
  draft: FilterState;
  setDraft: (update: (prev: FilterState) => FilterState) => void;
  locationSummary: string;
  onOpenLocations: () => void;
  /** Sessions the draft filters would show. */
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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const isSheet = width < SHEET_BREAKPOINT;
  const active = countActiveFilters(draft);
  const scrollToEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);

  const applyLabel =
    matchCount === 0 ? 'No sessions match' : `Show ${matchCount} session${matchCount === 1 ? '' : 's'}`;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={scrim(c)}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
          tabIndex={-1}
        />
        <KeyboardAvoidingView
          pointerEvents="box-none"
          style={[styles.frame, isSheet ? styles.frameSheet : styles.frameCenter]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            accessibilityViewIsModal
            style={[
              styles.card,
              isSheet ? styles.cardSheet : styles.cardCenter,
              { backgroundColor: c.card, borderColor: c.border },
            ]}>
            {isSheet ? <View style={[styles.grabber, { backgroundColor: c.border }]} /> : null}

            <View style={styles.header}>
              <View>
                <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
                  Filters
                </Text>
                <Text style={[styles.subtitle, { color: c.textMuted }]}>
                  {active === 0 ? 'Showing every session' : `${active} active`}
                </Text>
              </View>
              <PressableScale
                pressedScale={0.9}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close filters"
                style={styles.closeBtn}>
                <Icon name="close" size={20} color={c.textMuted} />
              </PressableScale>
            </View>

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

            <View
              style={[
                styles.footer,
                { borderTopColor: c.border, paddingBottom: isSheet ? Math.max(16, insets.bottom + 8) : 16 },
              ]}>
              <PressableScale
                pressedScale={0.97}
                onPress={onReset}
                disabled={active === 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: active === 0 }}
                style={[styles.resetBtn, { borderColor: c.border }, active === 0 && styles.dim]}>
                <Text style={[styles.resetText, { color: c.text }]}>Reset</Text>
              </PressableScale>
              <PressableScale
                pressedScale={0.97}
                onPress={onApply}
                accessibilityRole="button"
                style={[styles.applyBtn, { backgroundColor: c.accent }]}>
                <Text style={[styles.applyText, { color: c.onAccent }]}>{applyLabel}</Text>
              </PressableScale>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
            accessibilityRole="button"
            accessibilityLabel={`Clear ${title.toLowerCase()}`}
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
  root: { flex: 1 },
  frame: { flex: 1 },
  frameSheet: { justifyContent: 'flex-end' },
  frameCenter: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { borderWidth: 1, overflow: 'hidden' },
  cardSheet: { width: '100%', maxHeight: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomWidth: 0 },
  cardCenter: { width: '100%', maxWidth: 480, maxHeight: '90%', borderRadius: 16 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, gap: 24 },
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
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  resetBtn: { minHeight: 48, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  resetText: { fontSize: 15, fontWeight: '600' },
  applyBtn: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  applyText: { fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.45 },
});
