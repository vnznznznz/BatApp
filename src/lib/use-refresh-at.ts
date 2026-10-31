import { useEffect } from 'react';

/** How long after the landing time to ask, so the server's clock is past it too. */
const LANDING_GRACE_MS = 1000;
/** Bounds on asking again while a landing is overdue. */
const MIN_RETRY_MS = 2000;
const MAX_RETRY_MS = 60_000;
/** setTimeout fires immediately for anything past this, which is about 24.8 days. */
const LONGEST_TIMER_MS = 2 ** 31 - 1;

/**
 * Fetches again when something is due to change on the server - a bat landing -
 * so it changes on screen without anyone pulling to refresh. Fetching is what
 * lands it: the server delivers whatever is due before it answers.
 *
 * `at` is when that is due, or null if nothing is. `settledAt` must change after
 * every fetch, success or failure (see `useRemote`), because that is what
 * re-arms the timer: if an answer still shows the bat in the air after its time,
 * or a fetch fails, this asks again - after a pause that grows with how overdue
 * it is, from two seconds to a minute - rather than leaving a countdown stuck at
 * "any moment now" until the user happens to leave and come back.
 */
export function useRefreshAt(at: number | null, settledAt: number, refresh: () => unknown): void {
  useEffect(() => {
    if (at === null) return;

    const now = Date.now();
    const wait =
      at > now
        ? Math.min(at - now + LANDING_GRACE_MS, LONGEST_TIMER_MS)
        : Math.min(Math.max((now - at) / 2, MIN_RETRY_MS), MAX_RETRY_MS);

    const timer = setTimeout(() => void refresh(), wait);
    return () => clearTimeout(timer);
  }, [at, settledAt, refresh]);
}
