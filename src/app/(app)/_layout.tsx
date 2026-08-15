import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/features/auth/auth-context';

/**
 * Everything under this group requires a signed-in user.
 *
 * This is a convenience, not a security boundary: the real enforcement is row
 * level security in the database, which returns nothing to an unauthenticated
 * request no matter what the app renders.
 */
export default function AppLayout() {
  const { session } = useAuth();

  if (!session) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
