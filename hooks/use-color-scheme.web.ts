import { useContext, useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { ThemePreferenceContext } from '@/lib/theme-context';

/**
 * Web twin of the native hook — same signature and precedence (app theme preference from
 * Settings first, system otherwise). Re-calculates client-side to support static rendering.
 */
export function useColorScheme(): 'light' | 'dark' | null {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const ctx = useContext(ThemePreferenceContext);
  const system = useRNColorScheme();

  if (!hasHydrated) {
    return 'light';
  }
  if (ctx) {
    return ctx.resolvedColorScheme;
  }
  return system ?? null;
}
