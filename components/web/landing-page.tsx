import { Icon, type IconName } from '@/components/icon';
import { Animated } from '@/components/motion';
import { LandingFaq } from '@/components/web/landing-faq';
import { LandingHero } from '@/components/web/landing-hero';
import { LandingShowcase } from '@/components/web/landing-showcase';
import { IconTile, SectionHeading } from '@/components/web/landing-section';
import { CardRain, PlayingCard, type Suit } from '@/components/web/playing-cards';
import { SIGN_IN_HREF, SiteFooter, SiteNav, SkipLink, chromeStyles, siteLogo } from '@/components/web/site-chrome';
import { DemoAvatar, type DemoPlayer } from '@/components/web/demo-avatar';
import { PLChart } from '@/components/pl-chart';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useHydrated } from '@/hooks/use-hydrated';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { radius, space } from '@/lib/spacing';
import { useResolvedColorScheme } from '@/lib/theme-context';
import { text } from '@/lib/ui';
import { Link } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const WIDE_BREAKPOINT = 960;
const CTA_LABEL = 'Get started free';
const PAGE_TITLE = 'Nonsense · Home poker tracker';
const PAGE_DESCRIPTION = 'Free home-poker tracker. Log buy-ins live, then settle the table in the fewest payments.';

type Moment = { time: string; icon: IconName; title: string; body: string; settles?: boolean; cashesOut?: boolean };

const NIGHT: Moment[] = [
  { time: '8:04 PM', icon: 'poker-chip', title: 'Five players buy in', body: '$800 goes on the table. Everyone sees the same ledger.' },
  { time: '10:20 PM', icon: 'replay', title: 'Chris re-buys for $100', body: 'One tap. No one has to remember it at 1 AM.' },
  {
    time: '11:45 PM',
    icon: 'coins',
    title: 'Priya heads home early',
    body: 'She cashes out with $75 and her result is locked in.',
    cashesOut: true,
  },
  {
    time: '1:10 AM',
    icon: 'pays',
    title: 'Four payments settle it',
    body: 'Enter final stacks. Nonsense works out who pays whom.',
    settles: true,
  },
];

const RAIL_MS = 1400;
const NODE_STEP_MS = 320;
const NODE_LEAD_MS = 120;
const REVEAL_MS = 560;

