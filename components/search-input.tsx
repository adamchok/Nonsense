import { pointer } from '@/lib/ui';
import { Icon } from '@/components/icon';
import { Animated, PressableScale, fadeIn, fadeOut } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

type Props = Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
};

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
      <View style={[styles.leading, pointer.none]}>
        <Icon name="search" size={16} color={c.textMuted} importantForAccessibility="no" />
      </View>
      {value ? (
        <Animated.View entering={fadeIn} exiting={fadeOut} style={styles.clear}>
          <PressableScale
            onPress={() => onChangeText('')}
            hitSlop={6}
            pressedScale={0.9}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            {...({ dataSet: { hoverDot: 'true' } } as object)}
            style={styles.clearButton}>
            <View style={styles.clearDot}>
              <Icon name="close" size={16} color={c.textMuted} />
            </View>
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
    minHeight: 44,
    borderRadius: 9,
    borderWidth: 1,
    fontSize: 15,
    paddingVertical: 10,
    paddingLeft: 38,
    paddingRight: 48,
  },
  clearDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leading: {
    position: 'absolute',
    left: 13,
  },
  clear: {
    position: 'absolute',
    right: 2,
  },
  clearButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
