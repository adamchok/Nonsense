import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useAppColors } from '@/lib/app-theme';
import { contentMaxWidth } from '@/lib/spacing';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/**
 * Web root: a full-bleed, themed surface so the page never flashes the browser's default
 * white behind the navigator. Phones use the whole width; the tablet/desktop shell
 * (sidebar + centred column) is laid out by the navigators, not here. Native renders its
 * children untouched.
 */
export function WebAppFrame({ children }: { children: ReactNode }) {
  const c = useAppColors();
  if (Platform.OS !== 'web') return <>{children}</>;

  return <View style={[styles.fill, { backgroundColor: c.bg }]}>{children}</View>;
}

/**
 * Screen wrapper used as a navigator `screenLayout` on web: from BREAKPOINT_MD up it
 * centres the screen in a `contentMaxWidth` column. The page background runs full width in
 * the same colour, so wide screens show no side bars — only the content is capped.
 * Anything the screen positions absolutely (undo snackbar, voice banner) stays inside
 * the column. Below the breakpoint, and on native, it's a pass-through.
 */
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
