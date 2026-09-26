import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { formatSignedCurrency, formatTightCompactNumber } from '@/lib/currency-format';
import { formatDateDMY } from '@/lib/date-format';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';
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
  { key: 'line', label: 'Line', title: 'Profit over time', hint: 'Tap or drag a point' },
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
  return { step, above: Math.max(1, Math.ceil(max / step)), below: Math.ceil(-min / step) };
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

  const data = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
    let total = 0;
    return sorted.map((e): Point => {
      total += e.profit;
      return { value: total, date: e.date, delta: e.profit, id: e.id };
    });
  }, [entries]);

  const axis = useMemo(
    () => axisFor(data.map((p) => (mode === 'line' ? p.value : p.delta))),
    [data, mode]
  );

  const current = MODES.find((m) => m.key === mode) ?? MODES[0];
  const selected: Point | undefined = data[active];
  const final = data[data.length - 1]?.value ?? 0;
  const lineColor = final >= 0 ? c.profit : c.loss;
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

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <View style={styles.titleRow}>
        <Text style={[styles.headerLabel, { color: c.textMuted }]}>{current.title}</Text>
        <View style={[styles.toggle, { backgroundColor: c.inputBg, borderColor: c.border }]} accessibilityRole="radiogroup">
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
        // Selection stays after release, so the header doubles as the way into that session.
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
      ) : (
        <View style={styles.header}>
          <Text style={[styles.headerHint, { color: c.textMuted }]}>{current.hint}</Text>
        </View>
      )}

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
            {...axisProps}
            data={data}
            adjustToWidth
            initialSpacing={6}
            endSpacing={6}
            animationDuration={900}
            animateOnDataChange={!reduceMotion}
            onDataChangeAnimationDuration={400}
            thickness={2.5}
            color={lineColor}
            areaChart
            startFillColor={lineColor}
            endFillColor={lineColor}
            startOpacity={0.28}
            endOpacity={0.02}
            hideDataPoints={data.length > 12}
            dataPointsColor={lineColor}
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
                    { borderColor: lineColor, backgroundColor: c.card, marginLeft: MARKER_SHIFT_X, marginTop: MARKER_SHIFT_Y },
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36 },
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 2 },
  toggleBtn: { minHeight: 28, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
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
  headerLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  headerDate: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  headerRight: { alignItems: 'flex-end' },
  headerBtn: { marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 },
  headerSelected: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerLink: { fontSize: 12, fontWeight: '600' },
  headerValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  headerHint: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
