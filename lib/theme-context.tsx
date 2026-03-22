import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

const STORAGE_KEY = '@nonsense_theme_preference';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  preference: ThemePreference;
  /** Resolved theme for UI (never 'system'). */
  resolvedColorScheme: 'light' | 'dark';
  setPreference: (p: ThemePreference) => Promise<void>;
  isReady: boolean;
};

export const ThemePreferenceContext = createContext<ThemeContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (stored === 'light' || stored === 'dark' || stored === 'system')) {
          setPreferenceState(stored);
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedColorScheme = useMemo((): 'light' | 'dark' => {
    if (preference === 'light') return 'light';
    if (preference === 'dark') return 'dark';
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [preference, systemScheme]);

  const setPreference = useCallback(async (p: ThemePreference) => {
    setPreferenceState(p);
    await AsyncStorage.setItem(STORAGE_KEY, p);
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedColorScheme, setPreference, isReady }),
    [preference, resolvedColorScheme, setPreference, isReady]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) {
    throw new Error('useThemePreference must be used within ThemePreferenceProvider');
  }
  return ctx;
}

/** Resolved light/dark for styling; falls back to system when outside provider. */
export function useResolvedColorScheme(): 'light' | 'dark' {
  const ctx = useContext(ThemePreferenceContext);
  const system = useSystemColorScheme();
  if (ctx) return ctx.resolvedColorScheme;
  return system === 'dark' ? 'dark' : 'light';
}
