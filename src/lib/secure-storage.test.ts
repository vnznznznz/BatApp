import * as SecureStore from 'expo-secure-store';

import { KEYCHAIN_OPTIONS, secureStorage } from '@/lib/secure-storage';

/**
 * Stands in for the keychain, and enforces the size ceiling that motivates the
 * chunking in the first place. A mock without the limit would let a broken
 * implementation pass. It refuses the keys the real one refuses, too.
 */
const KEYCHAIN_LIMIT = 2048;
const KEYCHAIN_KEY = /^[\w.-]+$/;
let store: Map<string, string>;

/** The entries a value's chunks are in: every one but the entry under its own key. */
const chunksOf = (key: string) => [...store.keys()].filter((entry) => entry !== key);

const REFUSED = new Error('Could not decrypt the value for SecureStore');

function valid(key: string): string {
  if (!KEYCHAIN_KEY.test(key)) throw new Error(`invalid key for the keychain: ${key}`);
  return key;
}

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED: 'WHEN_UNLOCKED',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mocked = SecureStore as jest.Mocked<typeof SecureStore>;

beforeEach(() => {
  store = new Map();

  mocked.getItemAsync.mockImplementation(async (key: string) => store.get(valid(key)) ?? null);
  mocked.setItemAsync.mockImplementation(async (key: string, value: string) => {
    if (value.length > KEYCHAIN_LIMIT) {
      throw new Error(`value too large for the keychain: ${value.length} bytes`);
    }
    store.set(valid(key), value);
  });
  mocked.deleteItemAsync.mockImplementation(async (key: string) => {
    store.delete(valid(key));
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
    const missing = chunksOf('session')[2];
    mocked.getItemAsync.mockImplementation(async (key: string) =>
      key === missing ? (undefined as unknown as string | null) : (store.get(key) ?? null),
    );

    expect(await secureStorage.getItem('session')).toBeNull();
  });

  it('round-trips a small value without chunking it', async () => {
    await secureStorage.setItem('session', 'short');

    expect(await secureStorage.getItem('session')).toBe('short');
    expect([...store.keys()]).toEqual(['session']);
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
    expect(chunksOf('session')).toHaveLength(2);
  });

  it('discards chunks when a chunked value is replaced by a small one', async () => {
    await secureStorage.setItem('session', 'a'.repeat(10_000));
    await secureStorage.setItem('session', 'tiny');

    expect(await secureStorage.getItem('session')).toBe('tiny');
    expect([...store.keys()]).toEqual(['session']);
  });

  /** Each write goes to the set of entries the last one did not use. */
  it('replaces one long value by another, time after time, keeping only the newest', async () => {
    for (const [letter, length, chunks] of [
      ['a', 4_000, 3],
      ['b', 7_000, 5],
      ['c', 2_000, 2],
      ['d', 6_000, 4],
    ] as const) {
      await secureStorage.setItem('session', letter.repeat(length));

      expect(await secureStorage.getItem('session')).toBe(letter.repeat(length));
      expect(chunksOf('session')).toHaveLength(chunks);
    }
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
    store.delete(chunksOf('session')[2]!);

    expect(await secureStorage.getItem('session')).toBeNull();
  });

  /**
   * Android's keystore and the iOS keychain can both refuse a read: a value that
   * no longer decrypts, a keychain that is not available yet. The app must be
   * able to carry on, and must be able to write over or remove what it cannot
   * read - or one bad entry would keep it from ever signing in or out again.
   */
  describe('when the keychain refuses a read', () => {
    beforeEach(async () => {
      await secureStorage.setItem('session', 'a'.repeat(10_000));
      mocked.getItemAsync.mockRejectedValue(REFUSED);
    });

    it('answers that nothing is there, and leaves the entry alone', async () => {
      const before = new Map(store);

      await expect(secureStorage.getItem('session')).resolves.toBeNull();

      expect(store).toEqual(before);
      // It may be readable the next time.
      mocked.getItemAsync.mockImplementation(async (key: string) => store.get(key) ?? null);
      expect(await secureStorage.getItem('session')).toBe('a'.repeat(10_000));
    });

    it('answers that nothing is there when only a chunk cannot be read', async () => {
      mocked.getItemAsync.mockImplementation(async (key: string) => {
        if (key !== 'session') throw REFUSED;
        return store.get(key) ?? null;
      });

      await expect(secureStorage.getItem('session')).resolves.toBeNull();
    });

    it.each([
      ['a long value', 'b'.repeat(5_000)],
      ['a short value', 'tiny'],
    ])('writes %s over the entry it cannot read', async (_, value) => {
      await secureStorage.setItem('session', value);

      mocked.getItemAsync.mockImplementation(async (key: string) => store.get(key) ?? null);
      expect(await secureStorage.getItem('session')).toBe(value);
      // Nothing of the older value is left beside it.
      expect(chunksOf('session')).toHaveLength(value.length > 1600 ? 4 : 0);
    });

    it('removes the entry it cannot read, and every chunk of it', async () => {
      await secureStorage.removeItem('session');

      expect(store.size).toBe(0);
    });

    it('removes an unreadable entry written in the old layout as well', async () => {
      store.clear();
      store.set('session', 'ncchunks:3');
      for (const index of [0, 1, 2]) store.set(`session.${index}`, 'x'.repeat(1600));

      await secureStorage.removeItem('session');

      expect(store.size).toBe(0);
    });
  });

  /** A chunk no manifest names is never read again, so failing to delete one is no failure. */
  it('does not fail a write or a removal over a leftover chunk that will not delete', async () => {
    await secureStorage.setItem('session', 'a'.repeat(10_000));
    mocked.deleteItemAsync.mockImplementation(async (key: string) => {
      if (key !== 'session') throw REFUSED;
      store.delete(key);
    });

    await expect(secureStorage.setItem('session', 'b'.repeat(5_000))).resolves.toBeUndefined();
    expect(await secureStorage.getItem('session')).toBe('b'.repeat(5_000));

    await expect(secureStorage.removeItem('session')).resolves.toBeUndefined();
    expect(await secureStorage.getItem('session')).toBeNull();
  });

  /**
   * A session is renewed about once an hour, and the app can be closed, or the
   * keychain can lock, at any point of the write. Whatever is read afterwards
   * must be one whole session: the previous one until the new one is complete.
   * Writing the new chunks over the old ones in place did not give that - the
   * old manifest then joined new first chunks to old later ones.
   */
  describe('a write that is interrupted', () => {
    const older = JSON.stringify({ token: 'a'.repeat(3_000), user: 'u'.repeat(1_000) });
    const newer = JSON.stringify({ token: 'b'.repeat(2_900), user: 'u'.repeat(1_000) });

    /** Lets `allowed` keychain writes through, then fails every later one. */
    function interruptAfter(allowed: number) {
      let writes = 0;
      mocked.setItemAsync.mockImplementation(async (key: string, value: string) => {
        writes += 1;
        if (writes > allowed) throw new Error('interrupted');
        store.set(key, value);
      });
    }

    it.each([0, 1, 2, 3])(
      'after %i of its keychain writes leaves the previous value whole',
      async (allowed) => {
        await secureStorage.setItem('session', older);
        interruptAfter(allowed);

        await expect(secureStorage.setItem('session', newer)).rejects.toThrow('interrupted');

        expect(await secureStorage.getItem('session')).toBe(older);
      },
    );

    it('after the last of them has the new value whole', async () => {
      await secureStorage.setItem('session', older);
      // Three chunks and the manifest; the tidying up afterwards is what fails.
      interruptAfter(4);
      mocked.deleteItemAsync.mockRejectedValue(new Error('interrupted'));

      await secureStorage.setItem('session', newer);

      expect(await secureStorage.getItem('session')).toBe(newer);
    });

    it('is put right by the next write, which leaves nothing of it behind', async () => {
      await secureStorage.setItem('session', older);
      interruptAfter(2);
      await secureStorage.setItem('session', newer).catch(() => {});
      mocked.setItemAsync.mockImplementation(async (key: string, value: string) => {
        store.set(key, value);
      });

      await secureStorage.setItem('session', newer);

      expect(await secureStorage.getItem('session')).toBe(newer);
      expect(chunksOf('session')).toHaveLength(3);
    });

    it('leaves the previous value whole when that one was short', async () => {
      await secureStorage.setItem('session', 'short');
      interruptAfter(2);

      await expect(secureStorage.setItem('session', newer)).rejects.toThrow('interrupted');

      expect(await secureStorage.getItem('session')).toBe('short');
    });
  });

  /** Written before chunks were kept apart by generation: numbered directly under the key. */
  describe('a value in the old layout', () => {
    const value = Array.from({ length: 4_000 }, (_, i) => String(i % 10)).join('');

    beforeEach(() => {
      store.set('session', 'ncchunks:3');
      store.set('session.0', value.slice(0, 1600));
      store.set('session.1', value.slice(1600, 3200));
      store.set('session.2', value.slice(3200));
    });

    it('is still read', async () => {
      expect(await secureStorage.getItem('session')).toBe(value);
    });

    it('is replaced whole, leaving none of its chunks behind', async () => {
      await secureStorage.setItem('session', 'b'.repeat(2_000));

      expect(await secureStorage.getItem('session')).toBe('b'.repeat(2_000));
      expect(chunksOf('session')).toHaveLength(2);
      expect(store.has('session.0')).toBe(false);
    });

    it('is removed with all its chunks', async () => {
      await secureStorage.removeItem('session');

      expect(store.size).toBe(0);
    });
  });

  it('does not take a manifest it cannot make sense of for a value', async () => {
    for (const manifest of ['ncchunks:', 'ncchunks:two', 'ncchunks:-1', 'ncchunks:2:z']) {
      store.set('session', manifest);

      expect(await secureStorage.getItem('session')).toBeNull();
    }
  });

  /** No value has chunks by the thousand; an entry that says so is not a manifest. */
  it('does not go looking for the chunks of a manifest gone wrong', async () => {
    store.set('session', 'ncchunks:5000');
    jest.clearAllMocks();

    await secureStorage.removeItem('session');

    expect(store.size).toBe(0);
    expect(mocked.deleteItemAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps every entry on this device only, never in a backup for another phone', async () => {
    expect(KEYCHAIN_OPTIONS).toEqual({
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });

    // Only this test's calls: the earlier tests' are still on the mocks.
    jest.clearAllMocks();
    await secureStorage.setItem('session', 'x'.repeat(5000));
    await secureStorage.setItem('session', 'small');
    await secureStorage.getItem('session');
    await secureStorage.removeItem('session');

    const calls = [
      ...mocked.setItemAsync.mock.calls.map((call) => call[2]),
      ...mocked.getItemAsync.mock.calls.map((call) => call[1]),
      ...mocked.deleteItemAsync.mock.calls.map((call) => call[1]),
    ];
    expect(mocked.setItemAsync.mock.calls.length).toBeGreaterThan(3);
    expect(calls.every((options) => options === KEYCHAIN_OPTIONS)).toBe(true);
  });
});
