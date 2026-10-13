import { Platform, useWindowDimensions } from 'react-native';

import { BREAKPOINT_MD, SHEET_BREAKPOINT, gutterFor, sectionGapFor } from '@/lib/spacing';

export type Breakpoint = {
  width: number;
  isMd: boolean;
  hasSidebarNav: boolean;
  gutter: number;
  sectionGap: number;
};

export function useBreakpoint(): Breakpoint {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isMd = isWeb && width >= BREAKPOINT_MD;
  const isTablet = !isWeb && width >= BREAKPOINT_MD && Math.min(width, height) >= SHEET_BREAKPOINT;
  return {
    width,
    isMd,
    hasSidebarNav: isMd || isTablet,
    gutter: gutterFor(width),
    sectionGap: sectionGapFor(width),
  };
}
