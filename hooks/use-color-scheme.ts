import { useContext } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { ThemePreferenceContext } from '@/lib/theme-context';

/** App theme (respects Settings) or system when outside provider. */
export function useColorScheme(): 'light' | 'dark' | null {
  const ctx = useContext(ThemePreferenceContext);
  const system = useRNColorScheme();
  if (ctx) {
    return ctx.resolvedColorScheme;
  }
  return system ?? null;
}
