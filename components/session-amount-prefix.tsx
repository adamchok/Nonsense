import type { SessionAmountUnit } from '@/types';
import { Icon } from '@/components/icon';
import { StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

type Props = {
  unit: SessionAmountUnit;
  color: string;
  /** Roughly match adjacent `$` text size (e.g. 18 in buy-in rows, 16 in blinds modal). */
  size?: number;
  style?: StyleProp<TextStyle & ViewStyle>;
};

/**
 * Cash: `$`. Chips: Phosphor PokerChip (SVG) via the shared `Icon`.
 */
export function SessionAmountPrefix({ unit, color, size = 20, style }: Props) {
  if (unit === 'cash') {
    return <Text style={[styles.dollar, { color, fontSize: size }, style]}>$</Text>;
  }
  return (
    <Icon name="poker-chip" size={size} color={color} style={style} accessibilityLabel="chips" />
  );
}

const styles = StyleSheet.create({
  dollar: {
    fontWeight: '600',
  },
});
