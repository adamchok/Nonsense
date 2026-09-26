import { useAppColors } from '@/lib/app-theme';
import { useThemePreference } from '@/lib/theme-context';
import { scrim } from '@/lib/ui';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

/** Native blur strength (0-100): enough to push the screen back without losing its shape. */
const BLUR_INTENSITY = 24;

/**
 * Full-screen modal backdrop: blurs and dims what's behind so the dialog holds focus. Web uses
 * a CSS backdrop blur (via scrim); iOS/Android use expo-blur under the dim. Pass onPress to
 * make tapping outside dismiss; it is hidden from screen readers and keyboard focus by default.
 */
export function ModalBackdrop(props: PressableProps) {
  const c = useAppColors();
  const { resolvedColorScheme } = useThemePreference();

  if (Platform.OS === 'web') {
    return <Pressable accessible={false} tabIndex={-1} {...props} style={scrim(c)} />;
  }

  return (
    <Pressable accessible={false} {...props} style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={BLUR_INTENSITY}
        tint={resolvedColorScheme === 'dark' ? 'dark' : 'light'}
        // Android only tints without this (expo-blur's opt-in real blur).
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} />
    </Pressable>
  );
}
