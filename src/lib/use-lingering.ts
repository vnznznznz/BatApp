import { useEffect, useState } from 'react';

/** How long a first load may take before the screen says it is still trying. */
export const LINGERING_MS = 5000;

/** What the screen says then. */
export const STILL_TRYING = 'Still trying to reach Night Courier…';

/**
 * Whether `waiting` has been true for `ms` without a break: the moment a
 * spinner alone stops saying enough.
 *
 * Without a network, an hour after the app was last used, every first load
 * waits about half a minute while the client tries to renew the session, and
 * the screens showed spinners and nothing else all that time. (Found in the
 * browser.)
 */
export function useLingering(waiting: boolean, ms: number = LINGERING_MS): boolean {
  const [lingering, setLingering] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setLingering(true), ms);
    return () => {
      clearTimeout(timer);
      setLingering(false);
    };
  }, [waiting, ms]);

  return waiting && lingering;
}
