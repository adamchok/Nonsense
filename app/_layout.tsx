import { WebAppFrame, WebContentColumn } from '@/components/web/web-app-frame';
import { AppAlertProvider } from '@/lib/app-alert';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemePreferenceProvider, useThemePreference } from '@/lib/theme-context';
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactElement } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '@/lib/reanimated-setup';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: 'index',
};

const FULL_WIDTH_ROUTES = new Set(['(tabs)', 'index']);

const webScreenLayout =
  Platform.OS === 'web'
    ? ({ route, children }: { route: { name: string }; children: ReactElement }) =>
        FULL_WIDTH_ROUTES.has(route.name) ? children : <WebContentColumn>{children}</WebContentColumn>
    : undefined;

function RootNavigator() {
  const { isReady, user, isAnonymous } = useAuth();
  const isSignedIn = !!user && !isAnonymous;
  const { resolvedColorScheme } = useThemePreference();

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <>
      <Stack screenLayout={webScreenLayout}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
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
