import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { formatSignedCurrency, formatTightCompactNumber } from '@/lib/currency-format';
import { formatDateDMY } from '@/lib/date-format';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useReducedMotion } from 'react-native-reanimated';

const CHART_HEIGHT = 160;
const Y_LABEL_WIDTH = 40;
const SECTIONS = 4;
const HEADER_HEIGHT = 40;
const MARKER_SIZE = 14;
// gifted-charts puts the pointer's top-left at (pointerX + 1, pointY - 4 + xAxisThickness);
// these re-centre our marker on the data point (measured in the browser).
const MARKER_SHIFT_X = -(1 + MARKER_SIZE / 2);
const MARKER_SHIFT_Y = -1;

type Entry = { id: string; date: Date; profit: number };
type Point = { value: number; date: Date; delta: number; id: string };

/** Rounds a raw step up to 1/2/2.5/5 × 10^n so axis labels stay readable. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function formatAxisLabel(label: string): string {
  const n = Number(label);
  const text = formatTightCompactNumber(Math.abs(n), { currency: true });
  return n < 0 ? `-${text}` : text;
}

/** Running profit/loss across sessions, oldest to newest; drag across to inspect a session. */
export function PLChart({ entries, onOpen }: { entries: readonly Entry[]; onOpen: (id: string) => void }) {
  const c = useAppColors();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(-1);

  const { data, axis } = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
    let total = 0;
    const points = sorted.map((e) => {
      total += e.profit;
      return { value: total, date: e.date, delta: e.profit, id: e.id };
    });
    const max = Math.max(0, ...points.map((p) => p.value));
    const min = Math.min(0, ...points.map((p) => p.value));
    const step = niceStep((max - min) / SECTIONS);
    const above = Math.max(1, Math.ceil(max / step));
    const below = Math.ceil(-min / step);
    return {
      data: points,
      axis: { step, above, below },
    };
  }, [entries]);

  const selected: Point | undefined = data[active];
  const final = data[data.length - 1]?.value ?? 0;
  const lineColor = final >= 0 ? c.profit : c.loss;
  const plotWidth = Math.max(0, width - Y_LABEL_WIDTH - 8);

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      accessible
      accessibilityLabel={`Profit and loss over ${data.length} sessions, ending at ${formatSignedCurrency(final)}`}>
      {selected ? (
        // Selection stays after release, so the header doubles as the way into that session.
        <PressableScale
          pressedScale={0.98}
          onPress={() => onOpen(selected.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open session on ${formatDateDMY(selected.date)}`}
          style={[styles.header, styles.headerBtn]}>
          <View>
            <Text style={[styles.headerLabel, { color: c.textMuted }]}>{formatDateDMY(selected.date)}</Text>
            <Text style={[styles.headerLink, { color: c.accentText }]}>View session</Text>
          </View>
          <View style={styles.headerSelected}>
            <View style={styles.headerRight}>
              <Text style={[styles.headerValue, { color: selected.value >= 0 ? c.profit : c.loss }]}>
                {formatSignedCurrency(selected.value)}
              </Text>
              <Text style={[styles.headerHint, { color: c.textMuted }]}>
                {formatSignedCurrency(selected.delta)} this session
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={c.textMuted} />
          </View>
        </PressableScale>
      ) : (
        <View style={styles.header}>
          <Text style={[styles.headerLabel, { color: c.textMuted }]}>Profit over time</Text>
          <Text style={[styles.headerHint, { color: c.textMuted }]}>Tap or drag a point</Text>
        </View>
      )}
      {plotWidth > 0 ? (
        <LineChart
          data={data}
          // gifted-charts `height` covers only the sections above the x-axis.
          height={(CHART_HEIGHT * axis.above) / (axis.above + axis.below)}
          width={plotWidth}
          adjustToWidth
          disableScroll
          initialSpacing={6}
          endSpacing={6}
          isAnimated={!reduceMotion}
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
          stepValue={axis.step}
          noOfSections={axis.above}
          maxValue={axis.step * axis.above}
          noOfSectionsBelowXAxis={axis.below}
          mostNegativeValue={-axis.step * axis.below}
          yAxisLabelWidth={Y_LABEL_WIDTH}
          formatYLabel={formatAxisLabel}
          yAxisTextStyle={[styles.axisText, { color: c.textMuted }]}
          yAxisThickness={0}
          xAxisThickness={1}
          xAxisColor={c.border}
          rulesType="dashed"
          rulesColor={c.border}
          dashWidth={4}
          dashGap={4}
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
            // Mobile: a floating tooltip sits under the finger, so the selected session
            // replaces the card header instead (via getPointerProps).
            pointerLabelComponent: () => null,
          }}
        />
      ) : (
        <View style={{ height: CHART_HEIGHT }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
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
  headerRight: { alignItems: 'flex-end' },
  headerBtn: { marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 },
  headerSelected: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerLink: { fontSize: 12, fontWeight: '600' },
  headerValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  headerHint: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
