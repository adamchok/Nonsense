import { Icon } from '@/components/icon';
import { withAlpha } from '@/components/web/landing-showcase';
import { Animated, useCountUp } from '@/components/motion';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { DemoAvatar, type DemoPlayer } from '@/components/web/demo-avatar';
import { type AppColors } from '@/lib/app-theme';
import { radius } from '@/lib/spacing';
import { text } from '@/lib/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

type Seat = {
  name: DemoPlayer;
  buyIn: number;
  rebuy: number;
  net: number;
  angle: number;
};

const HEADLINE_GOLD_LIGHT = '#ae801e';
const SEATS: Seat[] = [
  { name: 'Alex', buyIn: 200, rebuy: 0, net: 185, angle: -90 },
  { name: 'Jordan', buyIn: 100, rebuy: 0, net: 40, angle: -18 },
  { name: 'Priya', buyIn: 100, rebuy: 0, net: -25, angle: 54 },
  { name: 'Sam', buyIn: 200, rebuy: 0, net: -80, angle: 126 },
  { name: 'Chris', buyIn: 200, rebuy: 100, net: -120, angle: 198 },
];

const PAYMENTS = [
  { from: 4, to: 0, amount: 120 },
  { from: 3, to: 0, amount: 65 },
  { from: 2, to: 1, amount: 25 },
  { from: 3, to: 1, amount: 15 },
];

const START_POT = SEATS.reduce((sum, s) => sum + s.buyIn, 0);
const FULL_POT = SEATS.reduce((sum, s) => sum + s.buyIn + s.rebuy, 0);

const PHASE = {
  seated: 0,
  buyIns: 1,
  rebuy: 2,
  results: 3,
  payments: 4,
  settled: 5,
} as const;
const PHASE_AT = [0, 500, 2300, 3300, 4300, 7000];
const HERO_MIN_HEIGHT = 720;
const LOOP_MS = 10_500;
const BUY_IN_STAGGER = 220;
const PAYMENT_STAGGER = 600;
const FLIGHT_EASING = Easing.inOut(Easing.cubic);

const enter = (i: number) =>
  FadeInDown.duration(620)
    .delay(120 + i * 130)
    .reduceMotion(ReduceMotion.System);

function money(value: number, signed = false): string {
  const abs = `$${Math.abs(Math.round(value))}`;
  if (!signed) return abs;
  return value >= 0 ? `+${abs}` : `−${abs}`;
}

function webStyle(style: Record<string, string>): object {
  return style;
}

function useNight(reduceMotion: boolean) {
  const [state, setState] = useState<{ phase: number; cycle: number }>({
    phase: PHASE.seated,
    cycle: 0,
  });
  useEffect(() => {
    if (reduceMotion) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let cycle = 0;
    const run = () => {
      cycle += 1;
      const current = cycle;
      timers = PHASE_AT.map((t, phase) => setTimeout(() => setState({ phase, cycle: current }), t));
      timers.push(setTimeout(run, LOOP_MS));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [reduceMotion]);
  return reduceMotion ? { phase: PHASE.settled, cycle: 0 } : state;
}

type Point = { x: number; y: number };

function Flight({
  from,
  to,
  delay,
  duration,
  arc,
  color,
  edge,
  label,
  c,
  dark,
  fadeOut,
  payment = false,
}: {
  from: Point;
  to: Point;
  delay: number;
  duration: number;
  arc: number;
  color: string;
  edge: string;
  label?: string;
  c: AppColors;
  dark: boolean;
  fadeOut: boolean;
  payment?: boolean;
}) {
  const cashInk = dark ? c.bg : '#ffffff';
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: FLIGHT_EASING }));
  }, [progress, delay, duration]);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const x = from.x + (to.x - from.x) * p;
    const y = from.y + (to.y - from.y) * p - arc * Math.sin(Math.PI * p);
    const visible = p > 0 ? 1 : 0;
    const fade = fadeOut ? (p > 0.85 ? (1 - p) / 0.15 : 1) : p > 0.92 ? 0.6 : 1;
    return {
      opacity: visible * fade,
      transform: [{ translateX: x }, { translateY: y }],
    };
  });
  return (
    <Animated.View style={[styles.flight, style]}>
      {payment ? (
        <View
          style={[
            styles.transfer,
            { backgroundColor: c.profit, borderColor: withAlpha(c.profit, 0.6) },
            webStyle({ boxShadow: `0 6px 16px -6px ${withAlpha(c.profit, dark ? 0.5 : 0.35)}` }),
          ]}>
          <Icon name="payments" size={16} color={cashInk} importantForAccessibility="no" />
          <Text style={[text.caption, styles.flightLabelText, { color: cashInk }]}>{label}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.chip, { backgroundColor: color, borderColor: edge }]}>
            <View style={[styles.chipInner, { borderColor: edge }]} />
          </View>
          {label && (
            <View
              style={[
                styles.flightLabel,
                {
                  backgroundColor: c.card,
                  borderColor: dark ? c.border : c.accentBorder,
                },
                !dark &&
                  webStyle({
                    boxShadow: `0 4px 12px -4px ${withAlpha(c.text, 0.18)}`,
                  }),
              ]}>
              <Text style={[text.caption, styles.flightLabelText, { color: c.text }]}>{label}</Text>
            </View>
          )}
        </>
      )}
    </Animated.View>
  );
}

