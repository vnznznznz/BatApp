import type { Session } from '@supabase/supabase-js';
import { act, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import * as ReactNative from 'react-native';

import type { AuthContextValue } from '@/features/auth/auth-context';
import { secureStorage } from '@/lib/secure-storage';
import { SESSION_KEY } from '@/lib/session-store';

/**
 * The app's AuthProvider over the client as the app builds it - the real
 * supabase-js, the real storage, the real fetch of our own - with only the two
 * things underneath replaced: the keychain and the network.
 *
 * Every screen test mocks this context, so none of them could ever notice what
 * is decided here: who counts as signed in when the app opens, what a failed
 * renewal or a sign-out without a network does to that, and what the person is
 * told when the auth server says no.
 */

// The first render compiles React Native's components on a cold cache.
jest.setTimeout(20_000);

const mockKeychain = new Map<string, string>();
const mockRefusal = { reads: false, deletes: false };

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
      if (mockRefusal.deletes) throw new Error('Could not delete the value from SecureStore');
      mockKeychain.delete(valid(key));
    }),
  };
});

const OLD_TOKEN = `header.${'a'.repeat(1000)}.signature`;
const NEW_TOKEN = `header.${'b'.repeat(1000)}.signature`;

/** A session as the auth server issues one, `expiresIn` seconds before its access token ends. */
function sessionOf(accessToken: string, refreshToken: string, expiresIn: number): Session {
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: refreshToken,
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      aud: 'authenticated',
      email: 'mara@example.test',
      app_metadata: { provider: 'email' },
      user_metadata: { username: 'mara', display_name: 'Mara', padding: 'p'.repeat(1000) },
      created_at: '2026-11-01T10:00:00Z',
    },
  };
}

type Sent = { url: string; method: string; bearer: string | null; body: unknown };

/** Every request that reached the network, and what the network makes of the next one. */
let sent: Sent[];
let network: (request: Sent) => Response | Promise<Response>;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** A refusal in the shape the auth server gives one to supabase-js. */
const authRefusal = (status: number, code: string, message: string) =>
  json(status, { code, message }, { 'X-Supabase-Api-Version': '2024-01-01' });

const offline = () => Promise.reject(new TypeError('Network request failed'));

const isRenewal = (request: Sent) =>
  request.url.includes('/auth/v1/token?grant_type=refresh_token');

/** Puts a session in the keychain the way the app itself would have. */
async function keep(session: Session) {
  await secureStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/** What the keychain holds under the session's name. */
async function kept(): Promise<Session | null> {
  const value = await secureStorage.getItem(SESSION_KEY);
  return value === null ? null : (JSON.parse(value) as Session);
}

type Client = (typeof import('@/lib/supabase'))['supabase'];
type Store = typeof import('@/lib/session-store');
let supabase: Client | null;

/** What the app's screens are given, as of the latest render. */
let auth: AuthContextValue;
/** Everything the app has shown since it was opened, in order. */
let shown: string[];

/**
 * Opens the app: its client and its provider are loaded anew, as at a launch,
 * because both keep what they know in their modules. React itself is the one
 * this file renders with, or the provider's hooks would belong to another.
 *
 * `store` replaces parts of the app's own dealings with the keychain, for the
 * few cases that need to say when a read comes back, or what the device
 * believes is stored.
 */
async function launch({ store }: { store?: Partial<Store> } = {}) {
  jest.resetModules();
  jest.doMock('react', () => React);
  jest.doMock('react-native', () => ReactNative);
  if (store) {
    jest.doMock('@/lib/session-store', () => ({
      ...jest.requireActual<Store>('@/lib/session-store'),
      ...store,
    }));
  } else {
    jest.dontMock('@/lib/session-store');
  }

  const context = jest.requireActual<typeof import('@/features/auth/auth-context')>(
    '@/features/auth/auth-context',
  );
  const client = jest.requireActual<typeof import('@/lib/supabase')>('@/lib/supabase').supabase;
  supabase = client;
  shown = [];

  function Probe() {
    auth = context.useAuth();
    const showing = auth.isRestoring ? 'restoring' : auth.session ? 'signed in' : 'signed out';
    if (shown.at(-1) !== showing) shown.push(showing);
    return <ReactNative.Text testID="state">{showing}</ReactNative.Text>;
  }

  await render(
    <context.AuthProvider>
      <Probe />
    </context.AuthProvider>,
  );

  return {
    client,
    store: jest.requireActual<Store>('@/lib/session-store'),
  };
}

/** What the app would be showing: the splash, the roost or the welcome screen. */
const state = () => screen.getByTestId('state').props.children as string;

/** Lets time pass, with everything that is due in it. */
const passes = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

/** A moment: long enough to read the keychain, too short for anything to come back from a server. */
const A_MOMENT = 50;

/**
 * Does what a screen would ask of the app, and waits for it to be over, letting
 * time pass meanwhile: the client waits between its own attempts.
 */
async function asked<T>(ask: () => Promise<T>, withinSeconds = 120): Promise<T> {
  let done = false;
  let watched: Promise<T> = Promise.reject(new Error('never asked'));
  watched.catch(() => {});
  await act(async () => {
    watched = ask().finally(() => {
      done = true;
    });
    watched.catch(() => {});
    await jest.advanceTimersByTimeAsync(0);
  });
  for (let second = 0; second < withinSeconds && !done; second++) await passes(1000);
  if (!done) throw new Error(`still waiting after ${withinSeconds} s`);
  return watched;
}

/** What became of something asked of the app: nothing, or the words it failed with. */
const outcomeOf = (asking: Promise<unknown>) =>
  asking.then(
    () => 'done',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  // The client warns of every renewal it could not make. Errors are another
  // matter: React reports a state change made behind a test's back as one.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockKeychain.clear();
  mockRefusal.reads = false;
  mockRefusal.deletes = false;
  sent = [];
  network = () => json(200, []);
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request: Sent = {
      url: String(input),
      method: init?.method ?? 'GET',
      bearer: new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '') ?? null,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    };
    sent.push(request);
    return network(request);
  });
});

