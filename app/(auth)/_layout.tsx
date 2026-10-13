import { ThemeToggle } from '@/components/web/site-chrome';
import { useAppColors } from '@/lib/app-theme';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOGGLE_INSET = 12;

export default function AuthLayout() {
  const c = useAppColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false }} />
      <View style={[styles.toggle, { top: insets.top + TOGGLE_INSET, right: insets.right + 16 }]}>
        <ThemeToggle c={c} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, toggle: { position: 'absolute' } });
