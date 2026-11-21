import { useEffect, useState } from 'react';

/**
 * How long after a code went out the screens let a new one be asked for: the
 * auth server's own wait between two emails to an address on the hosted
 * project, the sixty seconds supabase/config.toml leaves it at.
 */
export const RESEND_WAIT_SECONDS = 60;

/**
 * Whether a new code has to wait, and the way to start the wait once one has
 * gone.
 *
 * The auth server refuses an email within its minute, but says so only for an
 * address that has an account: for any other it answers as if it had sent
 * one. A screen that passed its answer on would tell anyone who pressed twice
 * which addresses have an account. So the screens wait the minute themselves,
 * whatever the address, and by the time a new code can be asked for the server
 * takes the request from everyone alike.
 */
export function useResendWait(waitingAtFirst: boolean): {
  waiting: boolean;
  startWaiting: () => void;
} {
  const [waiting, setWaiting] = useState(waitingAtFirst);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaiting(false), RESEND_WAIT_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [waiting]);

  return { waiting, startWaiting: () => setWaiting(true) };
}
