import type { Session } from '@supabase/supabase-js';

/** Stands in for the keychain, refusing what the real one refuses. */
const mockKeychain = new Map<string, string>();
const mockRefusal = { reads: false };

jest.mock('expo-secure-store', () => {
  const valid = (key: string) => {
    if (!/^[\w.-]+$/.test(key)) throw new Error(`invalid key for the keychain: ${key}`);
    return key;
  };
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn(async (key: string) => {
      if (mockRefusal.reads) throw new Error('Could not decrypt the value for SecureStore');
      return mockKeychain.get(valid(key)) ?? null;
    }),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      if (value.length > 2048) throw new Error('value too large for the keychain');
      mockKeychain.set(valid(key), value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      mockKeychain.delete(valid(key));
    }),
  };
});

const SESSION: Session = {
  access_token: `header.${'a'.repeat(1000)}.signature`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1_800_000_000,
  refresh_token: 'refreshtoken',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    aud: 'authenticated',
    email: 'mara@example.test',
    app_metadata: { provider: 'email' },
    user_metadata: { username: 'mara', display_name: 'Mara', padding: 'p'.repeat(1000) },
    created_at: '2026-11-01T10:00:00Z',
  },
};

type Store = typeof import('@/lib/session-store');
type ReactNative = typeof import('react-native');

/**
 * The module as a launch finds it. Whether a session is stored is remembered in
 * the module, and where sessions are kept is settled as it loads, so every test
 * starts it afresh.
 */
function launch(os: ReactNative['Platform']['OS'] = 'ios'): Store {
  jest.resetModules();
  jest.requireActual<ReactNative>('react-native').Platform.OS = os;
  return jest.requireActual<Store>('@/lib/session-store');
}

beforeEach(() => {
  mockKeychain.clear();
  mockRefusal.reads = false;
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('the name of the session entry', () => {
  /**
   * expo-secure-store refuses a key with anything but letters, digits, dots,
   * dashes and underscores in it. The name supabase-js would derive from the
   * project's address can hold more than that - "sb-[::1]-auth-token".
   */
  it('is one the keychain accepts, and so is every name the client derives from it', () => {
    const { SESSION_KEY } = launch();

    for (const suffix of ['', '-user', '-code-verifier', '-flows-code-verifier']) {
      expect(`${SESSION_KEY}${suffix}`).toMatch(/^[\w.-]+$/);
    }
  });
});

describe('the stored session', () => {
  it('is null on a device that holds none', async () => {
    const { readStoredSession } = launch();

    expect(await readStoredSession()).toBeNull();
  });

  it('is read as the client wrote it', async () => {
    const { authStorage, readStoredSession, SESSION_KEY } = launch();
    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));

    expect(await launch().readStoredSession()).toEqual(SESSION);
    expect(await readStoredSession()).toEqual(SESSION);
  });

  it.each<[string, string]>([
    ['is not JSON', '{"access_token":"header.aaa'],
    ['is not an object', '"a string"'],
    ['is null', 'null'],
    ['has no user', JSON.stringify({ ...SESSION, user: undefined })],
    [
      'has a user without an id',
      JSON.stringify({ ...SESSION, user: { email: 'mara@example.test' } }),
    ],
    ['has no refresh token', JSON.stringify({ ...SESSION, refresh_token: undefined })],
    ['has an empty refresh token', JSON.stringify({ ...SESSION, refresh_token: '' })],
    ['has no access token', JSON.stringify({ ...SESSION, access_token: undefined })],
  ])('is null when what is stored %s', async (_, value) => {
    const { authStorage, readStoredSession, isSessionStored, SESSION_KEY } = launch();
    await authStorage.setItem(SESSION_KEY, value);

    expect(await readStoredSession()).toBeNull();
    expect(isSessionStored()).toBe(false);
  });

  /** The app decides from this whether to start signed in: it must get an answer. */
  it('is null, and no failure, when the keychain refuses the read', async () => {
    const { authStorage, SESSION_KEY } = launch();
    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockRefusal.reads = true;

    await expect(launch().readStoredSession()).resolves.toBeNull();
  });

  it('is gone, every chunk of it, once cleared', async () => {
    const { authStorage, clearStoredSession, readStoredSession, SESSION_KEY } = launch();
    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));

    await clearStoredSession();

    expect(mockKeychain.size).toBe(0);
    expect(await readStoredSession()).toBeNull();
  });
});

/**
 * "A session is stored" is not the same as "the client has a session": after a
 * renewal that could not reach the server the client answers that it has none,
 * for a minute, while the session sits in the keychain as before. The fetch of
 * our own asks here before it lets a request go out in nobody's name.
 */
