import { createClient, isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/lib/database.types';
import { readSupabaseConfig } from '@/lib/env';
import { createGuardedFetch } from '@/lib/guarded-fetch';
import { authStorage, isSessionStored, SESSION_KEY } from '@/lib/session-store';

// Each variable written out in full, on purpose. Expo inlines EXPO_PUBLIC_*
// values into the bundle only where the code says `process.env.EXPO_PUBLIC_X`
// literally; at run time `process.env` itself is an empty object. Passing it
// whole - as this line once did - works under Jest, where the environment is
// real, and fails at launch in every actual build. `supabase.test.ts` runs this
// file through Expo's own Babel preset to keep it from happening again.
const { url, anonKey } = readSupabaseConfig({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    // The keychain on device; the browser's own storage on web, where
    // SecureStore does not exist. Under a name of our own, so that the app can
    // read the entry as well as the client.
    storage: authStorage,
    storageKey: SESSION_KEY,
    persistSession: true,
    autoRefreshToken: true,
    // No URL to read a session out of in a native app, and leaving this on
    // makes the client parse deep links it has no business parsing.
    detectSessionInUrl: false,
  },
  global: {
    fetch: createGuardedFetch({ anonKey, isSessionStored, renewSession }),
  },
});

/**
 * Renews the session for a request the database refused because its token had
 * run out - which the client, going by this device's clock, had not noticed.
 *
 * Only ever called for a request to the database. Such a request is sent after
 * the client has loaded its session, so the client is past its start-up and
 * nothing here can wait on itself.
 */
async function renewSession(staleToken: string): Promise<string | null> {
  // A refusal that arrives late finds the session renewed already.
  const { data: held } = await supabase.auth.getSession();
  if (held.session && held.session.access_token !== staleToken) return held.session.access_token;

  const { data, error } = await supabase.auth.refreshSession();
  if (data.session) return data.session.access_token;
  if (isAuthRetryableFetchError(error)) {
    throw new TypeError('Network request failed: the session could not be renewed');
  }

  // The auth server has refused the renewal, and the database the token: the
  // session is over. auth-js removes it by itself only when this device's
  // clock agrees that the token has run out, and a slow clock - what leads
  // here - says it has not. Left alone, the app would stay signed in to
  // nothing until the clock caught up.
  if (isAuthApiError(error) && isSessionStored()) await supabase.auth.signOut({ scope: 'local' });
  return null;
}

/**
 * Refresh tokens only while the app is in front of the user.
 *
 * Supabase's timer keeps firing in the background otherwise, which wakes the
 * app to make requests that no one is waiting for and which fail on a sleeping
 * network anyway.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    // Neither call can fail - each only sets or clears a timer - so nothing
    // waits for them.
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