/** Token hex to rgba so glows can sit under text at low strength. */
function tint(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Web-only CSS (gradients, box-shadow) that RN's style types do not model. */
function web(style: Record<string, string>): ViewStyle {
  return style as unknown as ViewStyle;
}

type Signal = {
  gold: string;
  blue: string;
  dark: boolean;
  /** Light mode: hairlines and shadows tinted from the text ink, never pure black. */
  rule: string;
  lift: string;
  /** Background glow sources. Light mode uses the bright tokens at higher alpha so glows survive a pale page. */
  glowGold: string;
  glowBlue: string;
  glow: number;
};

/** Same light sources the hero canvas uses; in light mode they turn into warm, low tints and soft ink shadows. */
function signalFor(c: AppColors, dark: boolean): Signal {
  return {
    gold: dark ? c.accentText : c.accent,
    blue: dark ? c.blue : c.borderBlue,
    dark,
    rule: dark ? c.border : tint(c.text, 0.1),
    lift: `0 1px 2px ${tint(c.text, 0.04)}, 0 14px 36px -18px ${tint(c.text, 0.12)}`,
    glowGold: dark ? c.accentText : c.accent,
    glowBlue: dark ? c.blue : c.borderBlue,
    glow: dark ? 1 : 2.6,
  };
}

/**
 * True once the element has scrolled into view. Always true before hydration (static HTML stays readable),
 * under reduced motion, and when IntersectionObserver is unavailable, so content is never stuck hidden.
 */
function useInView(): [RefObject<View | null>, boolean] {
  const ref = useRef<View>(null);
  const reduceMotion = useReducedMotion();
  const hydrated = useHydrated();
  const [seen, setSeen] = useState(false);
  const canObserve = typeof IntersectionObserver !== 'undefined';
  const skip = reduceMotion || !hydrated || !canObserve;
  useEffect(() => {
    if (skip || seen) return;
    const node = ref.current as unknown as Element | null;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setSeen(true);
        io.disconnect();
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [skip, seen]);
  return [ref, seen || skip];
}

function Reveal({
  shown,
  delay = 0,
  style,
  children,
}: {
  shown: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <View style={style}>{children}</View>;
  if (!shown) return <View style={[style, styles.hidden]}>{children}</View>;
  return (
    <Animated.View
      entering={FadeInDown.duration(REVEAL_MS).delay(delay).reduceMotion(ReduceMotion.System)}
      style={style}>
      {children}
    </Animated.View>
  );
}

const DAY = 86_400_000;
const HISTORY = [85, -40, 132, -65, 210, -18, 47, 95, -120, 163, 58, -34].map((profit, i) => ({
  id: `demo-${i}`,
  date: new Date(Date.UTC(2026, 3, 3) + i * 7 * DAY),
  profit,
}));

function CtaButton({ c }: { c: AppColors }) {
  return (
    <Link href={SIGN_IN_HREF} asChild>
      <Pressable role="link" style={StyleSheet.flatten([styles.cta, { backgroundColor: c.accent }])}>
        <Text style={[text.button, { color: c.onAccent }]}>{CTA_LABEL}</Text>
        <Icon name="arrow-right-bold" size={16} color={c.onAccent} importantForAccessibility="no" />
      </Pressable>
    </Link>
  );
}


function SignalRail({ shown, vertical, signal, track }: { shown: boolean; vertical: boolean; signal: Signal; track: string }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!shown) return;
    progress.set(withTiming(1, { duration: reduceMotion ? 0 : RAIL_MS, easing: Easing.out(Easing.cubic) }));
  }, [shown, reduceMotion, progress]);
  const fillMotion = useAnimatedStyle(() => ({
    transform: vertical ? [{ scaleY: progress.get() }] : [{ scaleX: progress.get() }],
  }));
  const angle = vertical ? '180deg' : '90deg';
  const fill = web({
    backgroundImage: `linear-gradient(${angle}, ${signal.gold} 0%, ${signal.gold} 55%, ${signal.blue} 82%, ${tint(signal.blue, 0)} 100%)`,
    boxShadow: signal.dark ? `0 0 14px ${tint(signal.gold, 0.55)}` : `0 0 8px ${tint(signal.gold, 0.22)}`,
  });
  return (
    <View aria-hidden style={[styles.rail, vertical ? styles.railVertical : styles.railHorizontal]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: track }]} />
      <Animated.View
        style={[StyleSheet.absoluteFill, { transformOrigin: vertical ? 'top' : 'left' }, fill, fillMotion]}
      />
    </View>
  );
}

function MomentNode({ step, lit, delay, c, signal }: { step: Moment; lit: boolean; delay: number; c: AppColors; signal: Signal }) {
  const hue = step.settles ? signal.blue : step.cashesOut ? c.profit : signal.gold;
  const ink = step.settles ? c.blue : step.cashesOut ? c.profit : c.accentText;
  const wash = step.settles ? c.blueBg : step.cashesOut ? tint(c.profit, 0.14) : c.accentBg;
  const glow = web({
    boxShadow: signal.dark
      ? `0 0 0 5px ${c.bg}, 0 0 22px ${tint(hue, 0.5)}`
      : `0 0 0 5px ${c.bg}, 0 0 0 6px ${tint(hue, 0.18)}, 0 6px 16px -4px ${tint(hue, 0.35)}`,
  });
  const idle = signal.dark
    ? { backgroundColor: c.bg, borderColor: c.border }
    : [{ backgroundColor: c.card, borderColor: signal.rule }, web({ boxShadow: `0 0 0 5px ${c.bg}` })];
  return (
    <View style={styles.nodeSlot}>
      <View style={[styles.node, idle]}>
        <Icon name={step.icon} size={18} color={c.textMuted} weight="duotone" importantForAccessibility="no" />
      </View>
      {lit && (
        <Animated.View
          entering={FadeIn.duration(360).delay(delay).reduceMotion(ReduceMotion.System)}
          style={[
            styles.node,
            styles.nodeLit,
            { backgroundColor: wash, borderColor: hue },
            glow,
          ]}>
          <Icon name={step.icon} size={18} color={ink} weight="duotone" duotoneOpacity={0.3} importantForAccessibility="no" />
        </Animated.View>
      )}
    </View>
  );
}

