/**
 * Layout, spacing and motion tokens (ported from the Member Center v2 spec).
 * Mobile first: base values are for phones; `md` applies from BREAKPOINT_MD up.
 */
export const BREAKPOINT_SM = 480;
export const BREAKPOINT_MD = 768;
/** Below this width, modals (filters, confirmations) open as bottom sheets. */
export const SHEET_BREAKPOINT = 600;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Horizontal page padding: 16 (<480), 20 (480+), 24 (768+). */
export function gutterFor(width: number): number {
  if (width >= BREAKPOINT_MD) return 24;
  if (width >= BREAKPOINT_SM) return 20;
  return 16;
}

/** Vertical gap between page sections: 24, 32 from 768. */
export function sectionGapFor(width: number): number {
  return width >= BREAKPOINT_MD ? 32 : 24;
}

export const radius = { xs: 4, sm: 8, tight: 9, md: 14, lg: 20, pill: 999 } as const;

/** Minimum touch target and list row heights. */
export const tapTarget = 44;
export const rowMinHeight = 52;

/** Content column width on tablet/desktop; sidebar width. */
export const contentMaxWidth = 760;
export const sidebarWidth = 238;

export const motion = {
  press: 120,
  control: 180,
  overlay: 240,
  easeOut: 'cubic-bezier(0.23, 1, 0.32, 1)',
} as const;
