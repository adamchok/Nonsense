import { useAuth } from '@/lib/auth-context';
import { Redirect } from 'expo-router';

export default function IndexScreen() {
  const { isReady, user, isAnonymous, playerProfile } = useAuth();

  if (!isReady) {
    return null;
  }

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (isAnonymous) {
    return <Redirect href="/(auth)/secure" />;
  }

  if (!playerProfile) {
    return <Redirect href="./(auth)/name" />;
  }

  return <Redirect href="/(tabs)" />;
}