afterEach(async () => {
  await supabase?.auth.stopAutoRefresh();
  supabase = null;
  jest.useRealTimers();
  const errors = jest.mocked(console.error).mock.calls;
  jest.restoreAllMocks();
  expect(errors).toEqual([]);
});

describe('opening the app', () => {
  /**
   * After an hour away the access token has run out, and the client's own
   * answer to "is anyone signed in?" waits for a renewal: without a network
   * that was 26 seconds of splash screen, and then the welcome screen, as if
   * nobody were signed in - with the session still in the keychain.
   */
  it('is signed in at once with a stored session, whatever the network does', async () => {
    const session = sessionOf(OLD_TOKEN, 'refresh-old', -600);
    await keep(session);
    network = offline;

    await launch();
    await passes(A_MOMENT);

    expect(state()).toBe('signed in');
    expect(auth.session?.user.id).toBe(session.user.id);
  });

  /**
   * Half a minute in, the client gives up on the renewal and announces that it
   * has no session. That says the session could not be renewed just now, not
   * that it is gone.
   */
  it('stays signed in when the client gives up on renewing the session', async () => {
    const session = sessionOf(OLD_TOKEN, 'refresh-old', -600);
    await keep(session);
    network = offline;
    await launch();

    await passes(40_000);

    expect(sent.filter(isRenewal).length).toBeGreaterThan(1);
    expect(shown).toEqual(['restoring', 'signed in']);
    expect(await kept()).toEqual(session);
  });

  it('is signed in at once on a connection that never answers', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = () => new Promise<Response>(() => {});

    await launch();
    await passes(A_MOMENT);

    expect(state()).toBe('signed in');
  });

  it('is signed out at once with nothing stored', async () => {
    network = offline;

    await launch();
    await passes(A_MOMENT);

    expect(state()).toBe('signed out');
    expect(sent).toEqual([]);
  });

  /**
   * Android's keystore and the iOS keychain can both refuse a read. Nothing
   * that can be read is nothing to be signed in with; the entry itself is left
   * for a launch at which it can be read again.
   */
  it('is signed out at once when the keychain refuses to be read, and leaves the entry alone', async () => {
    const session = sessionOf(OLD_TOKEN, 'refresh-old', 3000);
    await keep(session);
    mockRefusal.reads = true;

    await launch();
    await passes(A_MOMENT);

    expect(state()).toBe('signed out');
    mockRefusal.reads = false;
    expect(await kept()).toEqual(session);
  });

  it('does not wait behind the splash for a read that fails in a way nobody foresaw', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = () => new Promise<Response>(() => {});

    const readStoredSession = () => Promise.reject(new Error('the keychain is not there'));
    await launch({ store: { readStoredSession } });
    await passes(A_MOMENT);

    expect(state()).toBe('signed out');
  });

  it('takes the renewed session once the client has one', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = (request) =>
      isRenewal(request) ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)) : json(200, []);

    await launch();
    await passes(1000);

    expect(shown).toEqual(['restoring', 'signed in']);
    expect(auth.session?.access_token).toBe(NEW_TOKEN);
  });

  /**
   * Signed out on another device, or removed: the auth server refuses the
   * renewal, the client deletes the session and says so.
   */
  it('is signed out once the auth server says the session is over', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = (request) =>
      isRenewal(request)
        ? authRefusal(
            400,
            'refresh_token_not_found',
            'Invalid Refresh Token: Refresh Token Not Found',
          )
        : json(200, []);

    await launch();
    await passes(1000);

    expect(state()).toBe('signed out');
    expect(mockKeychain.size).toBe(0);
  });

  /**
   * The keychain is read while the client starts. If the client has spoken by
   * the time the read comes back, the read is the older news.
   */
  it('does not sign in again from a read that comes back after the client has signed out', async () => {
    const session = sessionOf(OLD_TOKEN, 'refresh-old', -600);
    await keep(session);
    network = (request) =>
      isRenewal(request)
        ? authRefusal(
            400,
            'refresh_token_not_found',
            'Invalid Refresh Token: Refresh Token Not Found',
          )
        : json(200, []);
    let comeBack: (stored: Session | null) => void = () => {};
    const readStoredSession = () => new Promise<Session | null>((resolve) => (comeBack = resolve));

    await launch({ store: { readStoredSession } });
    await passes(1000);
    expect(state()).toBe('signed out');

    await act(async () => comeBack(session));

    expect(state()).toBe('signed out');
  });

  /**
   * "No session" from the client keeps a courier signed in only for as long as
   * the session is in fact on the device.
   */
  it('is signed out when the client finds no session and none is stored any more', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = offline;
    const { store } = await launch();
    await passes(A_MOMENT);
    expect(state()).toBe('signed in');

    // Removed behind the client's back, while it is still trying to renew.
    await act(() => store.clearStoredSession());
    await passes(40_000);

    expect(state()).toBe('signed out');
  });
});

