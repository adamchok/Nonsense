import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  colors: readonly string[];
  count?: number;
};

type Piece = {
  x: number;
  drift: number;
  fall: number;
  spin: number;
  delay: number;
  duration: number;
  size: number;
  round: boolean;
  color: string;
};

const DEFAULT_COUNT = 18;
const MAX_DELAY_MS = 220;
const BASE_DURATION_MS = 950;
const DURATION_JITTER_MS = 350;
const LIFETIME_MS = MAX_DELAY_MS + BASE_DURATION_MS + DURATION_JITTER_MS + 100;

function noise(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function buildPieces(count: number, width: number, height: number, colors: readonly string[]): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const round = i % 3 === 0;
    return {
      x: noise(i, 1) * width,
      drift: (noise(i, 2) - 0.5) * 80,
      fall: height * (0.45 + noise(i, 3) * 0.3),
      spin: (noise(i, 4) - 0.5) * 720,
      delay: noise(i, 5) * MAX_DELAY_MS,
      duration: BASE_DURATION_MS + noise(i, 6) * DURATION_JITTER_MS,
      size: round ? 8 + noise(i, 7) * 3 : 6 + noise(i, 7) * 3,
      round,
      color: colors[i % colors.length] ?? '#e0b24a',
    };
  });
}

function ConfettiPiece({ piece }: { piece: Piece }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, {
        duration: piece.duration,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      })
    );
  }, [piece.delay, piece.duration, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p < 0.7 ? 1 : Math.max(0, (1 - p) / 0.3),
      transform: [
        { translateX: piece.drift * p },
        { translateY: -16 + piece.fall * p },
        { rotate: `${piece.spin * p}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: piece.x,
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 1.6,
          borderRadius: piece.round ? piece.size / 2 : 1.5,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

export function ConfettiBurst({ colors, count = DEFAULT_COUNT }: Props) {
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [done, setDone] = useState(false);
  const [size] = useState({ width, height });
  const pieces = useMemo(
    () => buildPieces(count, size.width, size.height, colors),
    [count, size, colors]
  );

  useEffect(() => {
    const t = setTimeout(() => setDone(true), LIFETIME_MS);
    return () => clearTimeout(t);
  }, []);

  if (reduceMotion || done) return null;

  return (
    <View style={styles.layer} aria-hidden>
      {pieces.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  piece: {
    position: 'absolute',
    top: 0,
  },
});
