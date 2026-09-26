import { Platform, useWindowDimensions } from 'react-native';

import { BREAKPOINT_MD, gutterFor, sectionGapFor } from '@/lib/spacing';

export type Breakpoint = {
  width: number;
  isMd: boolean;
  gutter: number;
  sectionGap: number;
};

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return {
    width,
    isMd: Platform.OS === 'web' && width >= BREAKPOINT_MD,
    gutter: gutterFor(width),
    sectionGap: sectionGapFor(width),
  };
}