function SeatView({
  seat,
  at,
  phase,
  c,
  dark,
  compact,
}: {
  seat: Seat;
  at: Point;
  phase: number;
  c: AppColors;
  dark: boolean;
  compact: boolean;
}) {
  const showResult = phase >= PHASE.results;
  const inFor = seat.buyIn + (phase >= PHASE.rebuy ? seat.rebuy : 0);
  const resultColor = seat.net >= 0 ? c.profit : c.loss;
  const size = compact ? 40 : 52;
  const beside = Math.sin((seat.angle * Math.PI) / 180) < -0.9;
  const position = beside ? { left: at.x - size / 2, top: at.y - size / 2 } : { left: at.x - 60, top: at.y - size / 2 };
  const labels = (
    <>
      <Text style={[text.label, !beside && styles.seatName, { color: c.text }]}>{seat.name}</Text>
      {showResult ? (
        <Animated.Text
          key="result"
          entering={ZoomIn.duration(320).reduceMotion(ReduceMotion.System)}
          style={[text.amount, styles.seatValue, { color: resultColor }]}>
          {money(seat.net, true)}
        </Animated.Text>
      ) : (
        <Text style={[text.rowMeta, styles.seatValue, { color: c.textMuted }]}>In {money(inFor)}</Text>
      )}
    </>
  );
  return (
    <View style={[styles.seat, beside && styles.seatBeside, position]}>
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: dark ? c.avatarBg : c.card,
            borderColor: showResult ? resultColor : dark ? c.border : c.accentBorder,
          },
          webStyle({
            transition: 'border-color 400ms ease',
            ...(dark
              ? {}
              : {
                  boxShadow: `0 0 0 4px ${c.bg}, 0 6px 16px -6px ${withAlpha(c.text, 0.2)}`,
                }),
          }),
        ]}>
        <DemoAvatar name={seat.name} size={size - 4} />
      </View>
      {beside ? <View style={styles.seatBesideText}>{labels}</View> : labels}
    </View>
  );
}

function PotLabel({ phase, c, compact }: { phase: number; c: AppColors; compact: boolean }) {
  const target = phase >= PHASE.rebuy ? FULL_POT : phase >= PHASE.buyIns ? START_POT : 0;
  const shown = useCountUp(target, 1200);
  if (phase >= PHASE.settled) {
    return (
      <Animated.View
        key="settled"
        entering={ZoomIn.springify().damping(14).reduceMotion(ReduceMotion.System)}
        style={styles.potInner}>
        <View style={styles.settledLabel}>
          <Icon name="check-circle" size={18} color={c.profit} weight="duotone" duotoneOpacity={0.3} importantForAccessibility="no" />
          <Text style={[styles.potLabelText, { color: c.textSecondary }]}>Settled in</Text>
        </View>
        <Text style={[styles.potValue, compact && styles.settledCompact, styles.settledText, { color: c.text }]}>
          4 payments
        </Text>
      </Animated.View>
    );
  }
  return (
    <View style={styles.potInner}>
      <View style={styles.settledLabel}>
        <Icon name="poker-chip" size={18} color={c.accentText} weight="duotone" duotoneOpacity={0.3} importantForAccessibility="no" />
        <Text style={[styles.potLabelText, { color: c.textSecondary }]}>Pot</Text>
      </View>
      <Text style={[styles.potValue, { color: c.text }]}>{money(shown)}</Text>
    </View>
  );
}

