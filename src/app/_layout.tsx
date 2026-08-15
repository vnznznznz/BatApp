import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
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
  const { isRestoring } = useAuth();

  useEffect(() => {
    // Holding the splash until the stored session has been read is what stops
    // the welcome screen flashing in front of an already signed-in user.
    if (!isRestoring) SplashScreen.hideAsync().catch(() => {});
  }, [isRestoring]);

  if (isRestoring) return null;

  return <Stack screenOptions={{ headerShown: false, contentStyle: styles.content }} />;
}

const styles = { content: { backgroundColor: Colors.background } } as const;
