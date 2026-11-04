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

/**
 * Animations are decoration, and in tests they only cost time: in React
 * Native's test environment there is no native animated module, so an endless
 * wing beat runs frame by frame in JavaScript, and a test that lets an hour
 * pass under fake timers runs every frame of it. Every test therefore runs as
 * a reader with Reduce Motion turned on would see the app - still - and the
 * animation's own tests turn motion back on.
 */
/* global jest -- this file runs inside Jest, which provides it */
jest.mock('@/lib/use-reduced-motion', () => ({ useReducedMotion: jest.fn(() => true) }));
