import { DarkTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import type { Unfinished } from '@/features/auth/unfinished';

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
  const { session, isRestoring, isSettingPassword, unfinished } = useAuth();
  const router = useRouter();
  const segment = useSegments()[0];
  const inApp = segment === '(app)';
  // The house rules are read from the sign-up form and from the profile alike,
  // so a signed-in courier may stay on them. So on the page a link that leads
  // nowhere lands on: sent on at once, the courier would see it flash past
  // without learning why they are not where the link pointed. Its button leads
  // to the start, and from there this guard takes them to the roost.
  const forAnyone = segment === 'rules' || segment === '+not-found';
  // A code from an email signs the courier in before the password they chose
  // is saved: the new one of a reset, the one typed at sign-up - which
  // replaces whatever password an earlier sign-up for the address gave the
  // account - or the one signed in with, which confirming the address took
  // away. Saving it can fail. Until it is saved they are held: nowhere but
  // on the screen that asked for the code, which says what happened and asks
  // again - taken back to it from anywhere else they find themselves, gone
  // back in a browser or with the app opened again after it was closed.
  // (Found in review: held only on those two screens, the courier left the
  // hold behind by any other way off them.)
  const holdOn = unfinished ? HOLD_ON[unfinished.flow] : null;

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
    if (isRestoring || !session) return;
    if (isSettingPassword) {
      if (holdOn && segment !== holdOn.slice(1)) router.replace(holdOn);
      return;
    }
    if (inApp || forAnyone) return;
    if (router.canDismiss()) router.dismissAll();
    router.replace('/home');
  }, [isRestoring, session, isSettingPassword, holdOn, segment, inApp, forAnyone, router]);

  if (isRestoring) return null;

  return <Stack screenOptions={{ headerShown: false, contentStyle: styles.content }} />;
}

/** The screen that asked for the code, by what the code is for. */
const HOLD_ON = {
  'sign-up': '/sign-up',
  'sign-in': '/sign-in',
  reset: '/reset-password',
} as const satisfies Record<Unfinished['flow'], string>;

const styles = { content: { backgroundColor: Colors.background } } as const;
