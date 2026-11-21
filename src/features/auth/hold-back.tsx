import { Stack, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/**
 * Keeps the courier on the screen while `holding`: the swipe back on iOS is
 * taken away, and Android's back button does nothing.
 *
 * For the screens that ask for a code from an email, between the moment it
 * goes to be checked and the moment the password the courier chose is saved.
 * The root layout holds the way into the app only while such a screen is in
 * front: gone back from it, they were in the roost, signed in with a password
 * they did not know - after signing up, perhaps one somebody else knew - and
 * why it was not saved was told to a screen that was gone. The screen says
 * what to do instead: try again, or sign out. (Found in review.)
 */
export function HoldBack({ holding }: { holding: boolean }) {
  useFocusEffect(
    useCallback(() => {
      if (!holding) return;
      // Asked before the navigator's own listener, which would go back.
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => subscription.remove();
    }, [holding]),
  );

  return <Stack.Screen options={{ gestureEnabled: !holding }} />;
}
