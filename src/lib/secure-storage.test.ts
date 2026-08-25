import * as SecureStore from 'expo-secure-store';

import { secureStorage } from '@/lib/secure-storage';

/**
 * Stands in for the keychain, and enforces the size ceiling that motivates the
 * chunking in the first place. A mock without the limit would let a broken
 * implementation pass.
 */
const KEYCHAIN_LIMIT = 2048;
let store: Map<string, string>;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mocked = SecureStore as jest.Mocked<typeof SecureStore>;

beforeEach(() => {
  store = new Map();

  mocked.getItemAsync.mockImplementation(async (key: string) => store.get(key) ?? null);
  mocked.setItemAsync.mockImplementation(async (key: string, value: string) => {
    if (value.length > KEYCHAIN_LIMIT) {
      throw new Error(`value too large for the keychain: ${value.length} bytes`);
    }
    store.set(key, value);
  });
  mocked.deleteItemAsync.mockImplementation(async (key: string) => {
    store.delete(key);
  });
});

describe('secureStorage', () => {
  it('returns null for a key that was never written', async () => {
    expect(await secureStorage.getItem('session')).toBeNull();
  });

  /**
   * `expo-secure-store` declares `string | null`, but the native module resolves
   * `undefined` for a missing key on some platforms. Treating that as a present
   * value crashed the Supabase client during session restore.
   */
  it('treats an undefined result from the keychain as absent', async () => {
    mocked.getItemAsync.mockResolvedValue(undefined as unknown as string | null);

    expect(await secureStorage.getItem('session')).toBeNull();
  });

  it('treats a missing chunk reported as undefined as absent', async () => {
    await secureStorage.setItem('session', 'a'.repeat(10_000));
    mocked.getItemAsync.mockImplementation(async (key: string) =>
      key === 'session.2' ? (undefined as unknown as string | null) : (store.get(key) ?? null),
    );

    expect(await secureStorage.getItem('session')).toBeNull();
  });

  it('round-trips a small value without chunking it', async () => {
    await secureStorage.setItem('session', 'short');

    expect(await secureStorage.getItem('session')).toBe('short');
    expect(store.has('session.0')).toBe(false);
  });

  /** A real Supabase session is two JWTs plus user metadata. */
  it('round-trips a value far larger than the keychain limit', async () => {
    const big = 'x'.repeat(10_000);

    await secureStorage.setItem('session', big);

    expect(await secureStorage.getItem('session')).toBe(big);
  });

  it('keeps every individual entry under the keychain limit', async () => {
    await secureStorage.setItem('session', 'y'.repeat(10_000));

    for (const value of store.values()) {
      expect(value.length).toBeLessThanOrEqual(KEYCHAIN_LIMIT);
    }
  });

  it('preserves exact content across a chunk boundary', async () => {
    const value = Array.from({ length: 5000 }, (_, i) => String(i % 10)).join('');

    await secureStorage.setItem('session', value);

    expect(await secureStorage.getItem('session')).toBe(value);
  });

  /** A shorter session must not leave a tail of the previous one behind. */
  it('discards chunks left over from a longer previous value', async () => {
    await secureStorage.setItem('session', 'a'.repeat(10_000));
    await secureStorage.setItem('session', 'b'.repeat(2_000));

    expect(await secureStorage.getItem('session')).toBe('b'.repeat(2_000));
    expect(store.has('session.4')).toBe(false);
  });

  it('discards chunks when a chunked value is replaced by a small one', async () => {
    await secureStorage.setItem('session', 'a'.repeat(10_000));
    await secureStorage.setItem('session', 'tiny');

    expect(await secureStorage.getItem('session')).toBe('tiny');
    expect(store.has('session.0')).toBe(false);
  });

  it('removes every chunk on removeItem', async () => {
    await secureStorage.setItem('session', 'a'.repeat(10_000));

    await secureStorage.removeItem('session');

    expect(await secureStorage.getItem('session')).toBeNull();
    expect(store.size).toBe(0);
  });

  /**
   * Handing back a half-read session would leave the app holding a token it
   * cannot use; signing in again is the honest outcome.
   */
  it('treats a partially written value as absent', async () => {
    await secureStorage.setItem('session', 'a'.repeat(10_000));
    store.delete('session.2');

    expect(await secureStorage.getItem('session')).toBeNull();
  });
});
