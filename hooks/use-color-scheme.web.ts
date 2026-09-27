import { useContext, useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { ThemePreferenceContext } from '@/lib/theme-context';

const subscribeNoop = () => () => {};

export function useColorScheme(): 'light' | 'dark' | null {
  const hasHydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const ctx = useContext(ThemePreferenceContext);
  const system = useRNColorScheme();

  if (!hasHydrated) {
    return 'light';
  }
  if (ctx) {
    return ctx.resolvedColorScheme;
  }
  return system === 'light' || system === 'dark' ? system : null;
}
