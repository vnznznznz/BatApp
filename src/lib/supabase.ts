import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { readSupabaseConfig } from '@/lib/env';
import { secureStorage } from '@/lib/secure-storage';

const { url, anonKey } = readSupabaseConfig(process.env);

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
