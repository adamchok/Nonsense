import { useAuth } from '@/lib/auth-context';
import { Redirect } from 'expo-router';

export default function IndexScreen() {
  const { isReady, user, playerProfile } = useAuth();

  if (!isReady) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (!playerProfile) {
    return <Redirect href="./(auth)/name" />;
  }

  return <Redirect href="/(tabs)" />;
}