function NightTimeline({ c, isWide, signal }: { c: AppColors; isWide: boolean; signal: Signal }) {
  const [ref, inView] = useInView();
  return (
    <View ref={ref} style={[styles.timeline, isWide && styles.timelineWide]}>
      <SignalRail shown={inView} vertical={!isWide} signal={signal} track={signal.rule} />
      {NIGHT.map((step, i) => {
        const delay = NODE_LEAD_MS + i * NODE_STEP_MS;
        return (
          <View key={step.time} style={[styles.moment, isWide && styles.momentWide]}>
            <MomentNode step={step} lit={inView} delay={delay} c={c} signal={signal} />
            <Reveal shown={inView} delay={delay + 80} style={styles.momentText}>
              <Text style={[styles.time, { color: step.settles ? c.blue : step.cashesOut ? c.profit : c.accentText }]}>
                {step.time}
              </Text>
              <Text role="heading" aria-level={3} style={[styles.momentTitle, { color: c.text }]}>
                {step.title}
              </Text>
              <Text style={[text.body, { color: c.textMuted }]}>{step.body}</Text>
            </Reveal>
          </View>
        );
      })}
    </View>
  );
}

function TimelineSection({ c, isWide, signal, container }: SectionProps) {
  const halo = web({
    backgroundImage: `radial-gradient(closest-side at 25% 45%, ${tint(signal.glowGold, 0.1 * signal.glow)} 0%, ${tint(signal.glowGold, 0)} 100%), radial-gradient(closest-side at 78% 60%, ${tint(signal.glowBlue, 0.08 * signal.glow)} 0%, ${tint(signal.glowBlue, 0)} 100%)`,
  });
  return (
    <View nativeID="how-it-works" style={halo}>
      <View style={[container, styles.block, isWide && styles.blockWide]}>
        <SectionHeading
          c={c}
          icon="clock-outline"
          hue={c.accentText}
          label="How it works"
          title="One night, start to finish"
          intro="From the first buy-in to the last payment, the whole table sees the same numbers."
          isWide={isWide}
        />
        <NightTimeline c={c} isWide={isWide} signal={signal} />
      </View>
    </View>
  );
}

type SectionProps = { c: AppColors; isWide: boolean; signal: Signal; container: StyleProp<ViewStyle> };

/** Dark: a corner glow plus a luminous top edge. Light: a soft tinted wash and an ink-tinted lift shadow. */
function panel(signal: Signal, hue: string, at: string): ViewStyle {
  if (signal.dark) {
    return web({
      backgroundImage: `radial-gradient(70% 80% at ${at}, ${tint(hue, 0.16)} 0%, ${tint(hue, 0)} 65%)`,
      boxShadow: `inset 0 1px 0 ${tint(hue, 0.22)}`,
    });
  }
  return web({
    backgroundImage: `radial-gradient(75% 85% at ${at}, ${tint(hue, 0.26)} 0%, ${tint(hue, 0)} 70%)`,
    boxShadow: signal.lift,
  });
}

const GROUP: { name: DemoPlayer; net: number }[] = [
  { name: 'Alex', net: 1240 },
  { name: 'Priya', net: 615 },
  { name: 'Jordan', net: -180 },
  { name: 'Sam', net: -455 },
  { name: 'Chris', net: -620 },
];

