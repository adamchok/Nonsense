import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { formatSignedCurrency, formatTightCompactNumber } from '@/lib/currency-format';
import { formatDateDMY } from '@/lib/date-format';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { LinearGradient, Stop } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';

const CHART_HEIGHT = 160;
const Y_LABEL_WIDTH = 40;
const SECTIONS = 4;
const HEADER_HEIGHT = 40;
const MAX_BAR_WIDTH = 22;
const MARKER_SIZE = 14;
// gifted-charts puts the pointer's top-left at (pointerX + 1, pointY - 4 + xAxisThickness);
// these re-centre our marker on the data point (measured in the browser).
const MARKER_SHIFT_X = -(1 + MARKER_SIZE / 2);
const MARKER_SHIFT_Y = -1;

type Mode = 'line' | 'bars';
type Entry = { id: string; date: Date; profit: number };
type Point = { value: number; date: Date; delta: number; id: string };
type Axis = { step: number; above: number; below: number };

const MODES: { key: Mode; label: string; title: string; hint: string }[] = [
  {
    key: 'line',
    label: 'Line',
    title: 'Profit over time',
    hint: 'Tap or drag a point',
  },
  { key: 'bars', label: 'Bars', title: 'Each session', hint: 'Tap a bar' },
];

/** Rounds a raw step up to 1/2/2.5/5 × 10^n so axis labels stay readable. */
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

/**
 * Profit/loss across sessions, oldest to newest, as a running-total line or one bar per
 * session. Selecting a point turns the header into a link to that session.
 */
