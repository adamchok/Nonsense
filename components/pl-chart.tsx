import { pointer } from '@/lib/ui';
import { Icon, type IconName } from '@/components/icon';
import { MetaLine } from '@/components/meta-line';
import { PressableScale } from '@/components/motion';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { formatSignedCurrency, formatTightCompactNumber } from '@/lib/currency-format';
import { formatDateDMY } from '@/lib/date-format';
import * as Haptics from 'expo-haptics';
import { memo, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { LinearGradient, Stop } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';

const CHART_HEIGHT = 160;
const Y_LABEL_WIDTH = 46;
const SECTIONS = 4;
const HEADER_HEIGHT = 48;
const MAX_BAR_WIDTH = 22;
const MARKER_SIZE = 14;
const COMPACT_CHART_WIDTH = 420;
const DOT_SIZE = 6;
const LINE_INITIAL_SPACING = 6;
const PLOT_TOP_PAD = 10;
const SCRUB_ACTIVATE_X = 8;
const SCRUB_FAIL_Y = 12;

type Mode = 'line' | 'bars';
type Entry = { id: string; date: Date; profit: number };
type Point = { value: number; date: Date; delta: number; id: string };

const AXIS_LABEL_WIDTH = 64;
const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const YEAR_MS = 365 * 86_400_000;

function axisIndexes(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 2) return [...Array(count).keys()];
  return [0, Math.round((count - 1) / 2), count - 1];
}
type Axis = { step: number; above: number; below: number };

type WebKeyEvent = {
  key: string;
  preventDefault: () => void;
  currentTarget: unknown;
};

type FocusableParent = {
  parentElement?: { querySelectorAll: (selector: string) => ArrayLike<{ focus: () => void }> } | null;
};

const IS_WEB = Platform.OS === 'web';
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

function focusRadioAt(target: unknown, index: number): void {
  const radios = (target as FocusableParent).parentElement?.querySelectorAll('[role="radio"]');
  radios?.[index]?.focus();
}