/** A static slice of a group leaderboard, so the card shows what "your regulars" looks like in the app. */
function GroupBoard({ c, signal }: { c: AppColors; signal: Signal }) {
  return (
    <View
      role="img"
      aria-label="Example group leaderboard: Friday Night, 5 players, 18 sessions"
      style={[styles.board, { backgroundColor: signal.dark ? c.bg : c.cardAlt, borderColor: c.border }]}>
      <View style={styles.boardHead}>
        <Text style={[styles.boardTitle, { color: c.text }]}>Friday Night</Text>
        <Text style={[text.micro, { color: c.textMuted }]}>18 sessions</Text>
      </View>
      {GROUP.map((p, i) => (
        <View key={p.name} style={[styles.boardRow, { borderTopColor: c.border }]}>
          <Text style={[styles.boardRank, { color: i === 0 ? c.accentText : c.textMuted }]}>{i + 1}</Text>
          <DemoAvatar name={p.name} size={28} />
          <Text style={[styles.boardName, { color: c.text }]}>{p.name}</Text>
          <Text style={[styles.boardNet, { color: p.net >= 0 ? c.profit : c.loss }]}>
            {p.net >= 0 ? '+' : '−'}${Math.abs(p.net).toLocaleString('en-US')}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Same night as the hero table: four payments settle it.
const PAYMENTS: { from: DemoPlayer; to: DemoPlayer; amount: number }[] = [
  { from: 'Chris', to: 'Alex', amount: 120 },
  { from: 'Sam', to: 'Alex', amount: 65 },
  { from: 'Priya', to: 'Jordan', amount: 25 },
  { from: 'Sam', to: 'Jordan', amount: 15 },
];
const SETTLED_TOTAL = PAYMENTS.reduce((sum, p) => sum + p.amount, 0);
const PROMISES = ['No deposits, no wallet', 'No bets, no odds', 'Pay each other however you like'];


/** A settle-up receipt: who pays whom, and proof that none of it passes through the app. */
function SettleReceipt({ c, signal, isWide }: { c: AppColors; signal: Signal; isWide: boolean }) {
  return (
    <View
      style={[
        styles.receipt,
        isWide && styles.receiptWide,
        { backgroundColor: signal.dark ? c.bg : c.card, borderColor: c.border },
        !signal.dark && web({ boxShadow: signal.lift }),
      ]}>
      <View style={styles.receiptHead}>
        <Text style={[styles.receiptTitle, { color: c.text }]}>Settle up</Text>
        <Text style={[text.micro, { color: c.textMuted }]}>Fri night · 5 players</Text>
      </View>
      <View role="list" aria-label="Example settle-up: 4 payments between players">
        {PAYMENTS.map((p) => (
          <View
            key={`${p.from}-${p.to}`}
            role="listitem"
            aria-label={`${p.from} pays ${p.to} $${p.amount}`}
            style={[styles.receiptRow, { borderTopColor: c.border }]}>
            <DemoAvatar name={p.from} size={28} />
            <Text style={[styles.receiptName, { color: c.text }]}>{p.from}</Text>
            <Icon name="arrow-right" size={14} color={c.textHint} importantForAccessibility="no" />
            <DemoAvatar name={p.to} size={28} />
            <Text style={[styles.receiptName, styles.receiptGrow, { color: c.text }]}>{p.to}</Text>
            <Text style={[styles.receiptAmount, { color: c.text }]}>${p.amount}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.receiptTotal, { borderTopColor: c.inputBorder }, web({ borderTopStyle: 'dashed' })]}>
        <Text style={[styles.receiptName, styles.receiptGrow, { color: c.textMuted }]}>Through Nonsense</Text>
        <Text style={[styles.receiptAmount, { color: c.accentText }]}>$0</Text>
      </View>
      <Text style={[text.micro, { color: c.textMuted }]}>
        ${SETTLED_TOTAL} settled between friends, outside the app.
      </Text>
    </View>
  );
}

function Bento({ c, isWide, signal }: { c: AppColors; isWide: boolean; signal: Signal }) {
  const [ref, inView] = useInView();
  return (
    <View ref={ref} style={styles.bento}>
      <View style={[styles.bentoRow, isWide && styles.bentoRowWide]}>
        <Reveal
          shown={inView}
          style={[
            styles.cell,
            styles.cellChartPad,
            isWide && styles.cellChart,
            { backgroundColor: c.card, borderColor: c.border },
            panel(signal, signal.glowGold, '0% 0%'),
          ]}>
          <IconTile name="trend-up" hue={c.accentText} size={44} />
          <Text role="heading" aria-level={3} style={[styles.cellTitle, { color: c.text }]}>
            Every night adds up
          </Text>
          <Text style={[text.body, { color: c.textMuted }]}>
            Your profit over time, every session one tap away. Drag or tap along the line to read any night.
          </Text>
          <View style={[styles.chart, { borderTopColor: signal.rule }]}>
            <PLChart entries={HISTORY} isCountSpelledOut />
          </View>
        </Reveal>
        <Reveal
          shown={inView}
          delay={140}
          style={[
            styles.cell,
            styles.cellQr,
            isWide && styles.cellFlex,
            { backgroundColor: c.card, borderColor: c.blueBorder },
            panel(signal, signal.glowBlue, '100% 0%'),
          ]}>
          <IconTile name="qr-code" hue={c.blue} size={44} />
          <Text role="heading" aria-level={3} style={[styles.cellTitle, { color: c.text }]}>
            Your regulars, one scan away
          </Text>
          <Text style={[text.body, { color: c.textMuted }]}>
            Add friends with a QR code, keep groups for each table, and settle the leaderboard argument.
          </Text>
          <GroupBoard c={c} signal={signal} />
        </Reveal>
      </View>
      <Reveal
        shown={inView}
        delay={260}
        style={[
          styles.cell,
          styles.band,
          isWide && styles.bandWide,
          signal.dark
            ? [{ backgroundColor: c.cardAlt, borderColor: c.accentBorder }, panel(signal, signal.glowGold, '100% 100%')]
            : [
                { backgroundColor: c.card, borderColor: c.accentBorder },
                web({
                  backgroundImage: `radial-gradient(70% 120% at 0% 0%, ${tint(c.accent, 0.24)} 0%, ${tint(c.accent, 0)} 70%), radial-gradient(60% 100% at 100% 100%, ${tint(c.borderBlue, 0.1)} 0%, ${tint(c.borderBlue, 0)} 70%)`,
                  boxShadow: `0 1px 2px ${tint(c.borderAccent, 0.06)}, 0 14px 36px -20px ${tint(c.borderAccent, 0.3)}`,
                }),
              ],
        ]}>
        <View style={[styles.bandText, isWide && styles.bandTextWide]}>
          <View style={styles.eyebrowRow}>
            <IconTile name="shield-check" hue={c.accentText} size={32} />
            <Text style={[styles.eyebrow, { color: c.accentText }]}>RECORDS ONLY</Text>
          </View>
          <Text role="heading" aria-level={3} style={[styles.bandTitle, isWide && styles.bandTitleWide, { color: c.text }]}>
            We keep the score, not the money.
          </Text>
          <Text style={[text.body, { color: c.textMuted }]}>
            Nonsense works out who pays whom. Paying up stays between friends.
          </Text>
          <View role="list" style={styles.promises}>
            {PROMISES.map((line) => (
              <View key={line} role="listitem" style={styles.promise}>
                <Icon
                  name="check-circle"
                  size={18}
                  color={c.profit}
                  weight="duotone"
                  duotoneOpacity={0.3}
                  importantForAccessibility="no"
                />
                <Text style={[styles.promiseText, { color: c.textSecondary }]}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
        <SettleReceipt c={c} signal={signal} isWide={isWide} />
      </Reveal>
    </View>
  );
}

function BentoSection({ c, isWide, signal, container }: SectionProps) {
  return (
    <View style={[container, styles.block, isWide && styles.blockWide]}>
      <SectionHeading
        c={c}
        icon="trophy-outline"
        hue={c.blue}
        label="After the game"
        title="Long after the last hand"
        intro="Your history, your regulars and a clean settle-up, kept for every game."
        isWide={isWide}
      />
      <Bento c={c} isWide={isWide} signal={signal} />
    </View>
  );
}

function FaqSection({ c, isWide, signal, container }: SectionProps) {
  return (
    <View nativeID="faq" style={[container, styles.block, isWide && styles.blockWide, styles.faqBlock]}>
      <View style={styles.faqHead}>
        <SectionHeading
          c={c}
          icon="question"
          hue={c.profit}
          label="FAQ"
          title="Questions before the first deal"
          intro={
            <>
              Can’t find your answer?{' '}
              <Text
                role="link"
                {...({ href: '/contact', dataSet: { textLink: 'true' } } as object)}
                style={{ color: c.accentText }}>
                Contact us
              </Text>
              .
            </>
          }
          isWide={isWide}
          centered
        />
      </View>
      <LandingFaq c={c} isWide={isWide} dark={signal.dark} rule={signal.rule} />
    </View>
  );
}

type FanCard = { rank: string; suit: Suit };
const LEFT_HAND: FanCard[] = [
  { rank: 'A', suit: 'spade' },
  { rank: 'K', suit: 'spade' },
];
const RIGHT_HAND: FanCard[] = [
  { rank: 'Q', suit: 'spade' },
  { rank: 'J', suit: 'spade' },
  { rank: '10', suit: 'spade' },
];

/** A fanned hand peeking up from a bottom corner of the closer card (together: a royal flush). */
function Fan({ cards, side, width }: { cards: FanCard[]; side: 'left' | 'right'; width: number }) {
  const step = width * 0.42;
  const tilt = 14;
  const spread = cards.length - 1;
  return (
    <View
      aria-hidden
      style={[
        styles.fan,
        { width: width + step * spread, height: width * 1.4, bottom: -width * 0.18, [side]: width * 0.45 },
      ]}>
      {cards.map((card, i) => {
        // Left hand leans left, right hand leans right; the outermost card leans most.
        const lean = side === 'left' ? -(spread - i) * tilt - 8 : i * tilt + 8;
        return (
          <PlayingCard
            key={card.rank}
            rank={card.rank}
            suit={card.suit}
            width={width}
            style={[styles.fanCard, { left: i * step, transform: [{ rotate: `${lean}deg` }] }]}
          />
        );
      })}
    </View>
  );
}

function Closer({ c, isWide, signal, container }: SectionProps) {
  const [ref, inView] = useInView();
  const field = signal.dark
    ? web({
        backgroundImage: [
          `radial-gradient(38% 70% at 50% 100%, ${tint(signal.gold, 0.26)} 0%, ${tint(signal.gold, 0)} 70%)`,
          `radial-gradient(45% 80% at 0% 0%, ${tint(signal.gold, 0.14)} 0%, ${tint(signal.gold, 0)} 70%)`,
          `radial-gradient(45% 80% at 100% 100%, ${tint(signal.blue, 0.16)} 0%, ${tint(signal.blue, 0)} 70%)`,
        ].join(', '),
        boxShadow: `inset 0 1px 0 ${tint(signal.gold, 0.25)}`,
      })
    : web({
        // Warm gold card: a white sheen under the heading, a deeper gold pool behind the CTA, a faint blue corner.
        backgroundImage: [
          `radial-gradient(closest-side at 50% 0%, ${tint(c.card, 0.75)} 0%, ${tint(c.card, 0)} 100%)`,
          `radial-gradient(40% 70% at 50% 100%, ${tint(c.accent, 0.28)} 0%, ${tint(c.accent, 0)} 72%)`,
          `radial-gradient(40% 70% at 100% 100%, ${tint(signal.blue, 0.08)} 0%, ${tint(signal.blue, 0)} 70%)`,
        ].join(', '),
        boxShadow: `inset 0 1px 0 ${tint(c.card, 0.8)}, 0 24px 56px -28px ${tint(c.borderAccent, 0.4)}`,
      });
  const surface = signal.dark ? c.card : c.accentBg;
  return (
    <View style={[container, styles.block, isWide && styles.blockWide]}>
      <View
        ref={ref}
        style={[styles.closer, isWide && styles.closerWide, { backgroundColor: surface, borderColor: c.accentBorder }, field]}>
        <Fan cards={LEFT_HAND} side="left" width={isWide ? 108 : 56} />
        <Fan cards={RIGHT_HAND} side="right" width={isWide ? 108 : 56} />
        <Reveal shown={inView} style={styles.closerCopy}>
          <Text role="heading" aria-level={2} style={[styles.closerTitle, isWide && styles.closerTitleWide, { color: c.text }]}>
            Bring it to your next game.
          </Text>
          <Text style={[styles.lede, styles.center, { color: c.textSecondary }]}>
            Free to use. Sign in with Google or email and start a session.
          </Text>
        </Reveal>
        <Reveal shown={inView} delay={180} style={styles.converge}>
          <CtaButton c={c} />
        </Reveal>
      </View>
    </View>
  );
}




export function LandingPage() {
  const c = useAppColors();
  const scheme = useResolvedColorScheme();
  const { gutter, width } = useBreakpoint();
  const hydrated = useHydrated();
  const isWide = hydrated && width >= WIDE_BREAKPOINT;
  const dark = scheme === 'dark';
  const signal = signalFor(c, dark);
  const logo = siteLogo(dark);
  const container = [chromeStyles.container, { paddingHorizontal: gutter }];
  const section = { c, isWide, signal, container };

  return (
    <ScrollView
      key={hydrated ? 'client' : 'static'}
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ flexGrow: 1 }}>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
      </Head>
      <SkipLink c={c} />
      <CardRain dark={dark} />
      {/* Everything else stacks above the card rain. */}
      <View style={styles.aboveRain}>
        <LandingHero
          c={c}
          dark={dark}
          isWide={isWide}
          cta={<CtaButton c={c} />}
          nav={<SiteNav c={c} logo={logo} container={container} />}
        />

        <View style={styles.main}>
          <View nativeID="content" {...({ tabIndex: -1 } as object)} style={[container, styles.section]}>
            <LandingShowcase c={c} isWide={isWide} cta={<CtaButton c={c} />} />
          </View>
          <TimelineSection {...section} />
          <BentoSection {...section} />
          <FaqSection {...section} />
          <Closer {...section} />
        </View>

        <SiteFooter c={c} isWide={isWide} logo={logo} rule={signal.rule} container={container} cta={false} />
      </View>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  faqBlock: { alignItems: 'center' },
  faqHead: { alignItems: 'center', gap: 12, marginBottom: 24, maxWidth: 640 },
  main: { width: '100%' },
  aboveRain: { flexGrow: 1, zIndex: 1 },
  fan: { position: 'absolute' },
  fanCard: { position: 'absolute', bottom: 0 },
  hidden: { opacity: 0 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    minHeight: 52,
    borderRadius: radius.pill,
  },
  section: { gap: 32, paddingVertical: 48 },

  block: { gap: space.xxl, paddingVertical: 40 },
  blockWide: { gap: 48, paddingVertical: 88 },
  lede: { fontSize: 18, lineHeight: 28, maxWidth: 520 },
  center: { textAlign: 'center' },

  timeline: { position: 'relative', gap: space.xxl },
  timelineWide: { flexDirection: 'row', gap: space.xl },
  rail: { position: 'absolute' },
  railHorizontal: { left: 20, right: 0, top: 19, height: 2 },
  railVertical: { left: 19, top: 20, bottom: 0, width: 2 },
  moment: { flexDirection: 'row', gap: space.lg },
  momentWide: { flex: 1, flexDirection: 'column', gap: space.lg },
  nodeSlot: { width: 40, height: 40 },
  node: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeLit: { position: 'absolute', top: 0, left: 0 },
  momentText: { flex: 1, gap: space.xs, paddingTop: space.sm },
  time: { fontSize: 14, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  momentTitle: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },

  bento: { gap: space.lg },
  bentoRow: { gap: space.lg },
  bentoRowWide: { flexDirection: 'row', alignItems: 'stretch' },
  cell: { borderRadius: radius.lg, borderWidth: 1, padding: space.xl, gap: space.md, overflow: 'hidden' },
  cellChart: { flex: 1.7 },
  cellFlex: { flex: 1 },
  cellQr: { gap: space.md },
  // Sits right under the text; the fifth player fills the height the chart card sets beside it.
  board: { marginTop: space.xs, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.lg, paddingBottom: space.xs },
  boardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: space.md },
  boardTitle: { fontSize: 15, fontWeight: '700' },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderTopWidth: 1 },
  boardRank: { width: 14, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  boardName: { flex: 1, fontSize: 15, fontWeight: '600' },
  boardNet: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  cellChartPad: { paddingBottom: space.lg },
  chart: { marginTop: space.xs, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  cellTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3 },
  band: { gap: space.lg },
  bandWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xxl * 2, padding: space.xxl },
  bandText: { gap: space.sm },
  bandTextWide: { flex: 1, maxWidth: 560 },
  eyebrow: { fontSize: 13, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bandTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5 },
  bandTitleWide: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  promises: { gap: space.sm, marginTop: space.sm },
  promise: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  promiseText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  receipt: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm },
  receiptWide: { width: 400, flexShrink: 0 },
  receiptHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: space.xs },
  receiptTitle: { fontSize: 15, fontWeight: '700' },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1 },
  receiptName: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  receiptGrow: { flex: 1 },
  receiptAmount: { fontSize: 15, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  receiptTotal: { flexDirection: 'row', alignItems: 'center', paddingTop: space.md, borderTopWidth: 1 },

  faqWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 64 },
  faqAside: { width: 340 },
  faqList: { flex: 1 },
  asideLink: { fontSize: 16, lineHeight: 44, fontWeight: '600', alignSelf: 'flex-start' },

  closer: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 48,
    paddingHorizontal: space.xl,
    gap: space.xxl,
    alignItems: 'center',
    overflow: 'hidden',
  },
  closerWide: { paddingVertical: 72, paddingHorizontal: 48 },
  closerCopy: { gap: space.md, alignItems: 'center', zIndex: 1 },
  closerTitle: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1, textAlign: 'center' },
  closerTitleWide: { fontSize: 48, lineHeight: 54, letterSpacing: -1.6 },
  converge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', gap: space.md, zIndex: 1 },

  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl },
});
