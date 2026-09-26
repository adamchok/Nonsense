import { useAppColors } from '@/lib/app-theme';
import { useThemePreference } from '@/lib/theme-context';
import { scrim } from '@/lib/ui';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

const BLUR_INTENSITY = 24;

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
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} />
    </Pressable>
  );
}