describe('while the app is open', () => {
  it('takes each session the client announces', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 200));
    network = (request) =>
      isRenewal(request) ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)) : json(200, []);
    await launch();
    await passes(A_MOMENT);
    expect(auth.session?.access_token).toBe(OLD_TOKEN);

    // The client renews by itself as the hour runs out.
    await passes(120_000);

    expect(auth.session?.access_token).toBe(NEW_TOKEN);
    expect(state()).toBe('signed in');
  });

  /**
   * The database refuses the token and the auth server the renewal: the
   * session has been ended somewhere else. The app goes to the welcome screen.
   */
  it('is signed out when the session turns out to be over', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
    network = (request) => {
      if (isRenewal(request)) {
        return authRefusal(
          400,
          'refresh_token_not_found',
          'Invalid Refresh Token: Refresh Token Not Found',
        );
      }
      return request.url.includes('/rest/v1/')
        ? json(401, { code: 'PGRST303', details: null, hint: null, message: 'JWT expired' })
        : authRefusal(403, 'bad_jwt', 'invalid JWT: token has invalid claims: token is expired');
    };
    const { client } = await launch();
    await passes(A_MOMENT);
    expect(state()).toBe('signed in');

    await asked(async () => client.rpc('get_roost'));

    expect(state()).toBe('signed out');
    expect(mockKeychain.size).toBe(0);
  });

  /**
   * On the web build a sign-out can come from another tab, which removes the
   * session without this tab's knowing. What the client announces as a
   * sign-out is one, whatever this device still believes is stored.
   */
  it('is signed out when the client announces a sign-out, whatever is believed to be stored', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
    network = () => new Response(null, { status: 204 });
    const { client } = await launch({ store: { isSessionStored: () => true } });
    await passes(A_MOMENT);
    expect(state()).toBe('signed in');

    await asked(async () => client.auth.signOut());

    expect(state()).toBe('signed out');
  });
});

