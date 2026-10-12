import { Icon, type IconName } from '@/components/icon';
import { pointer } from '@/lib/ui';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';

export type Suit = 'spade' | 'heart' | 'diamond' | 'club';

const CARD_RED = '#c8102e';
const CARD_BLACK = '#1e293b';
const CARD_PAPER = '#fffdf8';
const CHIP_INSERT = '#fffdf8';
const SUIT_ICON: Record<Suit, IconName> = {
  spade: 'suit-spade',
  heart: 'suit-heart',
  diamond: 'suit-diamond',
  club: 'suit-club',
};

function web(style: Record<string, unknown>): ViewStyle {
  return style as unknown as ViewStyle;
}

export function PlayingCard({
  rank,
  suit,
  width,
  style,
}: {
  rank: string;
  suit: Suit;
  width: number;
  style?: StyleProp<ViewStyle>;
}) {
  const ink = suit === 'heart' || suit === 'diamond' ? CARD_RED : CARD_BLACK;
  const corner = Math.max(10, Math.round(width * 0.2));
  const corners = (flip: boolean) => (
    <View style={[flip ? styles.cornerBottomRight : styles.cornerTopLeft, { padding: width * 0.07 }]}>
      <Text style={{ color: ink, fontSize: corner, lineHeight: corner * 1.05, fontWeight: '800' }}>{rank}</Text>
      <Icon name={SUIT_ICON[suit]} size={Math.round(corner * 0.8)} color={ink} weight="fill" />
    </View>
  );
  return (
    <View
      style={[
        styles.card,
        { width, height: Math.round(width * 1.4), borderRadius: Math.round(width * 0.09) },
        web({ boxShadow: '0 1px 2px rgba(15,23,42,0.08), 0 10px 24px -12px rgba(15,23,42,0.25)' }),
        style,
      ]}>
      {corners(false)}
      <Icon name={SUIT_ICON[suit]} size={Math.round(width * 0.42)} color={ink} weight="fill" />
      {corners(true)}
    </View>
  );
}

export function PokerChip({ size, color }: { size: number; color: string }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2 }, web({ boxShadow: '0 6px 14px -8px rgba(15,23,42,0.45)' })]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={50} fill={color} />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <Rect key={deg} x={42} y={1} width={16} height={17} rx={3} fill={CHIP_INSERT} transform={`rotate(${deg} 50 50)`} />
        ))}
        <Circle cx={50} cy={50} r={48.5} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={3} />
        <Circle cx={50} cy={50} r={31} fill={color} stroke={CHIP_INSERT} strokeWidth={4} />
        <Circle cx={50} cy={50} r={24} fill="none" stroke={CHIP_INSERT} strokeWidth={2} strokeDasharray="5 4" opacity={0.8} />
      </Svg>
    </View>
  );
}

const CHIP_COLORS = ['#c8102e', '#1d4ed8', '#1e293b', '#d4a017', '#047857'];
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
const SUITS: Suit[] = ['spade', 'heart', 'diamond', 'club'];
const PIECES = 100;
const NEAR_SPEED = 46;
const FAR_SPEED = 30;
const HEIGHT_STEP = 200;

type Drop = {
  kind: 'card' | 'chip';
  rank: string;
  suit: Suit;
  chipColor: string;
  left: number;
  size: number;
  pace: number;
  phase: number;
  spin: number;
  drift: number;
  far: boolean;
};

function seeded(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

const DROPS: Drop[] = (() => {
  const rand = seeded(7);
  return Array.from({ length: PIECES }, (_, i) => {
    const kind = i % 3 === 2 ? 'chip' : 'card';
    const far = i % 2 === 1;
    const size =
      kind === 'card'
        ? Math.round(far ? 50 + rand() * 14 : 72 + rand() * 22)
        : Math.round(far ? 24 + rand() * 8 : 34 + rand() * 12);
    return {
      kind,
      rank: RANKS[i % RANKS.length],
      suit: SUITS[(i * 3) % SUITS.length],
      chipColor: CHIP_COLORS[i % CHIP_COLORS.length],
      left: ((0.5 + i * 0.7548777) % 1) * 96,
      size,
      pace: 0.85 + rand() * 0.3,
      phase: (0.5 + i * 0.5698403) % 1,
      spin: Math.round((rand() * 2 - 1) * 540),
      drift: Math.round((rand() * 2 - 1) * 70),
      far,
    };
  });
})();

function compileFalls(height: number) {
  return StyleSheet.create(
    Object.fromEntries(
      DROPS.map((d, i) => {
        const travel = height + 300;
        const duration = travel / ((d.far ? FAR_SPEED : NEAR_SPEED) * d.pace);
        return [
          `drop${i}`,
          web({
            animationKeyframes: [
              {
                '0%': { transform: 'translateY(-200px) translateX(0px) rotate(0deg)' },
                '100%': { transform: `translateY(${height + 100}px) translateX(${d.drift}px) rotate(${d.spin}deg)` },
              },
            ],
            animationDuration: `${Math.round(duration)}s`,
            animationDelay: `${-Math.round(d.phase * duration)}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
          }),
        ];
      }),
    ),
  );
}

export function CardRain({ dark }: { dark: boolean }) {
  const reduceMotion = useReducedMotion();
  const [height, setHeight] = useState(0);
  const falls = useMemo(() => (height > 0 ? compileFalls(height) : null), [height]);
  const near = dark ? 0.1 : 0.18;
  const far = dark ? 0.06 : 0.11;
  return (
    <View
      aria-hidden
      style={[styles.rain, pointer.none]}
      onLayout={(e) => setHeight(Math.ceil(e.nativeEvent.layout.height / HEIGHT_STEP) * HEIGHT_STEP)}>
      {DROPS.map((d, i) => {
        const fall =
          reduceMotion || !falls
            ? { top: `${d.phase * 96}%` as const, transform: [{ rotate: `${d.spin / 4}deg` }] }
            : falls[`drop${i}`];
        return (
          <View key={i} style={[styles.drop, { left: `${d.left}%`, opacity: d.far ? far : near }, fall]}>
            {d.kind === 'card' ? (
              <PlayingCard rank={d.rank} suit={d.suit} width={d.size} />
            ) : (
              <PokerChip size={d.size} color={d.chipColor} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_PAPER,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cornerTopLeft: { position: 'absolute', top: 0, left: 0, alignItems: 'center' },
  cornerBottomRight: { position: 'absolute', bottom: 0, right: 0, alignItems: 'center', transform: [{ rotate: '180deg' }] },
  rain: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 0 },
  drop: { position: 'absolute', top: 0 },
});
