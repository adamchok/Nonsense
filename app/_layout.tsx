import { WebAppFrame, WebContentColumn } from '@/components/web/web-app-frame';
import { AppAlertProvider } from '@/lib/app-alert';
import { AuthProvider, readSignedInHint, useAuth } from '@/lib/auth-context';
import { ThemePreferenceProvider, useThemePreference } from '@/lib/theme-context';
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { Stack, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore, type ReactElement } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '@/lib/reanimated-setup';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: 'index',
};

const FULL_WIDTH_ROUTES = new Set(['(tabs)', 'index', 'privacy', 'terms', 'contact']);
const PUBLIC_WEB_PATHS = new Set(['/privacy', '/terms', '/contact']);

const webScreenLayout =
  Platform.OS === 'web'
    ? ({ route, children }: { route: { name: string }; children: ReactElement }) =>
        FULL_WIDTH_ROUTES.has(route.name) ? children : <WebContentColumn>{children}</WebContentColumn>
    : undefined;

const IS_WEB = Platform.OS === 'web';

const subscribeNoop = () => () => {};
// Server snapshot is false so static HTML and the hydration pass both render the landing.
const getServerHint = () => false;

function RootNavigator() {
  const { isReady, user, isAnonymous } = useAuth();
  const isSignedIn = !!user && !isAnonymous;
  const { resolvedColorScheme } = useThemePreference();
  const pathname = usePathname();
  const hasSignedInHint = useSyncExternalStore(subscribeNoop, readSignedInHint, getServerHint);

  useEffect(() => {
    if (!isReady) return;
    SplashScreen.hideAsync();
    // Reveal #root, hidden by the +html boot script while auth resolved for a returning user.
    if (IS_WEB && typeof document !== 'undefined') {
      delete document.documentElement.dataset.authPending;
    }
  }, [isReady]);

  // On web, "/" is the public landing: render it before auth resolves (static export, LCP), unless
  // this browser was last signed in, in which case wait so the landing never flashes. Protected
  // routes stay guarded because isSignedIn is false until auth is ready.
  const canRenderBeforeReady =
    IS_WEB && ((pathname === '/' && !hasSignedInHint) || PUBLIC_WEB_PATHS.has(pathname));

  if (!isReady && !canRenderBeforeReady) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Nonsense</title>
      </Head>
      <Stack screenLayout={webScreenLayout}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false, title: 'Privacy Policy' }} />
        <Stack.Screen name="terms" options={{ headerShown: false, title: 'Terms of Service' }} />
        <Stack.Screen name="contact" options={{ headerShown: false, title: 'Contact' }} />
        <Stack.Protected guard={isSignedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="session/new"
            options={{ title: 'New Session', presentation: 'modal', headerBackTitle: 'Back' }}
          />
          <Stack.Screen name="session/[id]" options={{ title: 'Active Session' }} />
          <Stack.Screen name="session/cashout/[id]" options={{ title: 'End Session' }} />
          <Stack.Screen
            name="session/summary/[id]"
            options={{ title: 'Session Summary', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="group/[id]/members"
            options={{ title: 'Group Members', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="locations/index"
            options={{ title: 'Saved Locations', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="qr-code"
            options={{ title: 'QR code', headerBackTitle: 'Back' }}
          />
        </Stack.Protected>
      </Stack>
      <StatusBar style={resolvedColorScheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

function ThemedNavigation() {
  const { resolvedColorScheme } = useThemePreference();

  return (
    <ThemeProvider value={resolvedColorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemePreferenceProvider>
        <AppAlertProvider>
          <WebAppFrame>
            <ThemedNavigation />
          </WebAppFrame>
        </AppAlertProvider>
      </ThemePreferenceProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
