import { BREAKPOINT_MD, gutterFor, sectionGapFor } from '@/lib/spacing';
import { useWindowDimensions } from 'react-native';

/** Page padding per the spacing spec: gutter sides, sectionGap between sections, 64 bottom on md+. */
export function usePageLayout(baseBottom = 32) {
  const { width } = useWindowDimensions();
  const gutter = gutterFor(width);
  const sectionGap = sectionGapFor(width);
  const isMd = width >= BREAKPOINT_MD;
  return {
    gutter,
    sectionGap,
    isMd,
    content: {
      paddingHorizontal: gutter,
      paddingTop: gutter,
      paddingBottom: Math.max(baseBottom, isMd ? 64 : 0),
      gap: sectionGap,
    },
  };
}
