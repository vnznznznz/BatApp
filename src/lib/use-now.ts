import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * The current time, re-read every `intervalMs` while the screen is focused, for
 * countdowns. Stops when the screen is not in front of the user, so a roost
 * three screens back in the stack is not re-rendering every second.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      const tick = () => setNow(Date.now());
      // Catch up at once on returning, rather than showing a stale countdown
      // for up to a whole interval.
      const first = setTimeout(tick, 0);
      const timer = setInterval(tick, intervalMs);
      return () => {
        clearTimeout(first);
        clearInterval(timer);
      };
    }, [intervalMs]),
  );

  return now;
}
