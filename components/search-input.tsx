import { Icon } from '@/components/icon';
import { Animated, PressableScale, fadeIn, fadeOut } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

type Props = Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
};

/**
 * Text field with a leading search icon and a clear button once something is typed. The icon
 * and button sit over the input's padding, so the input itself stays the full-width field
 * (its border and the web focus ring wrap the whole thing).
 */
export function SearchInput({ value, onChangeText, ...inputProps }: Props) {
  const c = useAppColors();
  return (
    <View style={styles.wrap}>
      <TextInput
        {...inputProps}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={c.placeholder}
        style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
      />
      <View style={styles.leading} pointerEvents="none">
        <Icon name="search" size={18} color={c.textMuted} importantForAccessibility="no" />
      </View>
      {value ? (
        <Animated.View entering={fadeIn} exiting={fadeOut} style={styles.clear}>
          <PressableScale
            onPress={() => onChangeText('')}
            hitSlop={6}
            pressedScale={0.9}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={styles.clearButton}>
            <Icon name="close" size={16} color={c.textMuted} />
          </PressableScale>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    fontSize: 15,
    paddingVertical: 12,
    paddingLeft: 42,
    paddingRight: 44,
  },
  leading: {
    position: 'absolute',
    left: 14,
  },
  clear: {
    position: 'absolute',
    right: 8,
  },
  clearButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
