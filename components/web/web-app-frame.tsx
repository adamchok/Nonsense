import { useAppColors } from '@/lib/app-theme';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

/** Widest the app column gets on web; phone-sized so the phone layout never stretches. */
export const WEB_APP_MAX_WIDTH = 480;

/**
 * On web, confines the whole app to a centred phone-width column (the page outside it
 * shows the themed background). On native it renders its children untouched.
 *
 * Everything positioned inside the navigator (tab bar, snackbars, voice banner) is laid
 * out against this column. RN `Modal` renders into a body-level portal on web, so modal
 * overlays still span the viewport; their cards are centred, which lines them up with
 * the column anyway.
 */
export function WebAppFrame({ children }: { children: ReactNode }) {
  const c = useAppColors();
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web') return <>{children}</>;

  // Edges only once the viewport is wider than the column; on a phone they'd hug the screen.
  const framed = width > WEB_APP_MAX_WIDTH;

  return (
    <View style={[styles.page, { backgroundColor: c.bg }]}>
      <View style={[styles.column, { backgroundColor: c.bg }, framed && { ...styles.framed, borderColor: c.border }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_APP_MAX_WIDTH,
    overflow: 'hidden',
  },
  framed: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
});
