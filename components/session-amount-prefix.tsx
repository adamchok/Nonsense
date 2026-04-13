import type { SessionAmountUnit } from '@/types';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  unit: SessionAmountUnit;
  color: string;
  /** Roughly match adjacent `$` text size (e.g. 18 in buy-in rows, 16 in blinds modal). */
  size?: number;
  style?: StyleProp<TextStyle>;
};

/**
 * Cash: `$`. Chips: MDI poker-chip via MaterialCommunityIcons (same icon set as @mdi/js on web).
 * @see https://pictogrammers.com/library/mdi/icon/poker-chip/
 */
export function SessionAmountPrefix({ unit, color, size = 20, style }: Props) {
  if (unit === 'cash') {
    return <Text style={[styles.dollar, { color, fontSize: size }, style]}>$</Text>;
  }
  return <MaterialCommunityIcons name="poker-chip" size={size} color={color} style={style} />;
}

const styles = StyleSheet.create({
  dollar: {
    fontWeight: '600',
  },
});