function PokerTable({
  c,
  dark,
  stageWidth,
  compact,
}: {
  c: AppColors;
  dark: boolean;
  stageWidth: number;
  compact: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const { phase, cycle } = useNight(reduceMotion);
  const w = stageWidth;
  const h = compact ? w * 0.92 : w * 0.56;
  const center = { x: w / 2, y: h / 2 };
  const rx = compact ? w * 0.3 : w * 0.3;
  const ry = compact ? h * 0.26 : h * 0.27;
  const seatAt = (s: Seat): Point => {
    const a = (s.angle * Math.PI) / 180;
    return {
      x: center.x + Math.cos(a) * rx * 1.42,
      y: center.y + Math.sin(a) * ry * 1.55,
    };
  };
  const chipAt = (p: Point): Point => ({ x: p.x - 11, y: p.y - 11 });
  const potPoint = chipAt(center);

  return (
    <View
      role="img"
      aria-label="Animated example: five players buy in to a $900 pot, then Nonsense settles the table in four payments. Alex wins $185."
      style={{ width: w, height: h }}>
      <View
        aria-hidden
        style={[
          styles.felt,
          {
            left: center.x - rx,
            top: center.y - ry,
            width: rx * 2,
            height: ry * 2,
            borderRadius: rx,
            backgroundColor: c.card,
            borderColor: c.accentBorder,
          },
          webStyle({
            backgroundImage: dark
              ? `radial-gradient(ellipse at 50% 40%, ${c.accentBg} 0%, ${c.card} 70%)`
              : `radial-gradient(ellipse at 50% 20%, ${c.card} 0%, ${withAlpha(c.accent, 0.16)} 100%)`,
            boxShadow: dark
              ? `0 0 0 6px ${c.cardAlt}, 0 30px 80px -30px ${c.accent}`
              : [
                  `0 0 0 6px ${c.card}`,
                  `0 0 0 7px ${c.border}`,
                  `0 2px 6px ${withAlpha(c.text, 0.05)}`,
                  `0 28px 56px -26px ${withAlpha(c.text, 0.22)}`,
                ].join(', '),
          }),
        ]}>
        <PotLabel phase={phase} c={c} compact={compact} />
      </View>
      <View aria-hidden style={StyleSheet.absoluteFill}>
        {SEATS.map((s) => (
          <SeatView key={s.name} seat={s} at={seatAt(s)} phase={phase} c={c} dark={dark} compact={compact} />
        ))}
        {!reduceMotion &&
          phase >= PHASE.buyIns &&
          SEATS.map((s, i) => (
            <Flight
              key={`in-${cycle}-${s.name}`}
              from={chipAt(seatAt(s))}
              to={potPoint}
              delay={i * BUY_IN_STAGGER}
              duration={650}
              arc={30}
              color={c.accent}
              edge={c.onAccent}
              c={c}
              dark={dark}
              fadeOut
            />
          ))}
        {!reduceMotion && phase >= PHASE.rebuy && (
          <Flight
            key={`rebuy-${cycle}`}
            from={chipAt(seatAt(SEATS[4]))}
            to={potPoint}
            delay={0}
            duration={650}
            arc={30}
            color={c.accent}
            edge={c.onAccent}
            label="+$100"
            c={c}
            dark={dark}
            fadeOut
          />
        )}
        {!reduceMotion &&
          phase >= PHASE.payments &&
          PAYMENTS.map((p, i) => (
            <Flight
              key={`pay-${cycle}-${i}`}
              from={chipAt(seatAt(SEATS[p.from]))}
              to={chipAt(seatAt(SEATS[p.to]))}
              delay={i * PAYMENT_STAGGER}
              duration={820}
              arc={-24}
              color={c.blue}
              edge={c.text}
              label={money(p.amount)}
              c={c}
              dark={dark}
              fadeOut
              payment
            />
          ))}
      </View>
    </View>
  );
}

export function LandingHero({
  c,
  dark,
  isWide,
  nav,
  cta,
}: {
  c: AppColors;
  dark: boolean;
  isWide: boolean;
  nav: ReactNode;
  cta: ReactNode;
}) {
  const { width } = useBreakpoint();
  const { height } = useWindowDimensions();
  const stageWidth = isWide ? Math.min(760, width * 0.54) : Math.min(width - 32, 440);
  const fill = { minHeight: isWide ? Math.max(height, HERO_MIN_HEIGHT) : height };
  const glow = webStyle({
    backgroundImage: dark
      ? `radial-gradient(60% 45% at 50% 78%, ${c.accentBg} 0%, transparent 70%)`
      : `radial-gradient(closest-side at ${isWide ? '72%' : '50%'} ${isWide ? '55%' : '72%'}, ${withAlpha(c.accent, 0.42)} 0%, ${withAlpha(c.accent, 0)} 100%), radial-gradient(closest-side at ${isWide ? '22%' : '50%'} ${isWide ? '30%' : '20%'}, ${withAlpha(c.borderBlue, 0.16)} 0%, ${withAlpha(c.borderBlue, 0)} 100%)`,
  });

  return (
    <View style={[styles.host, fill, glow]}>
      {nav}
      <View role="main" style={[styles.content, isWide && styles.contentWide]}>
        <View style={[styles.copy, isWide && styles.copyWide]}>
          <Animated.View entering={enter(0)}>
            <Text role="heading" aria-level={1} style={[styles.h1, isWide && styles.h1Wide, { color: c.text }]}>
              Deal the cards.{'\n'}
              <Text style={{ color: dark ? c.accentText : HEADLINE_GOLD_LIGHT }}>Skip the math.</Text>
            </Text>
          </Animated.View>
          <Animated.View entering={enter(1)}>
            <Text style={[styles.lede, isWide && styles.left, { color: c.textSecondary }]}>
              No more 1 AM arguments over who owes what. Track every buy-in, then settle up in the fewest payments.
            </Text>
          </Animated.View>
          <Animated.View entering={enter(2)} style={styles.ctaRow}>
            {cta}
          </Animated.View>
        </View>
        <Animated.View
          entering={FadeIn.duration(700).delay(500).reduceMotion(ReduceMotion.System)}
          style={[styles.stage, isWide && styles.stageWide]}>
          <PokerTable c={c} dark={dark} stageWidth={stageWidth} compact={!isWide} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'relative', overflow: 'hidden' },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 40,
  },
  contentWide: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 48,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 96,
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
  },
  copy: { alignItems: 'center' },
  copyWide: { flex: 1, alignItems: 'flex-start', maxWidth: 500 },
  left: { textAlign: 'left' },
  h1: {
    fontSize: 46,
    lineHeight: 50,
    fontWeight: '800',
    letterSpacing: -1.4,
    textAlign: 'center',
  },
  h1Wide: {
    fontSize: 60,
    lineHeight: 64,
    letterSpacing: -2,
    textAlign: 'left',
  },
  lede: {
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
    marginTop: 20,
    maxWidth: 560,
  },
  ctaRow: { marginTop: 28 },
  stage: { marginTop: 24 },
  stageWide: { marginTop: 0 },
  felt: {
    position: 'absolute',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  potInner: { alignItems: 'center', gap: 4, paddingHorizontal: 28 },
  settledText: { textAlign: 'center' },
  settledLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  potLabelText: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  settledCompact: { fontSize: 24, lineHeight: 30 },
  potValue: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.6,
  },
  seat: { position: 'absolute', width: 120, alignItems: 'center', gap: 4 },
  seatBeside: { flexDirection: 'row', width: 160, gap: 10 },
  seatBesideText: { alignItems: 'flex-start', gap: 0 },
  avatar: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  seatName: { marginTop: 2 },
  seatValue: { minHeight: 20 },
  flight: {
    position: 'absolute',
    left: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipInner: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  transfer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  flightLabel: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  flightLabelText: { fontWeight: '700', fontVariant: ['tabular-nums'] },
});
