import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { readSupabaseConfig } from '@/lib/env';
import { secureStorage } from '@/lib/secure-storage';

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

export const supabase = createClient(url, anonKey, {
  auth: {
    // The keychain on device; the browser's own storage on web, where
    // SecureStore does not exist.
    storage: Platform.OS === 'web' ? undefined : secureStorage,
    persistSession: true,
    autoRefreshToken: true,
    // No URL to read a session out of in a native app, and leaving this on
    // makes the client parse deep links it has no business parsing.
    detectSessionInUrl: false,
  },
});

/**
 * Refresh tokens only while the app is in front of the user.
 *
 * Supabase's timer keeps firing in the background otherwise, which wakes the
 * app to make requests that no one is waiting for and which fail on a sleeping
 * network anyway.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
