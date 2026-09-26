import { Platform, useWindowDimensions } from 'react-native';

import { BREAKPOINT_MD, gutterFor, sectionGapFor } from '@/lib/spacing';

export type Breakpoint = {
  /** Current window width in dp/px. */
  width: number;
  /**
   * True for the tablet/desktop web layout (web and width >= BREAKPOINT_MD): sidebar
   * navigation and a centred content column. Always false on native, which keeps the
   * phone layout at any size.
   */
  isMd: boolean;
  /** Horizontal page padding for the current width (see lib/spacing gutterFor). */
  gutter: number;
  /** Vertical gap between page sections for the current width. */
  sectionGap: number;
};

/** Mobile-first responsive values derived from the window width. */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return {
    width,
    isMd: Platform.OS === 'web' && width >= BREAKPOINT_MD,
    gutter: gutterFor(width),
    sectionGap: sectionGapFor(width),
  };
}
