import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useAppColors } from '@/lib/app-theme';
import { contentMaxWidth } from '@/lib/spacing';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

export function WebAppFrame({ children }: { children: ReactNode }) {
  const c = useAppColors();
  if (Platform.OS !== 'web') return <>{children}</>;

  return <View style={[styles.fill, { backgroundColor: c.bg }]}>{children}</View>;
}

export function WebContentColumn({ children }: { children: ReactNode; besideSidebar?: boolean }) {
  const c = useAppColors();
  const { isMd } = useBreakpoint();
  if (!isMd) return <>{children}</>;

  return (
    <View style={[styles.fill, styles.page, { backgroundColor: c.bg }]}>
      <View style={[styles.fill, styles.column, { backgroundColor: c.bg }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  page: {
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: contentMaxWidth,
    overflow: 'hidden',
  },
});
