import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { secureStorage } from '@/lib/secure-storage';

/**
 * Where the session is kept on this device, and whether one is there.
 *
 * The Supabase client reads and writes its session through `authStorage`. The
 * app reads the same entry for itself, because the client's own answer to "is
 * anyone signed in?" waits for the server: after an hour away it first renews
 * the token, and if that cannot be done it says "nobody" although the session
 * is here, untouched. Whether this device is signed in is a question about
 * what is stored on it, and this is where it is answered.
 */

/**
 * The name of the session's entry.
 *
 * Written out, not left to supabase-js: the name it derives from the project's
 * address is not known to the app, and for some addresses - "sb-[::1]-auth-token"
 * - it is one expo-secure-store refuses. A key may hold letters, digits, dots,
 * dashes and underscores only.
 */
export const SESSION_KEY = 'night-courier.session';

/** What the browser's storage did not take: there is none, or it refuses to be used. */
const kept = new Map<string, string>();

/**
 * The browser's own storage, for the web build, where the keychain does not
 * exist.
 *
 * Every call is guarded. The pages are rendered once in Node at export time,
 * where there is no `localStorage` at all, and a browser can refuse every use
 * of the one it has. The session is then held in memory, so that it lasts as
 * long as the page does.
 */
const browserStorage = {
  getItem(key: string): string | null {
    if (kept.has(key)) return kept.get(key) ?? null;
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      globalThis.localStorage.setItem(key, value);
      kept.delete(key);
    } catch {
      kept.set(key, value);
    }
  },

  removeItem(key: string): void {
    kept.delete(key);
    try {
      globalThis.localStorage.removeItem(key);
    } catch {
      // Nothing was stored there to remove.
    }
  },
};

const backing = Platform.OS === 'web' ? browserStorage : secureStorage;

let sessionStored = false;

/**
 * Whether this device holds a session - which is not whether the client can
 * use it right now. `authStorage` keeps this current by itself, from every
 * read and write of the entry; and since the client reads the entry before it
 * sends anything, a launch knows what is stored by the time it matters.
 */
export function isSessionStored(): boolean {
  return sessionStored;
}

function parseSession(value: string | null): Session | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The least a session must hold for someone to count as signed in with it. */
function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const { access_token, refresh_token, user } = value as Partial<Session>;
  return (
    typeof access_token === 'string' &&
    typeof refresh_token === 'string' &&
    refresh_token !== '' &&
    typeof user?.id === 'string'
  );
}

/**
 * The one storage the Supabase client uses, on every platform: the keychain on
 * a device, the browser's storage on the web.
 */
export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await backing.getItem(key);
    // Null says nothing: the keychain answers it for an entry it could not
    // read as well as for one that is not there.
    if (key === SESSION_KEY && value !== null) sessionStored = parseSession(value) !== null;
    return value;
  },

  async setItem(key: string, value: string): Promise<void> {
    await backing.setItem(key, value);
    if (key === SESSION_KEY) sessionStored = parseSession(value) !== null;
  },

  async removeItem(key: string): Promise<void> {
    await backing.removeItem(key);
    if (key === SESSION_KEY) sessionStored = false;
  },
};

/**
 * The session stored on this device, or null: nothing is stored, it could not
 * be read, or what is there is not a session. Never rejects, and never asks the
 * server.
 */
export async function readStoredSession(): Promise<Session | null> {
  return parseSession(await authStorage.getItem(SESSION_KEY));
}

/**
 * Removes the stored session, behind the client's back: for signing out on
 * this device when the client could not do it because the server could not be
 * reached. The client announces nothing; whoever calls this knows. Rejects
 * only if the keychain refuses to delete the entry.
 */
export async function clearStoredSession(): Promise<void> {
  await authStorage.removeItem(SESSION_KEY);
}
