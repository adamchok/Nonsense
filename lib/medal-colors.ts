import type { AppColors } from '@/lib/app-theme';

// Gold reuses the app accent; silver/bronze get darker shades in light mode so they stay readable.
const MEDALS_DARK = ['', '#c3cad6', '#c98a5a'];
const MEDALS_LIGHT = ['', '#64748b', '#9a5b2e'];

/** Gold / silver / bronze for podium places 0-2, null below third. */
export function medalColor(rank: number, c: AppColors, isDark: boolean): string | null {
  if (rank === 0) return c.accent;
  if (rank < 0 || rank > 2) return null;
  return (isDark ? MEDALS_DARK : MEDALS_LIGHT)[rank];
}
