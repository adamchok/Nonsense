import { useContext, useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { ThemePreferenceContext } from '@/lib/theme-context';

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
