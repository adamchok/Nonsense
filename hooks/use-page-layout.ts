import { BREAKPOINT_MD, SHEET_BREAKPOINT, gutterFor, sectionGapFor } from '@/lib/spacing';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NATIVE_TAB_TOP_GAP = 16;
const NATIVE_COLUMN_MAX_WIDTH = 640;

export function usePageLayout(baseBottom = 32) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutter = gutterFor(width);
  const sectionGap = sectionGapFor(width);
  const isMd = width >= BREAKPOINT_MD;
  const isWideNative = Platform.OS !== 'web' && width >= SHEET_BREAKPOINT;
  const column = isWideNative
    ? { width: '100%' as const, maxWidth: NATIVE_COLUMN_MAX_WIDTH, alignSelf: 'center' as const }
    : null;
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
    column,
    content: {
      paddingHorizontal: gutter,
      paddingTop: gutter,
      paddingBottom: Math.max(baseBottom, isMd ? 64 : 0),
      gap: sectionGap,
      ...column,
    },
  };
}
