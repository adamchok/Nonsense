import { BREAKPOINT_MD, gutterFor, sectionGapFor } from '@/lib/spacing';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Gap between the status bar and a tab screen's first row on native.
const NATIVE_TAB_TOP_GAP = 16;

export function usePageLayout(baseBottom = 32) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutter = gutterFor(width);
  const sectionGap = sectionGapFor(width);
  const isMd = width >= BREAKPOINT_MD;
  // Tab screens have no header, so on native they draw under the (edge-to-edge) status bar.
  const tabTop =
    Platform.OS !== 'web'
      ? { paddingTop: insets.top + NATIVE_TAB_TOP_GAP }
      : !isMd
        ? { paddingTop: gutter }
        : null;
  return {
    gutter,
    sectionGap,
    isMd,
    tabTop,
    content: {
      paddingHorizontal: gutter,
      paddingTop: gutter,
      paddingBottom: Math.max(baseBottom, isMd ? 64 : 0),
      gap: sectionGap,
    },
  };
}