describe('signing out', () => {
  const isLogout = (request: Sent) => request.url.includes('/auth/v1/logout');
  const isSignIn = (request: Sent) => request.url.includes('/auth/v1/token?grant_type=password');
  const loggedOut = () => new Response(null, { status: 204 });

  it('tells the server, and leaves nothing on the device', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
    network = (request) => (isLogout(request) ? loggedOut() : json(200, []));
    await launch();
    await passes(A_MOMENT);

    await asked(() => auth.signOut());

    // Everywhere: the session ends on the courier's other devices too.
    expect(sent.filter(isLogout).map(({ url, bearer }) => [url.split('?')[1], bearer])).toEqual([
      ['scope=global', OLD_TOKEN],
    ]);
    expect(state()).toBe('signed out');
    expect(mockKeychain.size).toBe(0);
  });

  /**
   * Nothing is left to finish after a sign-out the server heard of, so
   * whichever way a session comes next, it is taken.
   */
  it('takes the next session the client announces after a sign-out the server heard of', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
    network = (request) => {
      if (isLogout(request)) return loggedOut();
      return isSignIn(request)
        ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600))
        : json(200, []);
    };
    const { client } = await launch();
    await asked(() => auth.signOut());
    expect(state()).toBe('signed out');

    await asked(async () =>
      client.auth.signInWithPassword({ email: 'mara@example.test', password: 'night-courier' }),
    );

    expect(state()).toBe('signed in');
    expect(sent.filter(isLogout)).toHaveLength(1);
  });

  it('signs out of the device when the server cannot be reached, and does not complain', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
    network = offline;
    await launch();
    await passes(A_MOMENT);

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(mockKeychain.size).toBe(0);
  });

  /**
   * To tell the server, the client first has to renew a token that has run
   * out. Without a network it cannot, and it then gives up without removing
   * anything: "Sign out" did nothing at all, on a phone about to be handed on.
   */
  it('signs out of the device when the token is over an hour old and there is no network', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = offline;
    await launch();
    await passes(A_MOMENT);
    expect(state()).toBe('signed in');

    const started = Date.now();
    expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(mockKeychain.size).toBe(0);
    // No longer than the client itself keeps trying to renew.
    expect(Date.now() - started).toBeLessThanOrEqual(30_000);
  });

  it('signs out of the device on a connection that never answers', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = () => new Promise<Response>(() => {});
    await launch();
    await passes(A_MOMENT);

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(mockKeychain.size).toBe(0);
  });

  describe('when the server did not hear of it', () => {
    /** Signed out in flight mode, an hour after the app was last used. */
    async function signOutUnheard() {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
      network = offline;
      const launched = await launch();
      await asked(() => auth.signOut());
      expect(state()).toBe('signed out');
      return launched;
    }

    /** The network is back, and the auth server answers everything. */
    const online = () => {
      network = (request) => {
        if (isRenewal(request)) return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));
        if (isSignIn(request)) return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));
        return isLogout(request) ? loggedOut() : json(200, []);
      };
    };

    /**
     * Stands in for a renewal that was under way when the session was taken
     * from the keychain: the client saves what such a renewal brings, and
     * announces it, as it does here for a renewal asked of it directly.
     */
    async function aLateRenewalArrives(client: Client) {
      // Past the minute for which the client answers from the failure it remembers.
      await passes(61_000);
      await asked(async () => client.auth.refreshSession({ refresh_token: 'refresh-old' }));
      await passes(1000);
    }

    /**
     * The server still honours the session. A renewal that comes through
     * afterwards would sign the device in again with nobody having signed in.
     */
    it('does not sign in again by a renewal that comes through afterwards, and tells the server then', async () => {
      const { client } = await signOutUnheard();
      online();

      await aLateRenewalArrives(client);

      expect(sent.filter(isRenewal).at(-1)?.body).toEqual({ refresh_token: 'refresh-old' });
      expect(shown).toEqual(['restoring', 'signed in', 'signed out']);
      expect(sent.filter(isLogout).map((request) => request.bearer)).toEqual([NEW_TOKEN]);
      expect(mockKeychain.size).toBe(0);
    });

    it('lets the courier sign in again', async () => {
      await signOutUnheard();
      online();

      await asked(() => auth.signIn('mara@example.test', 'night-courier'));

      expect(state()).toBe('signed in');
      expect(sent.filter(isLogout)).toEqual([]);
      expect((await kept())?.refresh_token).toBe('refresh-new');
    });

    it('lets someone else sign up on the device', async () => {
      await signOutUnheard();
      network = (request) =>
        request.url.includes('/auth/v1/signup')
          ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600))
          : json(200, []);

      await asked(() =>
        auth.signUp({
          email: 'ben@example.test',
          password: 'night-courier',
          username: 'ben',
          displayName: 'Ben',
        }),
      );

      expect(state()).toBe('signed in');
      expect(sent.filter(isLogout)).toEqual([]);
    });
  });

  /**
   * The one way signing out can fail: the keychain will not let go of the
   * session. Showing the welcome screen then would be a lie the next launch
   * exposes.
   */
  it('says so, and stays signed in, when the session cannot be removed from the device', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = offline;
    await launch();
    await passes(A_MOMENT);
    mockRefusal.deletes = true;

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe(
      'This device could not be signed out. Try again.',
    );

    expect(state()).toBe('signed in');
  });

  it('goes on as signed in after a sign-out that failed, renewals included', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = offline;
    const { client } = await launch();
    await passes(A_MOMENT);
    mockRefusal.deletes = true;
    await outcomeOf(asked(() => auth.signOut()));

    mockRefusal.deletes = false;
    network = (request) =>
      isRenewal(request) ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)) : loggedOut();
    await passes(61_000);
    await asked(async () => client.auth.refreshSession());

    expect(state()).toBe('signed in');
    expect(auth.session?.access_token).toBe(NEW_TOKEN);
    expect(sent.filter(isLogout)).toEqual([]);
  });

  it('says so as well when it is the client that could not remove the session', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
    network = offline;
    await launch();
    await passes(A_MOMENT);
    mockRefusal.deletes = true;

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe(
      'This device could not be signed out. Try again.',
    );

    expect(state()).toBe('signed in');
  });
});
