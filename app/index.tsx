import { useAuth } from '@/lib/auth-context';
import { LandingPage } from '@/components/web/landing-page';
import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

export default function IndexScreen() {
  const { isReady, user, isAnonymous, playerProfile } = useAuth();

  if (!isReady) {
    return Platform.OS === 'web' ? <LandingPage /> : null;
  }

  if (!user) {
    return Platform.OS === 'web' ? <LandingPage /> : <Redirect href="/(auth)/sign-in" />;
  }

  if (isAnonymous) {
    return <Redirect href="/(auth)/secure" />;
  }

  if (!playerProfile) {
    return <Redirect href="./(auth)/name" />;
  }

  return <Redirect href="/(tabs)" />;
}
