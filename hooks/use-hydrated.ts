import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** False during static render and hydration, true afterwards, so width- and theme-dependent web layouts don't keep the pre-rendered HTML's values. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
