import { useContext } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { ThemePreferenceContext } from '@/lib/theme-context';

export function useColorScheme(): 'light' | 'dark' | null {
  const ctx = useContext(ThemePreferenceContext);
  const system = useRNColorScheme();
  if (ctx) {
    return ctx.resolvedColorScheme;
  }
  return system === 'light' || system === 'dark' ? system : null;
}
