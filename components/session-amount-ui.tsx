import { SessionAmountPrefix } from '@/components/session-amount-prefix';
import { formatSessionAmountValue, type SessionAmountValueStyle } from '@/lib/currency-format';
import type { SessionAmountUnit } from '@/types';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, TextStyle, ViewStyle } from 'react-native';

type SessionAmountDisplayProps = {
  value: number;
  unit: SessionAmountUnit;
  color: string;
  iconSize: number;
  valueStyle?: SessionAmountValueStyle;
  textStyle?: StyleProp<TextStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  numberOfLines?: number;
};

/** Read-only amount: chip icon + ledger/compact string in chip mode; formatted cash otherwise. */
export function SessionAmountDisplay({
  value,
  unit,
  color,
  iconSize,
  valueStyle = 'ledger',
  textStyle,
  rowStyle,
  numberOfLines,
}: SessionAmountDisplayProps) {
  const formatted = formatSessionAmountValue(value, unit, valueStyle);
  if (unit === 'chips') {
    return (
      <View style={[styles.inlineRow, rowStyle]}>
        <SessionAmountPrefix unit="chips" color={color} size={iconSize} />
        <Text style={textStyle} numberOfLines={numberOfLines}>
          {formatted}
        </Text>
      </View>
    );
  }
  return (
    <Text style={textStyle} numberOfLines={numberOfLines}>
      {formatted}
    </Text>
  );
}

type SessionAmountInputRowProps = {
  unit: SessionAmountUnit;
  color: string;
  iconSize: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Prefix ($ or poker chip) + input (or any trailing child) in a row. */
export function SessionAmountInputRow({ unit, color, iconSize, children, style }: SessionAmountInputRowProps) {
  return (
    <View style={[styles.inlineRow, style]}>
      <SessionAmountPrefix unit={unit} color={color} size={iconSize} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