describe('whether a session is stored', () => {
  it('is not known to be so before anything has been read', () => {
    expect(launch().isSessionStored()).toBe(false);
  });

  it('is known from the first read that finds one', async () => {
    const earlier = launch();
    await earlier.authStorage.setItem(earlier.SESSION_KEY, JSON.stringify(SESSION));

    const { authStorage, isSessionStored, SESSION_KEY } = launch();
    expect(isSessionStored()).toBe(false);
    await authStorage.getItem(SESSION_KEY);

    expect(isSessionStored()).toBe(true);
  });

  it('stays false when the read finds none', async () => {
    const { isSessionStored, readStoredSession } = launch();

    await readStoredSession();

    expect(isSessionStored()).toBe(false);
  });

  it('follows the client as it writes a session and removes it', async () => {
    const { authStorage, isSessionStored, SESSION_KEY } = launch();

    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    expect(isSessionStored()).toBe(true);

    await authStorage.removeItem(SESSION_KEY);
    expect(isSessionStored()).toBe(false);
  });

  it('is false once the stored session has been cleared', async () => {
    const { authStorage, clearStoredSession, isSessionStored, SESSION_KEY } = launch();
    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));

    await clearStoredSession();

    expect(isSessionStored()).toBe(false);
  });

  /** A read the keychain refused says nothing about what is in it. */
  it('is not forgotten over a read that fails', async () => {
    const { authStorage, isSessionStored, readStoredSession, SESSION_KEY } = launch();
    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockRefusal.reads = true;

    expect(await readStoredSession()).toBeNull();

    expect(isSessionStored()).toBe(true);
  });

  it('takes no notice of the other entries the client keeps', async () => {
    const { authStorage, isSessionStored, SESSION_KEY } = launch();

    await authStorage.setItem(`${SESSION_KEY}-code-verifier`, JSON.stringify(SESSION));
    expect(isSessionStored()).toBe(false);

    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    await authStorage.removeItem(`${SESSION_KEY}-code-verifier`);
    await authStorage.getItem(`${SESSION_KEY}-user`);
    expect(isSessionStored()).toBe(true);
  });

  it('can be set by whoever knows better', () => {
    const { isSessionStored, markSessionStored } = launch();

    markSessionStored(true);
    expect(isSessionStored()).toBe(true);

    markSessionStored(false);
    expect(isSessionStored()).toBe(false);
  });
});

describe('on the web', () => {
  /** A browser's storage, as far as the store uses it. */
  function browser(initial: Record<string, string> = {}) {
    const items = new Map(Object.entries(initial));
    const storage = {
      getItem: jest.fn((key: string) => items.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => void items.set(key, value)),
      removeItem: jest.fn((key: string) => void items.delete(key)),
    };
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    return { items, storage };
  }

  const refuse = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };

  it("keeps the session in the browser's storage, where the keychain does not exist", async () => {
    const { items } = browser();
    const { authStorage, readStoredSession, SESSION_KEY } = launch('web');

    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));

    expect(items.get(SESSION_KEY)).toBe(JSON.stringify(SESSION));
    expect(mockKeychain.size).toBe(0);
    expect(await launch('web').readStoredSession()).toEqual(SESSION);
    expect(await readStoredSession()).toEqual(SESSION);
  });

  it('removes it from there', async () => {
    const { items } = browser();
    const { authStorage, clearStoredSession, SESSION_KEY } = launch('web');
    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));

    await clearStoredSession();

    expect(items.size).toBe(0);
  });

  /**
   * The web build is rendered to static pages in Node, where there is no
   * localStorage at all, and a browser can refuse every use of the one it has.
   * Either way the client must be able to start, and to hold a session for as
   * long as the page lives.
   */
  describe.each<[string, () => void]>([
    ['there is no localStorage', () => {}],
    [
      'localStorage refuses every call',
      () => {
        const { storage } = browser();
        storage.getItem.mockImplementation(refuse);
        storage.setItem.mockImplementation(refuse);
        storage.removeItem.mockImplementation(refuse);
      },
    ],
  ])('when %s', (_, arrange) => {
    beforeEach(arrange);

    it('answers that nothing is stored', async () => {
      const { readStoredSession, isSessionStored } = launch('web');

      await expect(readStoredSession()).resolves.toBeNull();
      expect(isSessionStored()).toBe(false);
    });

    it('holds a session for as long as the page lives', async () => {
      const { authStorage, readStoredSession, isSessionStored, SESSION_KEY } = launch('web');

      await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));

      expect(await readStoredSession()).toEqual(SESSION);
      expect(isSessionStored()).toBe(true);
    });

    it('forgets it when it is cleared', async () => {
      const { authStorage, clearStoredSession, readStoredSession, SESSION_KEY } = launch('web');
      await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));

      await clearStoredSession();

      expect(await readStoredSession()).toBeNull();
    });
  });

  it('reads the newer session when the browser refused to store it over an older one', async () => {
    const older = JSON.stringify({ ...SESSION, refresh_token: 'older' });
    const { storage } = browser();
    const { authStorage, readStoredSession, SESSION_KEY } = launch('web');
    await authStorage.setItem(SESSION_KEY, older);
    storage.setItem.mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));

    expect(await readStoredSession()).toEqual(SESSION);
  });

  it('reads the newest session once the browser stores again', async () => {
    const { items, storage } = browser();
    const { authStorage, readStoredSession, SESSION_KEY } = launch('web');
    storage.setItem.mockImplementationOnce(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    await authStorage.setItem(SESSION_KEY, JSON.stringify({ ...SESSION, refresh_token: 'older' }));

    await authStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));

    expect(items.get(SESSION_KEY)).toBe(JSON.stringify(SESSION));
    expect(await readStoredSession()).toEqual(SESSION);
  });
});
