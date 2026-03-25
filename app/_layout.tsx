import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemePreferenceProvider, useThemePreference } from '@/lib/theme-context';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: 'index',
};

function RootNavigator() {
  const { isReady } = useAuth();
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
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="session/new"
          options={{ title: 'New Session', presentation: 'modal', headerBackTitle: 'Back' }}
        />
        <Stack.Screen name="session/[id]" options={{ title: 'Active Session' }} />
        <Stack.Screen name="session/cashout/[id]" options={{ title: 'Cash Out' }} />
        <Stack.Screen
          name="session/summary/[id]"
          options={{ title: 'Session Summary', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="group/new"
          options={{ title: 'New Group', headerBackTitle: 'Back' }}
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
    <ThemePreferenceProvider>
      <ThemedNavigation />
    </ThemePreferenceProvider>
  );
}
