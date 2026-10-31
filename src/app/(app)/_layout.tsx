import { Redirect, Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';

/**
 * Everything under this group requires a signed-in user.
 *
 * This is a convenience, not a security boundary: the real enforcement is row
 * level security in the database, which returns nothing to an unauthenticated
 * request no matter what the app renders.
 *
 * Every screen but the roost gets a native header carrying only a back button,
 * painted in the background colour so it reads as part of the screen. The
 * screens keep their own serif titles in the content, as the rest of the app
 * does; the header exists for the platform's back affordance, which an iOS user
 * otherwise has to know to swipe for.
 */
export default function AppLayout() {
  const { session } = useAuth();

  if (!session) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="home" options={{ headerShown: false }} />
    </Stack>
  );
}
