/**
 * Supabase configuration for tests.
 *
 * `src/lib/supabase.ts` validates its configuration at import time and throws
 * when it is missing, which is the behaviour we want in a real app — a missing
 * key should fail loudly at launch rather than at the first request. Tests
 * therefore need values present before any module is imported, and `setupFiles`
 * runs early enough for that.
 *
 * These are deliberately not real credentials. No test in this project makes a
 * network request.
 */
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_test_key';
