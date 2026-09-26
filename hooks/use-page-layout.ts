import { BREAKPOINT_MD, gutterFor, sectionGapFor } from '@/lib/spacing';
import { Platform, useWindowDimensions } from 'react-native';

export function usePageLayout(baseBottom = 32) {
  const { width } = useWindowDimensions();
  const gutter = gutterFor(width);
  const sectionGap = sectionGapFor(width);
  const isMd = width >= BREAKPOINT_MD;
  const compactTop = Platform.OS === 'web' && !isMd ? { paddingTop: gutter } : null;
  return {
    gutter,
    sectionGap,
    isMd,
    compactTop,
    content: {
      paddingHorizontal: gutter,
      paddingTop: gutter,
      paddingBottom: Math.max(baseBottom, isMd ? 64 : 0),
      gap: sectionGap,
    },
  };
}
