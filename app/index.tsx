import { useAuth } from '@/lib/auth-context';
import { LandingPage } from '@/components/web/landing-page';
import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

export default function IndexScreen() {
  const { isReady, user, isAnonymous, playerProfile } = useAuth();

  if (!isReady) {
    // Web: the root layout only renders "/" before auth is ready when the visitor isn't a
    // returning signed-in user, so the public landing is the right first paint (and static HTML).
    return Platform.OS === 'web' ? <LandingPage /> : null;
  }

  if (!user) {
    return Platform.OS === 'web' ? <LandingPage /> : <Redirect href="/(auth)/welcome" />;
  }

  if (isAnonymous) {
    return <Redirect href="/(auth)/secure" />;
  }

  if (!playerProfile) {
    return <Redirect href="./(auth)/name" />;
  }

  return <Redirect href="/(tabs)" />;
}
