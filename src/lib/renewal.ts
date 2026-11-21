import { supabase } from '@/lib/supabase';

/**
 * The session's renewal, as the screens' loads need it.
 *
 * auth-js remembers a renewal that failed, for a minute
 * (REFRESH_FAILURE_COOLDOWN_MS in auth-js 2.112), and until then answers every
 * request from that memory: no session, and nothing sent. Its reason is good -
 * a client in trouble should not ask the auth server again and again - but the
 * minute ran on after the network came back. After a start without a network
 * a press of "Try again" sent nothing at all, and the screens went on saying
 * "No connection" for one to two minutes. (Found in the browser.)
 */

/** The part of auth-js's client that holds the memory. Not public; see the test beside this file. */
type Remembering = { lastRefreshFailure?: unknown };

/**
 * For a load someone asked for - "Try again", a pull, the screen coming into
 * view, the app coming back to the front: the next request renews the session
 * if it needs renewing, rather than being answered from the memory of the last
 * renewal that failed. Loads the app makes again by itself leave the memory
 * as it is, as does a renewal already under way, which every request waits for.
 *
 * A request made like this costs the auth server nothing it would not have
 * paid a minute later, and the client's own fetch keeps it from asking again
 * at once after a refusal (see guarded-fetch.ts).
 */
export function renewOnNextRequest(): void {
  const client = supabase.auth as unknown as Remembering;
  if (client.lastRefreshFailure) client.lastRefreshFailure = null;
}

const listeners = new Set<() => void>();
let listening = false;

/**
 * Calls `listener` whenever the client has renewed the session, until the
 * returned function is called: the moment a load that got no answer for want
 * of a session can be made again.
 */
export function onSessionRenewed(listener: () => void): () => void {
  if (!listening) {
    listening = true;
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') listeners.forEach((renewed) => renewed());
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
