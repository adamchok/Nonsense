import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { formatSignedCurrency, formatTightCompactNumber } from '@/lib/currency-format';
import { formatDateDMY } from '@/lib/date-format';
import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { LinearGradient, Stop } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';

const CHART_HEIGHT = 160;
const Y_LABEL_WIDTH = 40;
const SECTIONS = 4;
const HEADER_HEIGHT = 52;
const MAX_BAR_WIDTH = 22;
const MARKER_SIZE = 14;
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
}: {
  entries: readonly Entry[];
  onOpen: (id: string) => void;
}) {
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
  const primaryValue = selected ? (mode === 'line' ? selected.value : selected.delta) : 0;
  const secondaryLabel = selected
    ? mode === 'line'
      ? `${formatSignedCurrency(selected.delta)} this session`
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
    [data, c]
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
    [axis, plotWidth, reduceMotion, c]
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
    [data, active, c]
  );

  function changeMode(next: Mode) {
    setMode(next);
    setActive(-1);
  }

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
          <View style={styles.valueRow}>
            <PressableScale
              pressedScale={0.98}
              onPress={() => onOpen(selected.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open session on ${formatDateDMY(selected.date)}`}
              style={[styles.header, styles.headerBtn]}>
              <View style={styles.headerSelectedText}>
                <Text style={[styles.headerValue, { color: signColor(c, primaryValue) }]}>
                  {formatSignedCurrency(primaryValue)}
                </Text>
                <Text style={[styles.headerHint, { color: c.textMuted }]} numberOfLines={1}>
                  {`${formatDateDMY(selected.date)} · ${secondaryLabel}`}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={c.textMuted} />
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
        ) : (
          <View style={[styles.valueRow, styles.header]}>
            <View style={styles.headerSelectedText}>
              <Text style={[styles.headerValue, { color: signColor(c, final) }]}>{formatSignedCurrency(final)}</Text>
              <Text style={[styles.headerHint, { color: c.textMuted }]} numberOfLines={1}>
                {`All time · ${data.length} ${data.length === 1 ? 'session' : 'sessions'}`}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View
        style={styles.plot}
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
            getPointerProps={({ pointerIndex }: { pointerIndex: number }) => setActive(pointerIndex)}
            pointerConfig={{
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
              pointerLabelComponent: () => null,
            }}
          />
        ) : (
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
});

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  top: { marginBottom: 8, gap: 4 },
  valueRow: {
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
  caption: { fontSize: 11, textAlign: 'center' },
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
  headerSelectedText: { flex: 1, minWidth: 0, gap: 2 },
  headerBtn: {
    flex: 1,
    gap: 10,
    marginLeft: -12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  headerValue: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  headerHint: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
