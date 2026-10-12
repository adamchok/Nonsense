import { formatSessionDay } from '@/components/session/session-title';
import { useAppColors } from '@/lib/app-theme';
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

const DOT_GAP = 8;

export function MetaDot({ color, size = 4 }: { color?: string; size?: number }) {
  const c = useAppColors();
  return (
    <View
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? c.textHint }]}
    />
  );
}

type Part = ReactNode | false | null | undefined;

type MetaLineProps = {
  parts: Part[];
  textStyle?: StyleProp<TextStyle>;
  dotColor?: string;
  dotSize?: number;
  style?: StyleProp<ViewStyle>;
  wrap?: boolean;
};

export function MetaLine({ parts, textStyle, dotColor, dotSize, style, wrap = false }: MetaLineProps) {
  const shown = parts.filter((p) => p !== false && p !== null && p !== undefined && p !== '');
  return (
    <View style={[styles.row, wrap && styles.wrap, style]}>
      {shown.map((part, i) => {
        const isLast = i === shown.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 ? <MetaDot color={dotColor} size={dotSize} /> : null}
            {typeof part === 'string' || typeof part === 'number' ? (
              <Text
                style={[textStyle, isLast && !wrap ? styles.shrink : styles.noShrink]}
                numberOfLines={wrap ? undefined : 1}>
                {part}
              </Text>
            ) : (
              part
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

export function SessionTitle({
  date,
  location,
  textStyle,
  dotSize = 5,
  style,
  wrap,
}: {
  date: Date;
  location?: string | null;
  textStyle?: StyleProp<TextStyle>;
  dotSize?: number;
  style?: StyleProp<ViewStyle>;
  wrap?: boolean;
}) {
  return (
    <MetaLine
      parts={[formatSessionDay(date), location?.trim()]}
      textStyle={textStyle}
      dotSize={dotSize}
      style={style}
      wrap={wrap}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  dot: {
    marginHorizontal: DOT_GAP,
    flexShrink: 0,
  },
  wrap: {
    flexWrap: 'wrap',
    rowGap: 2,
  },
  shrink: {
    flexShrink: 1,
  },
  noShrink: {
    flexShrink: 0,
  },
});
