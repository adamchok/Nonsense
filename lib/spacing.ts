export const BREAKPOINT_SM = 480;
export const BREAKPOINT_MD = 768;
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

export function gutterFor(width: number): number {
  if (width >= BREAKPOINT_MD) return 24;
  if (width >= BREAKPOINT_SM) return 20;
  return 16;
}

export function sectionGapFor(width: number): number {
  return width >= BREAKPOINT_MD ? 32 : 24;
}

export const radius = { xs: 4, sm: 8, tight: 9, md: 14, lg: 20, pill: 999 } as const;

export const tapTarget = 44;
export const rowMinHeight = 52;

export const contentMaxWidth = 760;
export const sidebarWidth = 238;

export const motion = {
  press: 120,
  control: 180,
  overlay: 240,
  easeOut: 'cubic-bezier(0.23, 1, 0.32, 1)',
} as const;
