import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * The pauses between attempts: two seconds, then twice as long each time, up
 * to a minute - the bounds `useRefreshAt` has for a landing that is overdue.
 */
const FIRST_PAUSE_MS = 2000;
const LONGEST_PAUSE_MS = 60_000;

/**
 * Loading again, unasked, what could not be loaded.
 *
 * A screen opened without a signal used to keep its error for as long as it
 * stayed in front: nothing asked again unless the courier left the screen, sent
 * the app to the background, or thought of pulling down - and some screens
 * have nothing to pull. On compose that was a letter written and never sent.
 *
 * `attempt` loads once, and resolves with whether that is worth doing again:
 * true when the load failed without the server refusing it - no answer came -
 * and no newer load has taken its place. The function returned loads the same
 * way, and then goes on by itself for as long as the answer is true, the
 * screen is in front of the courier and the app in front of everything else.
 * Being asked for a load - on focus, on the app's return, by hand - starts the
 * pauses again from the shortest.
 */
export function useRetry(
  attempt: (visible: boolean) => Promise<boolean>,
): (visible: boolean) => Promise<void> {
  const waiting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const failures = useRef(0);
  const inFront = useRef(false);

  // Nobody is waiting for a screen they cannot see, and a timer left running
  // behind one would wake the phone for nothing. Whoever loads on coming back
  // into view starts the attempts again.
  useFocusEffect(
    useCallback(() => {
      inFront.current = true;
      const subscription = AppState.addEventListener('change', (state) => {
        inFront.current = state === 'active';
        if (!inFront.current) clearTimeout(waiting.current);
      });
      return () => {
        inFront.current = false;
        clearTimeout(waiting.current);
        subscription.remove();
      };
    }, []),
  );

  return useCallback(
    (visible: boolean) => {
      async function load(visible: boolean, unasked: boolean): Promise<void> {
        // This load takes the place of an attempt still waiting its turn.
        clearTimeout(waiting.current);
        if (!unasked) failures.current = 0;
        if (!(await attempt(visible)) || !inFront.current) return;

        const pause = Math.min(FIRST_PAUSE_MS * 2 ** failures.current, LONGEST_PAUSE_MS);
        failures.current += 1;
        // Quietly: nobody asked, so nothing should spin.
        waiting.current = setTimeout(() => void load(false, true), pause);
      }

      return load(visible, false);
    },
    [attempt],
  );
}
