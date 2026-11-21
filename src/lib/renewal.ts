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
 * For a load someone pressed for - "Try again", a pull: the next request
 * renews the session if it needs renewing, rather than being answered from the
 * memory of the last renewal that failed. A renewal already under way, which
 * every request waits for, is left as it is.
 *
 * Only for a press. Each one may cost a renewal - without a network, half a
 * minute of attempts that every request and Sign out wait for; with a refused
 * token, one more refusal - and loads nobody pressed for, on coming into view
 * or on the app's return, made one at every screen opened. (Found in review.)
 * After an answer that is neither a session nor its end, the client's own
 * fetch sends no renewal for half a minute (see guarded-fetch.ts).
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
