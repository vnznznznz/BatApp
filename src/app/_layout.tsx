import { DarkTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';

// Both splash calls reject if the splash screen has already been dismissed —
// on a fast reload, for instance. That is harmless, but an uncaught rejection
// surfaces as a red-box warning in development, so both are swallowed.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Navigation chrome painted in Night Courier's palette rather than the default grey. */
const NavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.background,
    card: Colors.surface,
    border: Colors.border,
    text: Colors.text,
    primary: Colors.accent,
  },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={NavigationTheme}>
          <StatusBar style="light" />
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, isRestoring } = useAuth();
  const router = useRouter();
  const inApp = useSegments()[0] === '(app)';

  useEffect(() => {
    // Holding the splash until the stored session has been read is what stops
    // the welcome screen flashing in front of an already signed-in user.
    if (!isRestoring) SplashScreen.hideAsync().catch(() => {});
  }, [isRestoring]);

  // The way in. A session can appear while the user is on any screen outside
  // the app - restored at launch on the welcome screen, or created by the
  // sign-in or sign-up form they are looking at - and wherever it appears, they
  // go to the roost. The (app) layout does the reverse when a session ends.
  //
  // This guard was missing until Phase 4: sign-in and sign-up both succeeded
  // and then left the user on the form, because the only redirect lived on the
  // welcome screen and fires only while that screen is in front.
  //
  // Dismissing first leaves the roost as the only screen in the stack, so back
  // does not return to a sign-in form for an account that is signed in.
  useEffect(() => {
    if (isRestoring || !session || inApp) return;
    if (router.canDismiss()) router.dismissAll();
    router.replace('/home');
  }, [isRestoring, session, inApp, router]);

  if (isRestoring) return null;

  return <Stack screenOptions={{ headerShown: false, contentStyle: styles.content }} />;
}

const styles = { content: { backgroundColor: Colors.background } } as const;
