import { WebAppFrame, WebContentColumn } from '@/components/web/web-app-frame';
import { WebSidebar } from '@/components/web/web-sidebar';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { AppAlertProvider } from '@/lib/app-alert';
import { AuthProvider, readSignedInHint, useAuth } from '@/lib/auth-context';
import { ThemePreferenceProvider, useThemePreference } from '@/lib/theme-context';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore, type ReactElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '@/lib/reanimated-setup';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: 'index',
};

const FULL_WIDTH_ROUTES = new Set(['(tabs)', 'index', 'privacy', 'privacy-ms', 'terms', 'contact']);
const PUBLIC_WEB_PATHS = new Set(['/privacy', '/privacy-ms', '/terms', '/contact']);

const webScreenLayout =
  Platform.OS === 'web'
    ? ({ route, children }: { route: { name: string }; children: ReactElement }) =>
        FULL_WIDTH_ROUTES.has(route.name) ? children : <WebContentColumn>{children}</WebContentColumn>
    : undefined;

const IS_WEB = Platform.OS === 'web';
const AUTH_PATHS = new Set(['/sign-in', '/name', '/secure']);

function isPublicOrAuthPath(pathname: string): boolean {
  return PUBLIC_WEB_PATHS.has(pathname) || AUTH_PATHS.has(pathname);
}

const subscribeNoop = () => () => {};
const getServerHint = () => false;

function RootNavigator() {
  const { isReady, user, isAnonymous } = useAuth();
  const isSignedIn = !!user && !isAnonymous;
  const { resolvedColorScheme } = useThemePreference();
  const pathname = usePathname();
  const hasSignedInHint = useSyncExternalStore(subscribeNoop, readSignedInHint, getServerHint);
  const { isMd } = useBreakpoint();
  const showSidebar = IS_WEB && isMd && isSignedIn && !isPublicOrAuthPath(pathname);

  useEffect(() => {
    if (!isReady) return;
    SplashScreen.hideAsync();
    if (IS_WEB && typeof document !== 'undefined') {
      delete document.documentElement.dataset.authPending;
    }
  }, [isReady]);

  const canRenderBeforeReady = IS_WEB && ((pathname === '/' && !hasSignedInHint) || PUBLIC_WEB_PATHS.has(pathname));

  if (!isReady && !canRenderBeforeReady) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Nonsense</title>
      </Head>
      <View style={styles.shell}>
        {showSidebar ? <WebSidebar /> : null}
        <View style={styles.main}>
          <Stack screenLayout={webScreenLayout}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="privacy" options={{ headerShown: false, title: 'Privacy Policy' }} />
            <Stack.Screen name="privacy-ms" options={{ headerShown: false, title: 'Dasar Privasi' }} />
            <Stack.Screen name="terms" options={{ headerShown: false, title: 'Terms of Service' }} />
            <Stack.Screen name="contact" options={{ headerShown: false, title: 'Contact' }} />
            <Stack.Screen name="delete-account" options={{ title: 'Delete account', headerBackTitle: 'Back' }} />
            <Stack.Protected guard={isSignedIn}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="session/new"
                options={{ title: 'New session', presentation: 'modal', headerBackTitle: 'Back' }}
              />
              <Stack.Screen name="session/[id]" options={{ title: 'Live session' }} />
              <Stack.Screen name="session/cashout/[id]" options={{ title: 'Cash out' }} />
              <Stack.Screen
                name="session/summary/[id]"
                options={{ title: 'Session summary', headerBackTitle: 'Back' }}
              />
              <Stack.Screen name="locations/index" options={{ title: 'Saved locations', headerBackTitle: 'Back' }} />
              <Stack.Screen name="qr-code" options={{ title: 'QR code', headerBackTitle: 'Back' }} />
              <Stack.Screen name="change-password" options={{ title: 'Change password', headerBackTitle: 'Back' }} />
            </Stack.Protected>
          </Stack>
        </View>
      </View>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  shell: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
});