function nextIndexForKey(key: string, active: number, count: number): number | undefined {
  if (count === 0) return undefined;
  switch (key) {
    case 'ArrowRight':
      return active < 0 ? 0 : Math.min(count - 1, active + 1);
    case 'ArrowLeft':
      return active < 0 ? count - 1 : Math.max(0, active - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return undefined;
  }
}

const MODES: { key: Mode; label: string; title: string; hint: string; icon: IconName }[] = [
  {
    key: 'line',
    label: 'Line',
    title: 'Profit over time',
    hint: 'Tap or drag a point',
    icon: 'line-chart',
  },
  { key: 'bars', label: 'Bars', title: 'Each session', hint: 'Tap or drag across the bars', icon: 'bar-chart' },
];

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function axisFor(values: number[]): Axis {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const step = niceStep((max - min) / SECTIONS);
  return {
    step,
    above: Math.max(1, Math.ceil(max / step)),
    below: Math.ceil(-min / step),
  };
}

function formatAxisLabel(label: string): string {
  const n = Number(label);
  const text = formatTightCompactNumber(Math.abs(n), { currency: true });
  return n < 0 ? `-${text}` : text;
}

const signColor = (c: AppColors, n: number) => (n > 0 ? c.profit : n < 0 ? c.loss : c.textMuted);

export const PLChart = memo(function PLChart({
  entries,
  onOpen,
  titlePeriod,
  isCountSpelledOut = false,
}: {
  entries: readonly Entry[];
  onOpen?: (id: string) => void;
  titlePeriod?: string;
  isCountSpelledOut?: boolean;
}) {
  const c = useAppColors();
  const reduceMotion = useReducedMotion();
  const countLabel = `${entries.length} ${entries.length === 1 ? 'session' : 'sessions'}`;
  const [width, setWidth] = useState(0);
  const isCompact = width < COMPACT_CHART_WIDTH;
  const [mode, setMode] = useState<Mode>('line');
  const [active, setActive] = useState(-1);

  const data = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
    let total = 0;
    return sorted.map((e): Point => {
      total += e.profit;
      return { value: total, date: e.date, delta: e.profit, id: e.id };
    });
  }, [entries]);

  const axis = useMemo(() => axisFor(data.map((p) => (mode === 'line' ? p.value : p.delta))), [data, mode]);

  const current = MODES.find((m) => m.key === mode) ?? MODES[0];
  const selected: Point | undefined = data[active];
  const primaryValue = selected ? (mode === 'line' ? selected.value : selected.delta) : 0;
  const secondaryLabel = selected
    ? mode === 'line'
      ? `${formatSignedCurrency(selected.delta)}${isCompact ? '' : ' this session'}`
      : `Total ${formatSignedCurrency(selected.value)}`
    : '';
  const final = data[data.length - 1]?.value ?? 0;
  const values = data.map((p) => p.value);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const zeroAt = hi - lo > 0 ? hi / (hi - lo) : 1;
  const aboveZero = hi > 0 ? c.profit : c.loss;
  const belowZero = lo < 0 ? c.loss : c.profit;
  const lineData = useMemo(
    () =>
      data.map((p) => ({
        ...p,
        dataPointColor: p.value < 0 ? c.loss : c.profit,
      })),
    [data, c],
  );
  const markerColor = selected && selected.value < 0 ? c.loss : c.profit;
  const plotWidth = Math.max(0, width - Y_LABEL_WIDTH - 8);

  const axisProps = useMemo(
    () => ({
      height: (CHART_HEIGHT * axis.above) / (axis.above + axis.below),
      width: plotWidth,
      disableScroll: true,
      isAnimated: !reduceMotion,
      stepValue: axis.step,
      noOfSections: axis.above,
      maxValue: axis.step * axis.above,
      noOfSectionsBelowXAxis: axis.below,
      mostNegativeValue: -axis.step * axis.below,
      yAxisLabelWidth: Y_LABEL_WIDTH,
      formatYLabel: formatAxisLabel,
      yAxisTextStyle: [styles.axisText, { color: c.textMuted }],
      yAxisThickness: 0,
      xAxisThickness: 1,
      xAxisColor: c.border,
      rulesType: 'dashed' as const,
      rulesColor: c.border,
      dashWidth: 4,
      dashGap: 4,
    }),
    [axis, plotWidth, reduceMotion, c],
  );

  const slot = data.length > 0 ? plotWidth / data.length : 0;
  const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(3, slot * 0.6));
  const barSpacing = Math.max(1, slot - barWidth);
  const barData = useMemo(
    () =>
      data.map((p, i) => {
        const color = signColor(c, p.delta);
        return {
          value: p.delta,
          frontColor: active >= 0 && i !== active ? `${color}55` : color,
        };
      }),
    [data, active, c],
  );

  function changeMode(next: Mode) {
    setMode(next);
    setActive(-1);
  }

  function clearSelection() {
    setActive(-1);
  }

  const lineSpacing = data.length > 1 ? (plotWidth - LINE_INITIAL_SPACING) / (data.length - 1) : 0;
  const lineX = (i: number) => Y_LABEL_WIDTH + LINE_INITIAL_SPACING + i * lineSpacing;
  const lineY = (v: number) => {
    const top = axis.step * axis.above;
    const bottom = -axis.step * axis.below;
    return PLOT_TOP_PAD + ((top - v) / (top - bottom || 1)) * CHART_HEIGHT;
  };

  function indexAt(x: number): number {
    if (data.length === 0) return -1;
    const raw =
      mode === 'line'
        ? lineSpacing > 0
          ? Math.round((x - Y_LABEL_WIDTH - LINE_INITIAL_SPACING) / lineSpacing)
          : 0
        : Math.floor((x - Y_LABEL_WIDTH) / (slot || 1));
    return Math.min(data.length - 1, Math.max(0, raw));
  }

  function selectAt(x: number) {
    const next = indexAt(x);
    if (next < 0 || next === active) return;
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    setActive(next);
  }

  const scrub = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-SCRUB_ACTIVATE_X, SCRUB_ACTIVATE_X])
    .failOffsetY([-SCRUB_FAIL_Y, SCRUB_FAIL_Y])
    .onStart((e) => selectAt(e.x))
    .onUpdate((e) => selectAt(e.x));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e, success) => {
      if (success) selectAt(e.x);
    });
  const plotGesture = Gesture.Exclusive(scrub, tap);

  function plotKeyDown(e: WebKeyEvent) {
    if (e.key === 'Enter') {
      if (!selected || !onOpen) return;
      e.preventDefault();
      onOpen(selected.id);
      return;
    }
    if (e.key === 'Escape') {
      if (active < 0) return;
      e.preventDefault();
      clearSelection();
      return;
    }
    const next = nextIndexForKey(e.key, active, data.length);
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
  }

  function modeKeyDown(e: WebKeyEvent, index: number) {
    const step = NEXT_KEYS.has(e.key) ? 1 : PREV_KEYS.has(e.key) ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = (index + step + MODES.length) % MODES.length;
    changeMode(MODES[next].key);
    focusRadioAt(e.currentTarget, next);
  }

  const plotWebProps = IS_WEB
    ? ({
        tabIndex: 0,
        onKeyDown: plotKeyDown,
        'aria-keyshortcuts': 'ArrowLeft ArrowRight Home End Enter Escape',
      } as object)
    : {};

  const selectedText = selected && (
    <View style={styles.headerSelectedText}>
      <Text style={[styles.headerValue, { color: signColor(c, primaryValue) }]}>
        {formatSignedCurrency(primaryValue)}
      </Text>
      <MetaLine
        textStyle={[styles.headerHint, { color: c.textMuted }]}
        parts={[formatDateDMY(selected.date), secondaryLabel]}
      />
    </View>
  );

  const modeToggle = (
    <View
      style={[styles.toggle, { backgroundColor: c.inputBg, borderColor: c.border }]}
      accessibilityRole="radiogroup">
      {MODES.map((m, index) => {
        const on = m.key === mode;
        const webRadioProps = IS_WEB
          ? ({ tabIndex: on ? 0 : -1, onKeyDown: (e: WebKeyEvent) => modeKeyDown(e, index) } as object)
          : {};
        return (
          <PressableScale
            key={m.key}
            pressedScale={0.95}
            hitSlop={6}
            onPress={() => changeMode(m.key)}
            accessibilityRole="radio"
            accessibilityLabel={m.label}
            accessibilityState={{ checked: on }}
            aria-checked={on}
            {...webRadioProps}
            style={[styles.toggleBtn, isCompact && styles.toggleBtnCompact, on && { backgroundColor: c.accentBg }]}>
            <Icon name={m.icon} size={14} color={on ? c.accentText : c.textMuted} />
            {isCompact ? null : (
              <Text style={[styles.toggleText, { color: on ? c.accentText : c.textMuted }]}>{m.label}</Text>
            )}
          </PressableScale>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <View style={styles.top}>
        <View style={[styles.titleRow, styles.titleRowPadded, !isCompact && styles.titleRowWithToggle]}>
          <View style={styles.titleWithIcon}>
            <Icon name={mode === 'line' ? 'trend-up' : 'bar-chart'} size={18} color={c.textMuted} />
            <Text style={[styles.headerLabel, styles.headerLabelShrink, { color: c.text }]}>
              {titlePeriod ? `${current.title} ${titlePeriod}` : current.title}{' '}
              <Text style={[styles.headerCount, { color: c.textMuted }]} accessibilityLabel={countLabel}>
                ({isCountSpelledOut ? countLabel : data.length})
              </Text>
            </Text>
          </View>
          {isCompact ? null : modeToggle}
        </View>

        <View accessibilityLiveRegion="polite" aria-live="polite">
          {selected ? (
            <View style={styles.valueRow}>
              <View style={[styles.header, styles.headerBtn, isCompact && styles.headerBtnCompact]}>{selectedText}</View>
              {onOpen ? (
                <PressableScale
                  pressedScale={0.96}
                  onPress={() => onOpen(selected.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`View session on ${formatDateDMY(selected.date)}`}
                  style={(state) => [
                    styles.openBtn,
                    isCompact && styles.openBtnCompact,
                    { borderColor: c.borderAccent, backgroundColor: c.accentBg },
                    state.pressed && styles.openBtnPressed,
                  ]}>
                  <Text style={[styles.openBtnText, isCompact && styles.openBtnTextCompact, { color: c.accentText }]}>
                    {isCompact ? 'View' : 'View session'}
                  </Text>
                  <Icon name="chevron-right" size={isCompact ? 12 : 14} color={c.accentText} />
                </PressableScale>
              ) : null}
              <PressableScale
                pressedScale={0.9}
                onPress={clearSelection}
                accessibilityRole="button"
                accessibilityLabel="Clear selection"
                hitSlop={isCompact ? 10 : 6}
                style={[styles.clearBtn, isCompact && styles.clearBtnCompact]}>
                <Icon name="close" size={isCompact ? 14 : 16} color={c.textMuted} />
              </PressableScale>
            </View>
          ) : (
            <View style={[styles.valueRow, styles.header, styles.valueRowIdle]}>
              <View style={styles.headerSelectedText}>
                <Text style={[styles.headerValue, { color: signColor(c, final) }]}>{formatSignedCurrency(final)}</Text>
              </View>
              {isCompact ? modeToggle : null}
            </View>
          )}
        </View>
      </View>

      <GestureDetector gesture={plotGesture}>
        <View
          style={styles.plot}
          nativeID="pl-chart"
          accessible
          {...plotWebProps}
          accessibilityHint={
            IS_WEB
              ? `Use arrow keys to pick a session, ${onOpen ? 'Enter to open it, ' : ''}Escape to clear`
              : undefined
          }
          accessibilityLabel={
            mode === 'line'
              ? `Running profit over ${data.length} sessions, ending at ${formatSignedCurrency(final)}`
              : `Result of each of ${data.length} sessions`
          }>
          {plotWidth <= 0 ? (
            <View style={{ height: CHART_HEIGHT }} />
          ) : mode === 'line' ? (
            <LineChart
              {...axisProps}
              data={lineData}
              adjustToWidth
              initialSpacing={LINE_INITIAL_SPACING}
              endSpacing={6}
              animationDuration={900}
              animateOnDataChange={!reduceMotion && !IS_WEB}
              onDataChangeAnimationDuration={400}
              thickness={2.5}
              areaChart
              lineGradient
              lineGradientId="plLine"
              lineGradientComponent={() => (
                <LinearGradient id="plLine" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={aboveZero} />
                  <Stop offset={zeroAt} stopColor={aboveZero} />
                  <Stop offset={zeroAt} stopColor={belowZero} />
                  <Stop offset="1" stopColor={belowZero} />
                </LinearGradient>
              )}
              areaGradientId="plArea"
              areaGradientComponent={() => (
                <LinearGradient id="plArea" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={aboveZero} stopOpacity={0.3} />
                  <Stop offset={zeroAt} stopColor={aboveZero} stopOpacity={0.04} />
                  <Stop offset={zeroAt} stopColor={belowZero} stopOpacity={0.04} />
                  <Stop offset="1" stopColor={belowZero} stopOpacity={0.3} />
                </LinearGradient>
              )}
              hideDataPoints={data.length > 12}
              dataPointsRadius={3}
              {...(IS_WEB
                ? {
                    customDataPoint: (item: { dataPointColor?: string }) => (
                      <View style={[styles.dot, { backgroundColor: item.dataPointColor }]} />
                    ),
                    dataPointsWidth: DOT_SIZE,
                    dataPointsHeight: DOT_SIZE,
                  }
                : {})}
            />
          ) : (
            <BarChart
              {...axisProps}
              data={barData}
              barWidth={barWidth}
              spacing={barSpacing}
              initialSpacing={barSpacing / 2}
              endSpacing={0}
              barBorderRadius={3}
              animationDuration={500}
            />
          )}
          {mode === 'line' && selected && plotWidth > 0 ? (
            <View
              style={[
                styles.crosshair,
                { backgroundColor: c.textMuted, left: lineX(active) - 0.5, top: PLOT_TOP_PAD, height: CHART_HEIGHT },
                pointer.none,
              ]}
            />
          ) : null}
          {mode === 'line' && selected && plotWidth > 0 ? (
            <View
              style={[
                styles.marker,
                {
                  borderColor: markerColor,
                  backgroundColor: c.card,
                  left: lineX(active) - MARKER_SIZE / 2,
                  top: lineY(selected.value) - MARKER_SIZE / 2,
                },
                pointer.none,
              ]}
            />
          ) : null}
        </View>
      </GestureDetector>
      {plotWidth > 0 && data.length > 0 ? (
        <View style={styles.dateAxis} importantForAccessibility="no-hide-descendants" aria-hidden>
          {axisIndexes(data.length).map((i, k, all) => {
            const spanMs = data[data.length - 1].date.getTime() - data[0].date.getTime();
            const fmt = spanMs > YEAR_MS * 0.9 ? MONTH_YEAR : DAY_MONTH;
            const x =
              mode === 'line' ? lineX(i) : Y_LABEL_WIDTH + barSpacing / 2 + i * (barWidth + barSpacing) + barWidth / 2;
            const isFirst = k === 0 && all.length > 1;
            const isLast = k === all.length - 1 && all.length > 1;
            const left = isFirst ? x - 4 : isLast ? x - AXIS_LABEL_WIDTH + 4 : x - AXIS_LABEL_WIDTH / 2;
            return (
              <Text
                key={i}
                numberOfLines={1}
                style={[
                  styles.axisText,
                  styles.dateAxisLabel,
                  { color: c.textMuted, left, textAlign: isFirst ? 'left' : isLast ? 'right' : 'center' },
                ]}>
                {fmt.format(data[i].date)}
              </Text>
            );
          })}
        </View>
      ) : null}
      <View style={styles.captionRow}>
        <Icon name="tap" size={14} color={c.textHint} />
        <Text style={[styles.caption, { color: c.textHint }]}>{current.hint}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  top: { marginBottom: 4, gap: 6 },
  valueRowIdle: { paddingHorizontal: 0 },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { fontSize: 12, textAlign: 'center' },
  dateAxis: { height: 18, marginTop: 6, marginBottom: 14 },
  dateAxisLabel: { position: 'absolute', top: 0, width: AXIS_LABEL_WIDTH },
  captionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleRowPadded: {
    paddingTop: 12,
  },
  titleRowWithToggle: {
    minHeight: 40,
    paddingTop: 8,
  },
  toggleBtnCompact: {
    minHeight: 26,
    paddingHorizontal: 8,
  },
  toggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 999,
    padding: 2,
  },
  toggleBtn: {
    flexDirection: 'row',
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { fontSize: 12, fontWeight: '600' },
  plot: { marginTop: 8 },
  axisText: { fontSize: 12, fontVariant: ['tabular-nums'] },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
  crosshair: {
    position: 'absolute',
    width: 1,
    opacity: 0.45,
  },
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: 3,
    position: 'absolute',
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCount: {
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  headerLabelShrink: {
    flexShrink: 1,
  },
  headerLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  headerSelectedText: { flex: 1, minWidth: 0, gap: 2 },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 34,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  openBtnPressed: {
    opacity: 0.8,
  },
  openBtnCompact: {
    minHeight: 28,
    paddingLeft: 10,
    paddingRight: 6,
  },
  openBtnTextCompact: {
    fontSize: 12,
  },
  clearBtnCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  headerBtnCompact: {
    paddingHorizontal: 0,
  },
  openBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerBtn: {
    flex: 1,
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  headerValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  headerHint: { fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
});