export function PLChart({ entries, onOpen }: { entries: readonly Entry[]; onOpen: (id: string) => void }) {
  const c = useAppColors();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [mode, setMode] = useState<Mode>('line');
  const [active, setActive] = useState(-1);
  const [chartKey, setChartKey] = useState(0);

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
  const final = data[data.length - 1]?.value ?? 0;
  const values = data.map((p) => p.value);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  // Where $0 falls in the line/area bounding box (gradients default to objectBoundingBox),
  // so the colour flips from green to red exactly at the zero line.
  const zeroAt = hi - lo > 0 ? hi / (hi - lo) : 1;
  const lineData = data.map((p) => ({
    ...p,
    dataPointColor: p.value < 0 ? c.loss : c.profit,
  }));
  const markerColor = selected && selected.value < 0 ? c.loss : c.profit;
  const plotWidth = Math.max(0, width - Y_LABEL_WIDTH - 8);

  // Shared y-axis/grid props; gifted-charts `height` covers only the sections above the x-axis.
  const axisProps = {
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
  };

  const slot = data.length > 0 ? plotWidth / data.length : 0;
  const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(3, slot * 0.6));
  const barSpacing = Math.max(1, slot - barWidth);
  const barData = data.map((p, i) => {
    const color = signColor(c, p.delta);
    return {
      value: p.delta,
      // Dim the rest while one bar is selected (6-digit hex + alpha).
      frontColor: active >= 0 && i !== active ? `${color}55` : color,
    };
  });

  function changeMode(next: Mode) {
    setMode(next);
    setActive(-1);
  }

  /** The line chart keeps its pointer internally, so remount it to drop the marker too. */
  function clearSelection() {
    setActive(-1);
    setChartKey((k) => k + 1);
  }

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <Text style={[styles.headerLabel, { color: c.textMuted }]}>{current.title}</Text>
          <View
            style={[styles.toggle, { backgroundColor: c.inputBg, borderColor: c.border }]}
            accessibilityRole="radiogroup">
            {MODES.map((m) => {
              const on = m.key === mode;
              return (
                <PressableScale
                  key={m.key}
                  pressedScale={0.95}
                  onPress={() => changeMode(m.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[styles.toggleBtn, on && { backgroundColor: c.accentBg }]}>
                  <Text style={[styles.toggleText, { color: on ? c.accentText : c.textMuted }]}>{m.label}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {selected ? (
          // Selection stays after release and takes over the title row (no layout shift under
          // the finger); it doubles as the way into that session, and ✕ clears it.
          <View style={[styles.selectionOverlay, { backgroundColor: c.card }]}>
            <PressableScale
              pressedScale={0.98}
              onPress={() => onOpen(selected.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open session on ${formatDateDMY(selected.date)}`}
              style={[styles.header, styles.headerBtn]}>
              <View>
                <Text style={[styles.headerDate, { color: c.textMuted }]}>{formatDateDMY(selected.date)}</Text>
                <Text style={[styles.headerLink, { color: c.accentText }]}>View session</Text>
              </View>
              <View style={styles.headerSelected}>
                <View style={styles.headerRight}>
                  {mode === 'line' ? (
                    <>
                      <Text style={[styles.headerValue, { color: signColor(c, selected.value) }]}>
                        {formatSignedCurrency(selected.value)}
                      </Text>
                      <Text style={[styles.headerHint, { color: c.textMuted }]}>
                        {formatSignedCurrency(selected.delta)} this session
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.headerValue, { color: signColor(c, selected.delta) }]}>
                        {formatSignedCurrency(selected.delta)}
                      </Text>
                      <Text style={[styles.headerHint, { color: c.textMuted }]}>
                        Total {formatSignedCurrency(selected.value)}
                      </Text>
                    </>
                  )}
                </View>
                <Icon name="chevron-right" size={18} color={c.textMuted} />
              </View>
            </PressableScale>
            <PressableScale
              pressedScale={0.9}
              onPress={clearSelection}
              accessibilityRole="button"
              accessibilityLabel="Clear selection"
              style={styles.clearBtn}>
              <Icon name="close" size={16} color={c.textMuted} />
            </PressableScale>
          </View>
        ) : null}
      </View>

      <View
        style={styles.plot}
        // Web: gifted-charts wraps plots/bars in focusable elements; web-interactions.css skips
        // their hover tint here (selection dimming is the feedback).
        nativeID="pl-chart"
        accessible
        accessibilityLabel={
          mode === 'line'
            ? `Running profit over ${data.length} sessions, ending at ${formatSignedCurrency(final)}`
            : `Result of each of ${data.length} sessions`
        }>
        {plotWidth <= 0 ? (
          <View style={{ height: CHART_HEIGHT }} />
        ) : mode === 'line' ? (
          <LineChart
            key={chartKey}
            {...axisProps}
            data={lineData}
            adjustToWidth
            initialSpacing={6}
            endSpacing={6}
            animationDuration={900}
            animateOnDataChange={!reduceMotion}
            onDataChangeAnimationDuration={400}
            thickness={2.5}
            areaChart
            lineGradient
            lineGradientId="plLine"
            lineGradientComponent={() => (
              <LinearGradient id="plLine" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.profit} />
                <Stop offset={zeroAt} stopColor={c.profit} />
                <Stop offset={zeroAt} stopColor={c.loss} />
                <Stop offset="1" stopColor={c.loss} />
              </LinearGradient>
            )}
            areaGradientId="plArea"
            areaGradientComponent={() => (
              // Strongest away from $0, fading into the zero line from both sides.
              <LinearGradient id="plArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.profit} stopOpacity={0.3} />
                <Stop offset={zeroAt} stopColor={c.profit} stopOpacity={0.04} />
                <Stop offset={zeroAt} stopColor={c.loss} stopOpacity={0.04} />
                <Stop offset="1" stopColor={c.loss} stopOpacity={0.3} />
              </LinearGradient>
            )}
            hideDataPoints={data.length > 12}
            dataPointsRadius={3}
            getPointerProps={({ pointerIndex }: { pointerIndex: number }) => setActive(pointerIndex)}
            pointerConfig={{
              // gifted-charts' strip runs the wrong way once values go negative, and its default
              // dot is offset by fixed pixels; draw our own centred marker instead.
              showPointerStrip: false,
              persistPointer: true,
              pointerComponent: () => (
                <View
                  style={[
                    styles.marker,
                    {
                      borderColor: markerColor,
                      backgroundColor: c.card,
                      marginLeft: MARKER_SHIFT_X,
                      marginTop: MARKER_SHIFT_Y,
                    },
                  ]}
                />
              ),
              // Mobile: a floating tooltip sits under the finger, so the header shows the selection.
              pointerLabelComponent: () => null,
            }}
          />
        ) : (
          // ponytail: bars shrink to 3px past ~60 sessions; group by month if that gets crowded.
          <BarChart
            key={chartKey}
            {...axisProps}
            data={barData}
            barWidth={barWidth}
            spacing={barSpacing}
            initialSpacing={barSpacing / 2}
            endSpacing={0}
            barBorderRadius={3}
            animationDuration={500}
            onPress={(_item: unknown, index: number) => setActive(index)}
          />
        )}
      </View>
      <Text style={[styles.caption, { color: c.textHint }]}>{current.hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  top: { position: 'relative', marginBottom: 8 },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
  },
  caption: { fontSize: 11, textAlign: 'center', marginTop: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 40,
  },
  toggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 999,
    padding: 2,
  },
  toggleBtn: {
    minHeight: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { fontSize: 12, fontWeight: '600' },
  plot: { marginTop: 12 },
  axisText: { fontSize: 10, fontVariant: ['tabular-nums'] },
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: 3,
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  headerDate: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  headerRight: { alignItems: 'flex-end' },
  headerBtn: {
    flex: 1,
    marginLeft: -8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  headerSelected: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerLink: { fontSize: 12, fontWeight: '600' },
  headerValue: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  headerHint: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
