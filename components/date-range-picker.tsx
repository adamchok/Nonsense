import { Icon } from '@/components/icon';
import { Animated, PressableScale, fadeIn } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { DATE_PRESETS, monthGrid, parseYmd, presetRange, toYmd } from '@/lib/history-filters';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const CALENDAR_HEIGHT = 420;
const GAP = 6;

type Anchor = { x: number; y: number; width: number; height: number };

const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

function summary(start: Date | null, end: Date | null): string {
  if (start && end) return start.getTime() === end.getTime() ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end)}`;
  return 'Any date';
}

type Props = {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
};

export function DateRangePicker({ start, end, onChange }: Props) {
  const c = useAppColors();
  const today = new Date();
  const todayYmd = toYmd(today);
  const startDate = parseYmd(start);
  const endDate = parseYmd(end);
  const { height: winH } = useWindowDimensions();
  const fieldRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = anchor != null;
  const close = () => setAnchor(null);
  const toggle = () => {
    if (open) return close();
    fieldRef.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };
  const [view, setView] = useState(() => {
    const anchor = endDate ?? startDate ?? today;
    return { year: anchor.getFullYear(), month: anchor.getMonth() };
  });

  const activePreset = DATE_PRESETS.find((p) => {
    const r = presetRange(p.key, today);
    return r.start === start && r.end === end;
  })?.key;
  const hasValue = Boolean(start || end);
  const isCurrentMonth = view.year === today.getFullYear() && view.month === today.getMonth();

  function pick(ymd: string) {
    if (!start || end || ymd < start) onChange(ymd, '');
    else onChange(start, ymd);
  }

  function shiftMonth(delta: number) {
    setView(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.presets}>
        {DATE_PRESETS.map((p) => {
          const on = activePreset === p.key;
          return (
            <PressableScale
              key={p.key}
              pressedScale={0.95}
              onPress={() => {
                const r = presetRange(p.key, today);
                onChange(r.start, r.end);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[
                styles.chip,
                { backgroundColor: on ? c.accentBg : c.inputBg, borderColor: on ? c.accentBorder : c.border },
              ]}>
              <Text style={[styles.chipText, { color: on ? c.accentText : c.textMuted }]}>{p.label}</Text>
            </PressableScale>
          );
        })}
      </View>

      <View
        ref={fieldRef}
        collapsable={false}
        {...({ dataSet: { hoverField: 'true' } } as object)}
        style={[styles.field, { backgroundColor: c.inputBg, borderColor: open ? c.accentBorder : c.border }]}>
        <PressableScale
          pressedScale={0.99}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={`Dates: ${summary(startDate, endDate)}`}
          accessibilityHint={open ? 'Hides the calendar' : 'Shows a calendar to pick a custom range'}
          accessibilityState={{ expanded: open }}
          style={styles.fieldBtn}>
          <Icon name="calendar" size={18} color={c.textMuted} />
          <Text style={[styles.fieldText, { color: hasValue ? c.text : c.placeholder }]} numberOfLines={1}>
            {summary(startDate, endDate)}
          </Text>
          {hasValue ? null : <Icon name={open ? 'expand-less' : 'expand-more'} size={18} color={c.textMuted} />}
        </PressableScale>
        {hasValue ? (
          <PressableScale
            pressedScale={0.9}
            onPress={() => onChange('', '')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Clear dates"
            {...({ dataSet: { hoverDot: 'true' } } as object)}
            style={styles.clearBtn}>
            <View style={styles.clearDot}>
              <Icon name="close" size={16} color={c.textMuted} />
            </View>
          </PressableScale>
        ) : null}
      </View>

      <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close calendar" />
        {anchor ? (
          <Animated.View
            entering={fadeIn}
            style={[
              styles.calendar,
              { backgroundColor: c.card, borderColor: c.border, left: anchor.x, width: anchor.width },
              anchor.y + anchor.height + GAP + CALENDAR_HEIGHT > winH
                ? { bottom: winH - anchor.y + GAP }
                : { top: anchor.y + anchor.height + GAP },
            ]}>
            <View style={styles.monthRow}>
              <PressableScale
                pressedScale={0.9}
                onPress={() => shiftMonth(-1)}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={styles.navBtn}>
                <Icon name="chevron-left" size={18} color={c.text} />
              </PressableScale>
              <Text style={[styles.monthLabel, { color: c.text }]} accessibilityRole="header">
                {MONTHS_LONG[view.month]} {view.year}
              </Text>
              <PressableScale
                pressedScale={0.9}
                onPress={() => shiftMonth(1)}
                disabled={isCurrentMonth}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                accessibilityState={{ disabled: isCurrentMonth }}
                style={[styles.navBtn, isCurrentMonth && styles.disabled]}>
                <Icon name="chevron-right" size={18} color={c.text} />
              </PressableScale>
            </View>

            <View style={styles.grid} importantForAccessibility="no-hide-descendants">
              {WEEKDAYS.map((w, i) => (
                <Text key={i} style={[styles.weekday, { color: c.textHint }]}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {monthGrid(view.year, view.month).map((d, i) => {
                if (!d) return <View key={i} style={styles.cell} />;
                const ymd = toYmd(d);
                const isStart = ymd === start;
                const isEnd = ymd === end;
                const isEdge = isStart || isEnd;
                const inRange = Boolean(start && end && ymd > start && ymd < end);
                const isFuture = ymd > todayYmd;
                const bandLeft = inRange || (isEnd && Boolean(start) && start !== end);
                const bandRight = inRange || (isStart && Boolean(end) && start !== end);
                return (
                  <View key={i} style={styles.cell}>
                    {bandLeft ? <View style={[styles.band, styles.bandLeft, { backgroundColor: c.accentBg }]} /> : null}
                    {bandRight ? (
                      <View style={[styles.band, styles.bandRight, { backgroundColor: c.accentBg }]} />
                    ) : null}
                    <PressableScale
                      pressedScale={0.9}
                      onPress={() => pick(ymd)}
                      disabled={isFuture}
                      accessibilityRole="button"
                      accessibilityLabel={`${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`}
                      accessibilityState={{ selected: isEdge || inRange, disabled: isFuture }}
                      style={[
                        styles.day,
                        isEdge && { backgroundColor: c.accent },
                        !isEdge && ymd === todayYmd && { borderWidth: 1, borderColor: c.textMuted },
                      ]}>
                      <Text
                        style={[
                          styles.dayText,
                          { color: isEdge ? c.onAccent : isFuture ? c.textHint : c.text },
                          isEdge && styles.dayTextEdge,
                          isFuture && styles.disabled,
                        ]}>
                        {d.getDate()}
                      </Text>
                    </PressableScale>
                  </View>
                );
              })}
            </View>

            <View style={styles.hintRow}>
              <Icon name="tap" size={14} color={c.textMuted} />
              <Text style={[styles.hint, { color: c.textMuted }]}>
                {start && !end
                  ? 'Now tap an end date'
                  : start
                    ? 'Tap any day to start a new range'
                    : 'Tap a start date'}
              </Text>
            </View>
          </Animated.View>
        ) : null}
      </Modal>
    </View>
  );
}

const CELL = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    paddingRight: 2,
  },
  fieldBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 8,
    minHeight: 46,
  },
  fieldText: { flex: 1, fontSize: 15, fontVariant: ['tabular-nums'] },
  clearBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  clearDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  calendar: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.24)',
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  monthLabel: { fontSize: 15, fontWeight: '600' },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: CELL, textAlign: 'center', fontSize: 12, fontWeight: '600', paddingVertical: 4 },
  cell: { width: CELL, height: 44, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', top: 2, bottom: 2 },
  bandLeft: { left: 0, right: '50%' },
  bandRight: { left: '50%', right: 0 },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14, fontVariant: ['tabular-nums'] },
  dayTextEdge: { fontWeight: '700' },
  disabled: { opacity: 0.4 },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 6,
  },
  hint: { fontSize: 12 },
});
