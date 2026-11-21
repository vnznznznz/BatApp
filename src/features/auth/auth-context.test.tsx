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

const mockKeychain = new Map<string, string>();
const mockRefusal = { reads: false, writes: false, deletes: false };

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
      if (mockRefusal.writes) throw new Error('Could not encrypt the value for SecureStore');
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

type Sent = {
  url: string;
  method: string;
  bearer: string | null;
  /** The project's key, which the hosted project's gateway asks of every request. */
  apikey: string | null;
  body: unknown;
};

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
/** What every render since the app was opened was given, in order. */
let rendered: AuthContextValue[];

/**
 * Opens the app: its client and its provider are loaded anew, as at a launch,
 * because both keep what they know in their modules. React itself is the one
 * this file renders with, or the provider's hooks would belong to another.
 *
 * `store` replaces parts of the app's own dealings with the keychain, for the
 * few cases that need to say when a read comes back, or what the device
 * believes is stored. `beforeOpening` is handed the client before the provider
 * has asked anything of it.
 */
async function launch({
  store,
  beforeOpening,
}: { store?: Partial<Store>; beforeOpening?: (client: Client) => void } = {}) {
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
  beforeOpening?.(client);
  shown = [];
  rendered = [];

  function Probe() {
    auth = context.useAuth();
    rendered.push(auth);
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

/**
 * A phone has no WebCrypto: neither Hermes nor Expo puts a `crypto` in place
 * (expo/src/winter installs URL, TextDecoder and others, not it). There
 * auth-js makes the verifier for its code flow with Math.random and sends it
 * as its own challenge ("plain"), with a warning in the console each time.
 * These tests do as a phone does - which also keeps the challenge from being
 * worked out on another thread while the clock here is a fake one.
 */
const webCrypto = (globalThis as { crypto?: unknown }).crypto;
const cryptoAs = (value: unknown) =>
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });

beforeAll(() => cryptoAs(undefined));
afterAll(() => cryptoAs(webCrypto));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  // The client warns of every renewal it could not make. Errors are another
  // matter: React reports a state change made behind a test's back as one.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockKeychain.clear();
  mockRefusal.reads = false;
  mockRefusal.writes = false;
  mockRefusal.deletes = false;
  sent = [];
  network = () => json(200, []);
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request: Sent = {
      url: String(input),
      method: init?.method ?? 'GET',
      bearer: new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '') ?? null,
      apikey: new Headers(init?.headers).get('apikey'),
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
   * A suspended account an hour after the app was last used was signed out at
   * its start, and landed on the welcome screen with nothing to say why.
   * (Found in the browser.)
   */
  it('leaves word for the welcome screen when the session ends for a suspension', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = (request) =>
      isRenewal(request)
        ? authRefusal(400, 'user_banned', 'Invalid Refresh Token: User Banned')
        : json(200, []);

    await launch();
    await passes(1000);

    expect(state()).toBe('signed out');
    const farewell = jest.requireActual<typeof import('@/lib/farewell')>('@/lib/farewell');
    expect(farewell.farewellDue()).toBe('suspended');
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
   * The client goes on announcing to whoever has asked it to, for as long as
   * it lives. A provider that is gone has to say that it no longer wants to
   * hear: once it has, the client cannot reach it - auth-js looks its
   * listeners up anew for every announcement.
   */
  it('stops listening to the client once it is gone', async () => {
    const stopped = jest.fn();
    await launch({
      beforeOpening: (client) => {
        const listen = client.auth.onAuthStateChange.bind(client.auth);
        jest.spyOn(client.auth, 'onAuthStateChange').mockImplementation((listener) => {
          const { data } = listen(listener);
          const stop = data.subscription.unsubscribe;
          data.subscription.unsubscribe = () => {
            stopped();
            stop();
          };
          return { data };
        });
      },
    });
    await passes(A_MOMENT);
    expect(stopped).not.toHaveBeenCalled();

    await screen.unmount();

    expect(stopped).toHaveBeenCalledTimes(1);
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

    const started = Date.now();
    expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(mockKeychain.size).toBe(0);
    // Two attempts at renewing, twenty seconds each, before the client gives up.
    expect(Date.now() - started).toBeLessThanOrEqual(45_000);
  });

  describe('when the server cannot be told in time', () => {
    /**
     * Presses Sign out, and lets time pass until the device is signed out, or
     * a minute has gone by. Resolves with how long that took, and with how the
     * press itself ended, once it has.
     */
    async function pressSignOut() {
      const started = Date.now();
      let ended = 'still waiting';
      await act(async () => {
        void outcomeOf(auth.signOut()).then((said) => {
          ended = said;
        });
        await jest.advanceTimersByTimeAsync(0);
      });
      while (state() !== 'signed out' && Date.now() - started < 60_000) await passes(100);
      return { took: Date.now() - started, ended: () => ended };
    }

    /**
     * The client renews a token over an hour old before it can tell the
     * server, and without a network it tries for half a minute: "Sign out"
     * spun all that time, on the welcome screen's doorstep. (Found in the
     * browser: 24.6 s, at the app's start; and as long again after any
     * renewal, while the client was at it.)
     */
    it('signs out of the device within seconds while the client is still renewing', async () => {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
      network = offline;
      await launch();
      await passes(A_MOMENT);

      const { took, ended } = await pressSignOut();

      expect(state()).toBe('signed out');
      expect(mockKeychain.size).toBe(0);
      expect(took).toBeLessThanOrEqual(5_500);
      // And it is over, without a word of complaint, once the client has given up.
      await passes(30_000);
      expect(ended()).toBe('done');
    });

    it('signs out of the device within seconds on a connection that never answers', async () => {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
      network = () => new Promise<Response>(() => {});
      await launch();
      await passes(A_MOMENT);

      const { took, ended } = await pressSignOut();

      expect(state()).toBe('signed out');
      expect(took).toBeLessThanOrEqual(5_500);
      await passes(45_000);
      expect(ended()).toBe('done');
    });

    /** A renewal begun later - by "Try again", say - is waited for no longer. */
    it('signs out of the device within seconds while a renewal asked for later is under way', async () => {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
      network = offline;
      const { client } = await launch();
      // The renewal at the start has failed by now, and is remembered.
      await passes(30_000);
      jest.requireActual<typeof import('@/lib/renewal')>('@/lib/renewal').renewOnNextRequest();
      void client.rpc('get_roost').then(() => {});
      await passes(1000);
      const renewals = sent.filter(isRenewal).length;

      const { took, ended } = await pressSignOut();

      expect(state()).toBe('signed out');
      expect(took).toBeLessThanOrEqual(5_500);
      // The renewal was under way: the press waited for it, and started none.
      expect(sent.filter(isRenewal).length - renewals).toBeLessThanOrEqual(5);
      await passes(30_000);
      expect(ended()).toBe('done');
    });

    /**
     * Whoever signs in while the client is still at the sign-out stays signed
     * in when it gives up: what it gives up on is the session before theirs.
     */
    it('leaves someone who signs in meanwhile signed in', async () => {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
      network = offline;
      const { client } = await launch();
      await passes(30_000);
      jest.requireActual<typeof import('@/lib/renewal')>('@/lib/renewal').renewOnNextRequest();
      void client.rpc('get_roost').then(() => {});
      await passes(1000);
      await pressSignOut();
      expect(state()).toBe('signed out');

      network = (request) => {
        if (isSignIn(request)) return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));
        if (isRenewal(request)) return json(200, sessionOf(NEW_TOKEN, 'refresh-renewed', 3600));
        return isLogout(request) ? loggedOut() : json(200, []);
      };
      await asked(() => auth.signIn('mara@example.test', 'night-courier'));
      await passes(30_000);

      expect(state()).toBe('signed in');
      expect((await kept())?.refresh_token).toBe('refresh-new');
    });

    /**
     * The server is told, only later than the device lets go. Whoever answers
     * last, the sign-out is heard of once.
     */
    it('lets the server hear of it when the answer comes late', async () => {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
      network = (request) =>
        isLogout(request)
          ? new Promise<Response>((resolve) => setTimeout(() => resolve(loggedOut()), 8000))
          : json(200, []);
      await launch();
      await passes(A_MOMENT);

      const { took, ended } = await pressSignOut();
      expect(took).toBeLessThanOrEqual(5_500);
      await passes(5000);

      expect(sent.filter(isLogout)).toHaveLength(1);
      expect(ended()).toBe('done');
      expect(state()).toBe('signed out');
      expect(mockKeychain.size).toBe(0);
    });

    /**
     * The device lets go after five seconds, but the client's sign-out goes on,
     * and when its request ends - answered, or given up on after twenty seconds
     * - it removes whatever session is stored by then. Whoever had signed in
     * meanwhile was signed out again, and once the client was renewing at the
     * start, it even told the server to end every session of theirs. (Found in
     * review.) Signing in waits until the sign-out is over.
     */
    describe('and someone signs in again meanwhile', () => {
      const THEIR_TOKEN = `header.${'c'.repeat(1000)}.signature`;
      const theirs = () => sessionOf(THEIR_TOKEN, 'refresh-theirs', 3600);
      const isSignUp = (request: Sent) => request.url.includes('/auth/v1/signup');
      const answeredLate = () =>
        new Promise<Response>((resolve) => setTimeout(() => resolve(loggedOut()), 12_000));

      it.each<[string, () => Promise<Response>]>([
        ['is answered after twelve seconds', answeredLate],
        ['is never answered', () => new Promise<Response>(() => {})],
      ])('stays signed in when the logout request %s', async (_, logout) => {
        await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
        network = (request) => {
          if (isLogout(request)) return logout();
          return isSignIn(request) ? json(200, theirs()) : json(200, []);
        };
        await launch();
        await passes(A_MOMENT);
        const { took } = await pressSignOut();
        expect(took).toBeLessThanOrEqual(5_500);

        await asked(() => auth.signIn('ben@example.test', 'night-courier'));
        await passes(30_000);

        expect(state()).toBe('signed in');
        expect(shown).toEqual(['restoring', 'signed in', 'signed out', 'signed in']);
        expect((await kept())?.refresh_token).toBe('refresh-theirs');
        expect(sent.filter(isLogout).map(({ bearer }) => bearer)).toEqual([OLD_TOKEN]);
      });

      it('stays signed in after signing up', async () => {
        await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
        network = (request) => {
          if (isLogout(request)) return answeredLate();
          return isSignUp(request) ? json(200, theirs()) : json(200, []);
        };
        await launch();
        await passes(A_MOMENT);
        await pressSignOut();

        await asked(() =>
          auth.signUp({
            email: 'ben@example.test',
            password: 'night-courier',
            username: 'ben',
            displayName: 'Ben',
          }),
        );
        await passes(30_000);

        expect(state()).toBe('signed in');
        expect((await kept())?.refresh_token).toBe('refresh-theirs');
      });

      /**
       * The client takes no sign-out further while it renews the session at
       * the start. Once that was over it found the newcomer's session stored,
       * told the server to end every session of theirs, and removed it.
       */
      it('stays signed in, everywhere, when the client was renewing at the start', async () => {
        await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
        network = offline;
        await launch();
        await passes(A_MOMENT);
        await pressSignOut();

        network = (request) => {
          if (isSignIn(request)) return json(200, theirs());
          if (isRenewal(request)) return json(200, sessionOf(NEW_TOKEN, 'refresh-renewed', 3600));
          return isLogout(request) ? loggedOut() : json(200, []);
        };
        await asked(() => auth.signIn('ben@example.test', 'night-courier'));
        await passes(30_000);

        expect(state()).toBe('signed in');
        expect((await kept())?.refresh_token).toBe('refresh-theirs');
        expect(sent.filter(isLogout).map(({ bearer }) => bearer)).not.toContain(THEIR_TOKEN);
      });

      /**
       * A code from an email signs the courier in as a password does, and the
       * sign-out removed the session it brought just the same: each code only
       * cleared the mark of a sign-out the server had not heard of, and waited
       * for nothing. (Found in the merge with the codes.) A code a password is
       * set after holds the way in, and what it is for must outlast the wait:
       * the sign-out, once over, forgets whatever a code had left to do.
       */
      it.each<[string, () => Promise<unknown>, object | null]>([
        [
          'confirming an address from signing in',
          () => auth.confirmEmail('ben@example.test', '12345678'),
          null,
        ],
        [
          'confirming the account just signed up for',
          () =>
            auth.confirmSignUp(
              {
                email: 'ben@example.test',
                password: 'night-courier',
                username: 'ben',
                displayName: 'Ben',
              },
              '12345678',
            ),
          { flow: 'sign-up', email: 'ben@example.test', username: 'ben', displayName: 'Ben' },
        ],
        [
          'checking the code of a password reset',
          () => auth.verifyResetCode('ben@example.test', '12345678'),
          { flow: 'reset', email: 'ben@example.test' },
        ],
      ])('stays signed in after %s, with what the code is for', async (_, check, left) => {
        await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
        network = (request) => {
          if (isLogout(request)) return answeredLate();
          return request.url.endsWith('/auth/v1/verify') ? json(200, theirs()) : json(200, []);
        };
        await launch();
        await passes(A_MOMENT);
        await pressSignOut();

        await asked(check);
        await passes(30_000);

        expect(state()).toBe('signed in');
        expect((await kept())?.refresh_token).toBe('refresh-theirs');
        expect(auth.isSettingPassword).toBe(left !== null);
        expect(auth.unfinished).toEqual(left);
        expect(JSON.parse(mockKeychain.get('night-courier.unfinished') ?? 'null')).toEqual(left);
      });
    });

    /**
     * A token over an hour old is renewed before the server can be told, and a
     * renewal that comes back once the device has let go, the client throws
     * away: the session is no longer stored. It then told the server nothing,
     * however soon the network was back. (Found in review.) The server is told
     * once more with the token the session had, and, when it says that one has
     * run out, with a renewed one.
     */
    describe('with a token over an hour old', () => {
      const RENEWED_TOKEN = `header.${'d'.repeat(1000)}.signature`;
      const isLogoutWith = (token: string) => (request: Sent) =>
        isLogout(request) && request.bearer === token;

      /** The auth server, reachable again, as it answers. */
      function backOnline({ logoutTakes = 0 } = {}) {
        network = (request) => {
          if (isRenewal(request)) {
            return json(200, sessionOf(RENEWED_TOKEN, 'refresh-renewed', 3600));
          }
          if (isLogoutWith(OLD_TOKEN)(request)) {
            return authRefusal(
              403,
              'bad_jwt',
              'invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired',
            );
          }
          if (isLogout(request)) {
            return new Promise<Response>((resolve) =>
              setTimeout(() => resolve(loggedOut()), logoutTakes),
            );
          }
          return json(200, []);
        };
      }

      it('tells the server after all when the network is back while the client renews at the start', async () => {
        await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
        network = offline;
        await launch();
        await passes(A_MOMENT);
        const { ended } = await pressSignOut();
        expect(mockKeychain.size).toBe(0);

        backOnline();
        await passes(40_000);

        expect(
          sent
            .filter(isLogoutWith(RENEWED_TOKEN))
            .map(({ url, bearer }) => [url.split('?')[1], bearer]),
        ).toEqual([['scope=global', RENEWED_TOKEN]]);
        expect(sent.filter(isRenewal).at(-1)?.body).toEqual({ refresh_token: 'refresh-old' });
        expect(shown).toEqual(['restoring', 'signed in', 'signed out']);
        expect(mockKeychain.size).toBe(0);
        expect(ended()).toBe('done');
      });

      it('tells the server after all when the network is back while a renewal asked for later is under way', async () => {
        await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
        network = offline;
        const { client } = await launch();
        await passes(30_000);
        jest.requireActual<typeof import('@/lib/renewal')>('@/lib/renewal').renewOnNextRequest();
        void client.rpc('get_roost').then(() => {});
        await passes(1000);
        await pressSignOut();

        // The client's next attempt comes within 13 seconds; the logout is
        // answered 18 seconds after it is sent.
        backOnline({ logoutTakes: 18_000 });
        await passes(13_000);
        // Nothing of the account is kept or shown while the server is told.
        expect(sent.filter(isLogoutWith(RENEWED_TOKEN))).toHaveLength(1);
        expect(mockKeychain.size).toBe(0);
        expect(state()).toBe('signed out');
        await passes(20_000);

        expect(sent.filter(isLogoutWith(RENEWED_TOKEN))).toHaveLength(1);
        expect(shown).toEqual(['restoring', 'signed in', 'signed out']);
        expect(mockKeychain.size).toBe(0);
      });

      /**
       * Telling the server ends every session of the account, a session begun
       * a moment before included. Whoever signs in next waits until it is told.
       */
      it('lets whoever signs in next wait until the server has been told', async () => {
        await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
        network = offline;
        await launch();
        await passes(A_MOMENT);
        await pressSignOut();

        backOnline({ logoutTakes: 3000 });
        const answer = network;
        network = (request) =>
          isSignIn(request)
            ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600))
            : answer(request);
        await asked(() => auth.signIn('mara@example.test', 'night-courier'));

        const order = sent
          .filter((request) => isSignIn(request) || isLogoutWith(RENEWED_TOKEN)(request))
          .map((request) => (isSignIn(request) ? 'signed in' : 'told'));
        expect(order).toEqual(['told', 'signed in']);
        expect(state()).toBe('signed in');
        expect((await kept())?.refresh_token).toBe('refresh-new');
      });

      /**
       * Without a network the one more try fails at once, and the client's
       * half minute of renewals is not begun again: nobody who signs in next is
       * kept waiting for it.
       */
      it('tries once more, and holds nobody up, when the network stays away', async () => {
        await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
        network = offline;
        await launch();
        await passes(A_MOMENT);
        const { ended } = await pressSignOut();
        await passes(30_000);
        expect(ended()).toBe('done');
        const renewals = sent.filter(isRenewal).length;

        network = (request) =>
          isSignIn(request) ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)) : json(200, []);
        const started = Date.now();
        await asked(() => auth.signIn('mara@example.test', 'night-courier'));

        expect(Date.now() - started).toBeLessThan(1000);
        expect(sent.filter(isRenewal)).toHaveLength(renewals);
        expect(sent.filter(isLogout).map(({ bearer }) => bearer)).toEqual([OLD_TOKEN]);
        expect(state()).toBe('signed in');
      });
    });
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
      // Everywhere, as the sign-out it finishes was meant: on the other devices
      // too. (The first is the sign-out's own last try, without a network.)
      expect(sent.filter(isLogout).map(({ url, bearer }) => [url.split('?')[1], bearer])).toEqual([
        ['scope=global', OLD_TOKEN],
        ['scope=global', NEW_TOKEN],
      ]);
      expect(mockKeychain.size).toBe(0);
    });

    /**
     * Telling the server takes a moment, and on a slow connection a long one.
     * Nobody has signed in: the roost is not to be shown for that moment.
     */
    it('shows nothing of the account while the server is being told', async () => {
      const { client } = await signOutUnheard();
      online();
      const answer = network;
      network = (request) =>
        isLogout(request)
          ? new Promise<Response>((resolve) => setTimeout(() => resolve(loggedOut()), 3000))
          : answer(request);

      await aLateRenewalArrives(client);
      expect(
        sent.filter((request) => isLogout(request) && request.bearer === NEW_TOKEN),
      ).toHaveLength(1);
      expect(state()).toBe('signed out');
      await passes(5000);

      expect(shown).toEqual(['restoring', 'signed in', 'signed out']);
      expect(mockKeychain.size).toBe(0);
    });

    /**
     * Ending that session ends with the client removing whatever is stored by
     * then. Someone who signs in while the server is being told stays signed in.
     */
    it('lets someone who signs in while that session is being ended stay signed in', async () => {
      const { client } = await signOutUnheard();
      online();
      const answer = network;
      network = (request) =>
        isLogout(request)
          ? new Promise<Response>((resolve) => setTimeout(() => resolve(loggedOut()), 10_000))
          : answer(request);
      await passes(61_000);
      await asked(async () => client.auth.refreshSession({ refresh_token: 'refresh-old' }));

      const theirs = sessionOf(`header.${'c'.repeat(1000)}.signature`, 'refresh-theirs', 3600);
      network = (request) => (isSignIn(request) ? json(200, theirs) : answer(request));
      await asked(() => auth.signIn('ben@example.test', 'night-courier'));
      await passes(20_000);

      expect(state()).toBe('signed in');
      expect((await kept())?.refresh_token).toBe('refresh-theirs');
    });

    it('lets the courier sign in again', async () => {
      await signOutUnheard();
      online();

      await asked(() => auth.signIn('mara@example.test', 'night-courier'));

      expect(state()).toBe('signed in');
      // None but the sign-out's own last try, without a network.
      expect(sent.filter(isLogout).map(({ bearer }) => bearer)).toEqual([OLD_TOKEN]);
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
      expect(sent.filter(isLogout).map(({ bearer }) => bearer)).toEqual([OLD_TOKEN]);
    });

    /**
     * A code from an email signs in as a password does, and is the courier's
     * own doing as much: the session it brings is taken, not ended as one that
     * came back by itself would be.
     */
    const isVerify = (request: Sent) => request.url.endsWith('/auth/v1/verify');
    const verifies = () => {
      network = (request) =>
        isVerify(request) ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)) : json(200, []);
    };

    it('lets someone confirm a new account with a code on the device', async () => {
      await signOutUnheard();
      verifies();

      await asked(() => auth.confirmEmail('ben@example.test', '12345678'));

      expect(state()).toBe('signed in');
      // None but the sign-out's own last try, without a network.
      expect(sent.filter(isLogout).map(({ bearer }) => bearer)).toEqual([OLD_TOKEN]);
      expect((await kept())?.refresh_token).toBe('refresh-new');
    });

    it('lets someone confirm the account they have just signed up for with a code on the device', async () => {
      await signOutUnheard();
      verifies();

      await asked(() =>
        auth.confirmSignUp(
          { email: 'ben@example.test', password: 'pw', username: 'ben', displayName: 'Ben' },
          '12345678',
        ),
      );

      expect(state()).toBe('signed in');
      expect(sent.filter(isLogout).map(({ bearer }) => bearer)).toEqual([OLD_TOKEN]);
    });

    it('lets the courier set a new password with a code on the device', async () => {
      await signOutUnheard();
      verifies();

      await asked(() => auth.verifyResetCode('mara@example.test', '12345678'));

      expect(state()).toBe('signed in');
      expect(sent.filter(isLogout).map(({ bearer }) => bearer)).toEqual([OLD_TOKEN]);
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

describe('deleting the account', () => {
  const isDeletion = (request: Sent) => request.url.includes('/rest/v1/rpc/delete_own_account');
  const isWhoAmI = (request: Sent) => request.url.endsWith('/auth/v1/user');
  const isLogout = (request: Sent) => request.url.includes('/auth/v1/logout');

  /** What the auth server answers to anything asked in the name of an account that is gone. */
  const noSuchUser = () =>
    authRefusal(403, 'user_not_found', 'User from sub claim in JWT does not exist');
  const user = () => json(200, sessionOf(OLD_TOKEN, 'refresh-old', 3000).user);

  const COULD_NOT_DELETE = 'Your account could not be deleted. Please try again.';

  async function signedIn() {
    const session = sessionOf(OLD_TOKEN, 'refresh-old', 3000);
    await keep(session);
    await launch();
    await passes(A_MOMENT);
    expect(state()).toBe('signed in');
    return session;
  }

  it('deletes it, and leaves nothing on the device', async () => {
    network = (request) => {
      if (isDeletion(request)) return new Response(null, { status: 204 });
      return isLogout(request) ? noSuchUser() : json(200, []);
    };
    await signedIn();

    expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe('done');

    expect(sent.filter(isDeletion).map(({ method, bearer }) => [method, bearer])).toEqual([
      ['POST', OLD_TOKEN],
    ]);
    expect(state()).toBe('signed out');
    expect(mockKeychain.size).toBe(0);
  });

  /**
   * Once the account is gone the device is signed out by the app's own
   * signing out, which does not depend on the server hearing of it, and has
   * words of its own for a keychain that will not let go. The server is not
   * asked at all: it has no session left to end, and answered the sign-out
   * with an error, user_not_found, that the browser logged. (Found in the
   * browser.)
   */
  it('signs out of the device without asking the server, which has nothing left to end', async () => {
    network = (request) => {
      if (isDeletion(request)) return new Response(null, { status: 204 });
      return isLogout(request) ? noSuchUser() : json(200, []);
    };
    await signedIn();

    expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe('done');

    expect(sent.filter(isLogout)).toEqual([]);
    expect(state()).toBe('signed out');
    expect(mockKeychain.size).toBe(0);
  });

  /** The welcome screen says what happened: it said nothing. (Found in the browser.) */
  it('leaves word for the welcome screen that the account has been deleted', async () => {
    network = (request) =>
      isDeletion(request) ? new Response(null, { status: 204 }) : json(200, []);
    await signedIn();
    const farewell = jest.requireActual<typeof import('@/lib/farewell')>('@/lib/farewell');
    expect(farewell.isFarewellDue()).toBe(false);

    await asked(() => auth.deleteAccount());

    expect(farewell.isFarewellDue()).toBe(true);
  });

  it('leaves no such word when the account could not be deleted', async () => {
    network = (request) =>
      isDeletion(request)
        ? json(400, { code: 'P0001', hint: 'account_suspended', message: 'suspended' })
        : json(200, []);
    await signedIn();
    const farewell = jest.requireActual<typeof import('@/lib/farewell')>('@/lib/farewell');

    await outcomeOf(asked(() => auth.deleteAccount()));

    expect(farewell.isFarewellDue()).toBe(false);
  });

  it('says so when the device cannot be signed out after the deletion', async () => {
    network = (request) => {
      if (isDeletion(request)) return new Response(null, { status: 204 });
      return isLogout(request) ? noSuchUser() : json(200, []);
    };
    await signedIn();
    mockRefusal.deletes = true;

    expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe(
      'This device could not be signed out. Try again.',
    );

    expect(sent.filter(isDeletion)).toHaveLength(1);
    expect(state()).toBe('signed in');
  });

  /**
   * The database refuses a suspended or removed account, so that deleting it
   * cannot undo the suspension. A refusal is an answer: the account is there.
   */
  it('says why when the database refuses, and asks nobody else', async () => {
    network = (request) =>
      isDeletion(request)
        ? json(400, {
            code: 'P0001',
            details: null,
            hint: 'account_suspended',
            message: 'this account is suspended',
          })
        : json(200, []);
    const session = await signedIn();

    expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe(
      'This account has been suspended. Write to the contact address on the help page.',
    );

    expect(sent.filter(isWhoAmI)).toEqual([]);
    expect(state()).toBe('signed in');
    expect(await kept()).toEqual(session);
  });

  /**
   * A request that fails without a refusal says nothing about the account: it
   * may have been deleted and only the answer lost. Saying "could not delete"
   * then left the courier signed in to an account that no longer existed.
   */
  describe('when no answer comes back', () => {
    /**
     * The auth server's word that the user does not exist: as it says it
     * today, by its code alone should the words change, and in the words alone
     * of a server from before it had codes.
     */
    it.each<[string, () => Response]>([
      ['the account turns out to be gone', noSuchUser],
      [
        'the auth server says so in other words',
        () => authRefusal(403, 'user_not_found', 'No such user'),
      ],
      ['an older auth server says so', () => json(404, { code: 404, msg: 'User not found' })],
    ])('is done, and signed out, if %s', async (_, gone) => {
      network = (request) => {
        if (isDeletion(request)) return offline();
        return isWhoAmI(request) || isLogout(request) ? gone() : json(200, []);
      };
      await signedIn();

      expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe('done');

      expect(sent.filter(isWhoAmI).map((request) => request.bearer)).toEqual([OLD_TOKEN]);
      expect(state()).toBe('signed out');
      expect(mockKeychain.size).toBe(0);
    });

    it('says it could not be deleted if the account is still there', async () => {
      network = (request) => {
        if (isDeletion(request)) return offline();
        return isWhoAmI(request) ? user() : json(200, []);
      };
      const session = await signedIn();

      expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe(COULD_NOT_DELETE);

      expect(state()).toBe('signed in');
      expect(await kept()).toEqual(session);
    });

    it('says so honestly if that cannot be found out either', async () => {
      network = (request) => (isDeletion(request) || isWhoAmI(request) ? offline() : json(200, []));
      const session = await signedIn();

      expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe(
        'Your account may or may not have been deleted - no answer came back. ' +
          'Check again once you are online.',
      );

      expect(state()).toBe('signed in');
      expect(await kept()).toEqual(session);
    });
  });

  /**
   * Asking who is signed in can end the session - it was ended elsewhere - and
   * the client then fails over a keychain that will not delete. Whatever goes
   * wrong with the question, the answer is "not known", in the app's words.
   */
  it('says so honestly when the question itself goes wrong', async () => {
    network = (request) => {
      if (isDeletion(request)) return offline();
      return isWhoAmI(request)
        ? authRefusal(
            403,
            'session_not_found',
            'Session from session_id claim in JWT does not exist',
          )
        : json(200, []);
    };
    await signedIn();
    mockRefusal.deletes = true;

    expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe(
      'Your account may or may not have been deleted - no answer came back. ' +
        'Check again once you are online.',
    );
  });

  it('looks whether the account is still there after an error from the server, too', async () => {
    network = (request) => {
      if (isDeletion(request)) return json(500, { message: 'something broke' });
      return isWhoAmI(request) ? user() : json(200, []);
    };
    await signedIn();

    expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe(COULD_NOT_DELETE);

    expect(sent.filter(isWhoAmI)).toHaveLength(1);
    expect(state()).toBe('signed in');
  });

  /**
   * Only the auth server's word that the user does not exist counts as gone. A
   * gateway that knows no such address answers 404 too, about nothing at all.
   * And those words in a failure are not that word: an error on the way, or a
   * page that is no answer of the auth server's, says nothing about anyone's
   * account, whatever it reads like.
   */
  it.each<[string, () => Response]>([
    [
      'a gateway that knows no such address',
      () => json(404, { message: 'no Route matched with those values' }),
    ],
    [
      'an error on the way that reads like it',
      () => json(502, { message: 'upstream error: user not found' }),
    ],
    [
      'a page that reads like it, from something that is not the auth server',
      () =>
        new Response('User not found', { status: 404, headers: { 'content-type': 'text/plain' } }),
    ],
  ])('does not take %s for the account being gone', async (_, respond) => {
    network = (request) => {
      if (isDeletion(request)) return offline();
      return isWhoAmI(request) ? respond() : json(200, []);
    };
    const session = await signedIn();

    expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe(
      'Your account may or may not have been deleted - no answer came back. ' +
        'Check again once you are online.',
    );

    expect(state()).toBe('signed in');
    expect(await kept()).toEqual(session);
  });
});

/**
 * Whatever else the app keeps for the signed-in account - the letters not sent
 * yet, held in memory - is let go of when the client announces a sign-out: it
 * listens to the client, as the provider does, and hears nothing from the
 * provider. A session that ended on this device without that announcement left
 * one account's unsent letters to whoever signed in next.
 */
describe('what the rest of the app hears when the session ends', () => {
  const isLogout = (request: Sent) => request.url.includes('/auth/v1/logout');
  const isDeletion = (request: Sent) => request.url.includes('/rest/v1/rpc/delete_own_account');
  const isWhoAmI = (request: Sent) => request.url.endsWith('/auth/v1/user');
  const loggedOut = () => new Response(null, { status: 204 });
  const noSuchUser = () =>
    authRefusal(403, 'user_not_found', 'User from sub claim in JWT does not exist');
  const sessionOver = () =>
    authRefusal(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');

  /**
   * What the client has announced to a listener of its own since the app
   * opened: each event, and whether it came with a session.
   */
  let heard: [event: string, withSession: boolean][];

  /** Listens to the client from the start, as a module that keeps something for the account does. */
  const listening = (client: Client) => {
    heard = [];
    client.auth.onAuthStateChange((event, session) => {
      heard.push([event, session !== null]);
    });
  };

  async function opened(session: Session) {
    await keep(session);
    const launched = await launch({ beforeOpening: listening });
    await passes(A_MOMENT);
    expect(state()).toBe('signed in');
    return launched;
  }

  /**
   * How many sign-outs were heard, and whether a session was announced after
   * the last of them - someone signed in again, as far as a listener can tell.
   */
  function ending() {
    const events = heard.map(([event]) => event);
    const last = events.lastIndexOf('SIGNED_OUT');
    return {
      signOuts: events.filter((event) => event === 'SIGNED_OUT').length,
      signedInAfter: heard.slice(last + 1).some(([, withSession]) => withSession),
    };
  }

  const ONCE = { signOuts: 1, signedInAfter: false };

  it('hears of a sign-out the server heard of, once', async () => {
    network = (request) => (isLogout(request) ? loggedOut() : json(200, []));
    await opened(sessionOf(OLD_TOKEN, 'refresh-old', 3000));

    await asked(() => auth.signOut());

    expect(sent.filter(isLogout)).toHaveLength(1);
    expect(ending()).toEqual(ONCE);
  });

  /** The client removes the session itself, and says so; the app does not say it again. */
  it('hears of a sign-out without a network, once', async () => {
    network = offline;
    await opened(sessionOf(OLD_TOKEN, 'refresh-old', 3000));

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(ending()).toEqual(ONCE);
  });

  /**
   * The client gives up before it has removed anything, and the app removes the
   * session itself. The client then had nothing to announce, and the app told
   * nobody: the unsent letters stayed.
   */
  it('hears of a sign-out without a network an hour after the app was last used, once', async () => {
    network = offline;
    await opened(sessionOf(OLD_TOKEN, 'refresh-old', -600));

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(mockKeychain.size).toBe(0);
    expect(ending()).toEqual(ONCE);
    // Announcing it asked nothing of the network: the one logout request is the
    // last try at telling the server, everywhere, with the token the session had.
    expect(sent.filter(isLogout).map(({ url, bearer }) => [url.split('?')[1], bearer])).toEqual([
      ['scope=global', OLD_TOKEN],
    ]);
  });

  it('hears of a sign-out on a connection that never answers, once', async () => {
    network = () => new Promise<Response>(() => {});
    await opened(sessionOf(OLD_TOKEN, 'refresh-old', -600));

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(ending()).toEqual(ONCE);
  });

  /**
   * The device lets go before the client has finished with the server, and
   * the client may yet announce the sign-out itself: then the app does not.
   */
  it('hears of a sign-out once when the server answers after the device has let go', async () => {
    network = (request) =>
      isLogout(request)
        ? new Promise<Response>((resolve) => setTimeout(() => resolve(loggedOut()), 8000))
        : json(200, []);
    await opened(sessionOf(OLD_TOKEN, 'refresh-old', 3000));

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');
    await passes(10_000);

    expect(sent.filter(isLogout)).toHaveLength(1);
    expect(ending()).toEqual(ONCE);
  });

  /** Telling the server later stores nothing and announces nothing: nobody is signed in with it. */
  it('hears of a sign-out once when the server is told after all', async () => {
    network = offline;
    await opened(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    await act(async () => {
      void outcomeOf(auth.signOut());
      await jest.advanceTimersByTimeAsync(0);
    });
    await passes(5500);
    expect(state()).toBe('signed out');

    network = (request) => {
      if (isRenewal(request)) return json(200, sessionOf(NEW_TOKEN, 'refresh-renewed', 3600));
      if (isLogout(request) && request.bearer === OLD_TOKEN) {
        return authRefusal(
          403,
          'bad_jwt',
          'invalid JWT: token has invalid claims: token is expired',
        );
      }
      return isLogout(request) ? loggedOut() : json(200, []);
    };
    await passes(40_000);

    expect(
      sent.filter((request) => isLogout(request) && request.bearer === NEW_TOKEN),
    ).toHaveLength(1);
    expect(heard.slice(heard.findIndex(([event]) => event === 'SIGNED_OUT'))).toEqual([
      ['SIGNED_OUT', false],
    ]);
  });

  it('hears of a sign-out once while a renewal asked for later is still under way', async () => {
    network = offline;
    const { client } = await opened(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    await passes(30_000);
    jest.requireActual<typeof import('@/lib/renewal')>('@/lib/renewal').renewOnNextRequest();
    void client.rpc('get_roost').then(() => {});
    await passes(1000);

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(ending()).toEqual(ONCE);
  });

  /**
   * Whoever signs in while a sign-out is still under way comes after it: the
   * sign-out is heard of first, and what was kept for the account before goes.
   */
  it('hears of a sign-out before whoever signs in while it is still under way', async () => {
    network = offline;
    const { client } = await opened(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    await passes(30_000);
    jest.requireActual<typeof import('@/lib/renewal')>('@/lib/renewal').renewOnNextRequest();
    void client.rpc('get_roost').then(() => {});
    await passes(1000);
    await act(async () => {
      void outcomeOf(auth.signOut());
      await jest.advanceTimersByTimeAsync(0);
    });
    await passes(5500);
    expect(state()).toBe('signed out');

    network = (request) => {
      if (isRenewal(request)) return json(200, sessionOf(NEW_TOKEN, 'refresh-renewed', 3600));
      if (request.url.includes('/auth/v1/token?grant_type=password')) {
        return json(200, sessionOf(NEW_TOKEN, 'refresh-theirs', 3600));
      }
      return isLogout(request) ? loggedOut() : json(200, []);
    };
    await asked(() => auth.signIn('ben@example.test', 'night-courier'));
    await passes(30_000);

    const events = heard.map(([event]) => event);
    expect(events.slice(events.lastIndexOf('SIGNED_OUT'))).toEqual(['SIGNED_OUT', 'SIGNED_IN']);
    expect(state()).toBe('signed in');
  });

  it('hears nothing of a sign-out that did not happen', async () => {
    network = offline;
    await opened(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    mockRefusal.deletes = true;

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe(
      'This device could not be signed out. Try again.',
    );

    expect(state()).toBe('signed in');
    expect(heard.map(([event]) => event)).not.toContain('SIGNED_OUT');
  });

  /**
   * A session that came back afterwards - a renewal that was on its way - is
   * ended when it arrives, and that is announced too: nothing is left holding
   * on to the account it brought back.
   */
  it('hears of the end of a session that a late renewal brought back', async () => {
    network = offline;
    const { client } = await opened(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    await asked(() => auth.signOut());
    expect(ending()).toEqual(ONCE);
    network = (request) =>
      isRenewal(request) ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)) : loggedOut();

    await passes(61_000);
    await asked(async () => client.auth.refreshSession({ refresh_token: 'refresh-old' }));
    await passes(1000);

    const events = heard.map(([event]) => event);
    expect(events.slice(events.indexOf('SIGNED_OUT'))).toEqual([
      'SIGNED_OUT',
      'TOKEN_REFRESHED',
      'SIGNED_OUT',
    ]);
    expect(ending()).toEqual({ signOuts: 2, signedInAfter: false });
    expect(state()).toBe('signed out');
  });

  it('hears that the auth server has ended the session, once', async () => {
    network = (request) => (isRenewal(request) ? sessionOver() : json(200, []));
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));

    await launch({ beforeOpening: listening });
    await passes(1000);

    expect(state()).toBe('signed out');
    expect(ending()).toEqual(ONCE);
  });

  it('hears it once when the database refuses the token and the auth server the renewal', async () => {
    network = (request) => {
      if (isRenewal(request)) return sessionOver();
      return request.url.includes('/rest/v1/')
        ? json(401, { code: 'PGRST303', details: null, hint: null, message: 'JWT expired' })
        : authRefusal(403, 'bad_jwt', 'invalid JWT: token has invalid claims: token is expired');
    };
    const { client } = await opened(sessionOf(OLD_TOKEN, 'refresh-old', 3000));

    await asked(async () => client.rpc('get_roost'));

    expect(state()).toBe('signed out');
    expect(ending()).toEqual(ONCE);
  });

  it.each<[string, () => Response | Promise<Response>]>([
    ['when the server is told', noSuchUser],
    ['when the server cannot be told', offline],
  ])('hears of an account deleted, once, %s', async (_, logout) => {
    network = (request) => {
      if (isDeletion(request)) return new Response(null, { status: 204 });
      return isLogout(request) ? logout() : json(200, []);
    };
    await opened(sessionOf(OLD_TOKEN, 'refresh-old', 3000));

    expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe('done');

    expect(ending()).toEqual(ONCE);
  });

  it('hears of an account found to be gone, once', async () => {
    network = (request) => {
      if (isDeletion(request)) return offline();
      return isWhoAmI(request) || isLogout(request) ? noSuchUser() : json(200, []);
    };
    await opened(sessionOf(OLD_TOKEN, 'refresh-old', 3000));

    expect(await outcomeOf(asked(() => auth.deleteAccount()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(ending()).toEqual(ONCE);
  });
});

/**
 * The auth server's answers are written for developers, and until now most of
 * them reached the form as they came: "Database error saving new user" for a
 * username that was taken, "User is banned", "Unexpected token '<'". These are
 * its real answers, status and body, as it gives them to supabase-js.
 */
describe('what the courier is told when the auth server says no', () => {
  const NO_CONNECTION = 'No connection. Check your network and try again.';
  const NOT_ANSWERING = 'The server is not answering as it should. Try again in a little while.';
  const EMAIL_NOT_SENT = 'The email could not be sent. Try again later.';
  const TOO_MANY_EMAILS = 'Too many emails have been sent for now. Try again in an hour.';
  const CODE_JUST_SENT = 'A code was sent a moment ago. Ask for a new one in 43 seconds.';
  const TOO_MANY_ATTEMPTS = 'Too many attempts. Wait a minute and try again.';
  const CODE_DID_NOT_WORK =
    'That code did not work. Check it against the newest email, or ask for a new one.';

  const html = (status: number, page: string) =>
    new Response(page, { status, headers: { 'content-type': 'text/html' } });
  const details = {
    email: 'anna@example.test',
    password: 'night-courier',
    username: 'Anna',
    displayName: 'Anna',
  };

  async function opened(answer: () => Response | Promise<Response>) {
    network = answer;
    await launch();
    await passes(A_MOMENT);
  }

  /** The auth server's settings, which anyone may read. */
  const isSettings = (request: Sent) => request.url.endsWith('/auth/v1/settings');

  /** Settings as GoTrue v2.197 gives them, for a server that confirms new accounts by email or not. */
  const confirmsByEmail = (confirms: boolean) =>
    json(200, {
      external: { email: true, phone: false },
      disable_signup: false,
      mailer_autoconfirm: !confirms,
      phone_autoconfirm: true,
      sms_provider: '',
      saml_enabled: false,
    });

  describe('on signing in', () => {
    it.each<[string, () => Response | Promise<Response>, string]>([
      [
        'the password is wrong, or the address unknown',
        () => authRefusal(400, 'invalid_credentials', 'Invalid login credentials'),
        'That email and password do not match an account.',
      ],
      [
        // The auth server says so before it has looked at the password - for
        // any password, right or wrong (GoTrue v2.197, both local servers, 21
        // November 2026). The ban is a suspension, or what an account the
        // person who runs Night Courier removed leaves on the address for two
        // years: told to whoever typed the address, it told anyone that the
        // address had an account, and what became of it. (Found in review.)
        'the account is suspended, whatever the password',
        () => authRefusal(400, 'user_banned', 'User is banned'),
        'That email and password do not match an account.',
      ],
      [
        'there were too many attempts',
        () => authRefusal(429, 'over_request_rate_limit', 'Request rate limit reached'),
        'Too many attempts. Wait a minute and try again.',
      ],
      [
        'a gateway on the way counts too many requests',
        () => json(429, { message: 'Slow down' }),
        'Too many attempts. Wait a minute and try again.',
      ],
      ['there is no network', offline, NO_CONNECTION],
      ['the connection never answers', () => new Promise<Response>(() => {}), NO_CONNECTION],
      [
        'a sign-in page of the network answers instead',
        () => html(200, '<html>Sign in to Wi-Fi</html>'),
        NO_CONNECTION,
      ],
      [
        'a gateway answers with its error page',
        () => html(502, '<html>Bad Gateway</html>'),
        NOT_ANSWERING,
      ],
      ['the server fails with nothing to say', () => json(500, {}), NOT_ANSWERING],
      [
        'the server behind the gateway is timing out',
        () => json(504, { message: 'The upstream server is timing out' }),
        NOT_ANSWERING,
      ],
      [
        'a filter in between refuses with a page',
        () => html(403, '<html>blocked</html>'),
        NOT_ANSWERING,
      ],
      [
        'the answer is one nobody has words for',
        () => json(401, { message: 'Invalid API key' }),
        'That did not work. Try again. (Invalid API key)',
      ],
      [
        'the answer has no words at all',
        () => json(418, { message: '' }),
        'That did not work. Try again.',
      ],
    ])('says so plainly when %s', async (_, answer, words) => {
      await opened(answer);

      expect(await outcomeOf(asked(() => auth.signIn('anna@example.test', 'night-courier')))).toBe(
        words,
      );
      expect(state()).toBe('signed out');
    });

    it('signs in with the address as typed but for the spaces around it, and the password as it is', async () => {
      await opened(() => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)));

      expect(await asked(() => auth.signIn(' anna@example.test ', ' night courier '))).toEqual({
        needsEmailConfirmation: false,
      });

      const request = sent.find(({ url }) => url.includes('/auth/v1/token?grant_type=password'));
      expect(request?.body).toMatchObject({
        email: 'anna@example.test',
        password: ' night courier ',
      });
      expect(state()).toBe('signed in');
      expect((await kept())?.refresh_token).toBe('refresh-new');
    });

    /**
     * The auth server says this only once the password has been found right
     * (tried on GoTrue v2.197: a wrong one is "Invalid login credentials" for
     * an unconfirmed address too). So nobody learns from it whether an address
     * has an account, and the form can ask for the code at once: "Check your
     * email" was all it said, with no way to a code that had run out.
     */
    it.each<[string, () => Response]>([
      ['', () => authRefusal(400, 'email_not_confirmed', 'Email not confirmed')],
      [
        ', said in other words',
        () => authRefusal(400, 'email_not_confirmed', 'Confirm your address first'),
      ],
      [
        ', said as a server said it before it had codes',
        () => json(400, { error: 'invalid_grant', error_description: 'Email not confirmed' }),
      ],
    ])(
      'asks for the code instead when the address has not been confirmed yet%s',
      async (_, answer) => {
        await opened(answer);

        expect(await asked(() => auth.signIn('anna@example.test', 'night-courier'))).toEqual({
          needsEmailConfirmation: true,
        });
        expect(state()).toBe('signed out');
      },
    );

    it('keeps what the server said, for whoever has to find out what went wrong', async () => {
      await opened(() => json(401, { message: 'Invalid API key' }));

      const failure = await asked(() => auth.signIn('anna@example.test', 'night-courier')).catch(
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).cause).toMatchObject({
        name: 'AuthApiError',
        status: 401,
        message: 'Invalid API key',
      });
    });
  });

  describe('on signing up', () => {
    it.each<[string, () => Response, string]>([
      [
        // The profile's trigger failed on the unique username. The auth server
        // keeps the reason to itself, and answers 500 with no code of its own.
        'the username is taken',
        () => authRefusal(500, 'unexpected_failure', 'Database error saving new user'),
        'That username may already be taken. Try another.',
      ],
      [
        'the address is one the server does not take',
        () =>
          authRefusal(400, 'validation_failed', 'Unable to validate email address: invalid format'),
        'That email address was not accepted. Check it for mistakes - letters such as ä or é, ' +
          'and signs such as quotes or brackets, cannot be used.',
      ],
      [
        // Past 255 characters. The form says the same before it asks.
        'the address is longer than the server takes',
        () => authRefusal(400, 'validation_failed', 'An email address is too long'),
        'That email address is too long: it can have at most 255 characters.',
      ],
      [
        'the password is shorter than the server allows',
        () =>
          json(
            422,
            {
              code: 'weak_password',
              message: 'Password should be at least 10 characters.',
              weak_password: { reasons: ['length'] },
            },
            { 'X-Supabase-Api-Version': '2024-01-01' },
          ),
        'Passwords need at least 10 characters.',
      ],
      [
        // Bytes, in fact, not characters: 40 umlauts are refused with these
        // words. The form says the same before it asks.
        'the password is longer than the server allows',
        () => authRefusal(400, 'validation_failed', 'Password cannot be longer than 72 characters'),
        'Passwords can be at most 72 characters long. Letters such as ä or é count as two, ' +
          'and emoji as four.',
      ],
      [
        'new accounts are switched off',
        () => authRefusal(422, 'signup_disabled', 'Signups not allowed for this instance'),
        'New accounts cannot be created at the moment.',
      ],
      [
        'the confirmation email could not be sent',
        () => authRefusal(500, 'unexpected_failure', 'Error sending confirmation email'),
        EMAIL_NOT_SENT,
      ],
      [
        // Counted for the whole project, by the hour: a minute's wait does not help.
        'the server has sent all the emails it may',
        () => authRefusal(429, 'over_email_send_rate_limit', 'email rate limit exceeded'),
        TOO_MANY_EMAILS,
      ],
    ])('says so plainly when %s', async (_, answer, words) => {
      await opened(answer);

      expect(await outcomeOf(asked(() => auth.signUp(details)))).toBe(words);
      expect(state()).toBe('signed out');
    });

    /** The app writes usernames with an @, and people share them that way. */
    it('sends a username typed with its @ without it', async () => {
      await opened(() => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)));

      await asked(() => auth.signUp({ ...details, username: ' @Anna ' }));

      expect(sent.find((request) => request.url.includes('/auth/v1/signup'))?.body).toMatchObject({
        data: { username: 'anna' },
      });
    });

    it('sends the username as the database stores it, with the name', async () => {
      await opened(() => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)));

      const { needsEmailConfirmation } = await asked(() =>
        auth.signUp({ ...details, email: ' anna@example.test ', displayName: ' Anna ' }),
      );

      expect(needsEmailConfirmation).toBe(false);
      expect(sent.find((request) => request.url.includes('/auth/v1/signup'))?.body).toMatchObject({
        email: 'anna@example.test',
        data: { username: 'anna', display_name: 'Anna' },
      });
      expect(state()).toBe('signed in');
    });

    it('says that a confirmation is still needed when no session comes with the account', async () => {
      await opened(() => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600).user));

      const { needsEmailConfirmation } = await asked(() => auth.signUp(details));

      expect(needsEmailConfirmation).toBe(true);
      expect(state()).toBe('signed out');
    });

    /**
     * What the auth server answers, with confirmation on, for an address that
     * has an account already (GoTrue v2.197, 21 November 2026): "User already
     * registered" once it has been confirmed - while confirmation by phone is
     * off, as it is - and for one still waiting for its code a new code, or
     * within a minute of the last one, this. A new address gets an account and
     * a code. The form says the same for all of them, which is true for all of
     * them: a code is on its way if the address is new, and if it has an
     * account, the way in is signing in. "There is already an account with
     * that email address" told anyone who asked.
     */
    it.each<[string, () => Response]>([
      [
        'the address has an account',
        () => authRefusal(422, 'user_already_exists', 'User already registered'),
      ],
      [
        'the address has an account, said in other words',
        () => authRefusal(422, 'user_already_exists', 'A user with this email exists'),
      ],
      [
        'the address has an account, said as a server said it before it had codes',
        () => json(422, { code: 422, msg: 'User already registered' }),
      ],
      [
        'a code went to the address a moment ago',
        () =>
          authRefusal(
            429,
            'over_email_send_rate_limit',
            'For security purposes, you can only request this after 43 seconds.',
          ),
      ],
    ])('answers as it does for a new address when %s', async (_, answer) => {
      // A server that confirms new accounts by email, as both say it does.
      network = (request) => (isSettings(request) ? confirmsByEmail(true) : answer());
      await launch();
      await passes(A_MOMENT);

      expect(await asked(() => auth.signUp(details))).toEqual({ needsEmailConfirmation: true });
      expect(state()).toBe('signed out');
    });

    /**
     * With confirmation off - as the app runs until GO-LIVE - a new address is
     * signed in at once, and one that has an account is answered "User
     * already registered" (the normal local stack, 21 November 2026). There is
     * no code to wait for then, and nothing to keep from anyone that signing
     * in at once has not told already. Which way the server works it says in
     * its settings, which anyone may read. (Found in review: the code screen
     * waited for a code that never came.)
     */
    it('says plainly that the address has an account when the server signs new accounts in at once', async () => {
      network = (request) =>
        isSettings(request)
          ? confirmsByEmail(false)
          : authRefusal(422, 'user_already_exists', 'User already registered');
      await launch();
      await passes(A_MOMENT);

      expect(await outcomeOf(asked(() => auth.signUp(details)))).toBe(
        'There is already an account with that email address. Sign in instead.',
      );

      // With the project's key, as every request to the hosted project needs:
      // its gateway refuses one without, where the local servers answer it.
      expect(sent.filter(isSettings).map(({ method, apikey }) => [method, apikey])).toEqual([
        ['GET', 'sb_publishable_test_key'],
      ]);
      expect(state()).toBe('signed out');
    });

    it.each<[string, () => Response | Promise<Response>]>([
      ['cannot be reached', offline],
      ['answers with an error', () => json(500, {})],
      ['says nothing of it', () => json(200, {})],
    ])(
      'answers as for a new address when the server’s settings %s, which is true whichever way it works',
      async (_, settings) => {
        network = (request) =>
          isSettings(request)
            ? settings()
            : authRefusal(422, 'user_already_exists', 'User already registered');
        await launch();
        await passes(A_MOMENT);

        expect(await asked(() => auth.signUp(details))).toEqual({ needsEmailConfirmation: true });
      },
    );

    /** A code a moment ago means the server confirms by email: nothing to ask. */
    it('asks nothing more of a server that has just sent a code', async () => {
      await opened(() =>
        authRefusal(
          429,
          'over_email_send_rate_limit',
          'For security purposes, you can only request this after 43 seconds.',
        ),
      );

      expect(await asked(() => auth.signUp(details))).toEqual({ needsEmailConfirmation: true });
      expect(sent.filter(isSettings)).toEqual([]);
    });

    /** A new address, and every refusal but one, need no settings either. */
    it('asks for the settings only when the address has an account', async () => {
      await opened(() => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)));

      await asked(() => auth.signUp(details));

      expect(sent.filter(isSettings)).toEqual([]);
    });
  });

  /**
   * The code in the email that confirms a new account. Wrong, run out, or
   * replaced by a newer one, the auth server answers each alike: 403,
   * otp_expired, "Token has expired or is invalid" (GoTrue v2.197 with
   * confirmation on and 8-digit codes, 21 November 2026; the expired one by an
   * hour's age put on the code in the database). Too many attempts are counted
   * by address on the hosted project only, where it answers with its rate
   * limit; the local servers count none.
   */
  describe('on confirming an address with a code', () => {
    const isVerify = (request: Sent) => request.url.endsWith('/auth/v1/verify');

    it.each<[string, () => Response | Promise<Response>, string]>([
      [
        'the code is wrong',
        () => authRefusal(403, 'otp_expired', 'Token has expired or is invalid'),
        CODE_DID_NOT_WORK,
      ],
      [
        // The same answer, word for word, as for a wrong one.
        'the code has run out',
        () => authRefusal(403, 'otp_expired', 'Token has expired or is invalid'),
        CODE_DID_NOT_WORK,
      ],
      [
        'the server says so in other words',
        () => authRefusal(403, 'otp_expired', 'Email link is invalid or has expired'),
        CODE_DID_NOT_WORK,
      ],
      [
        'there were too many attempts',
        () => authRefusal(429, 'over_request_rate_limit', 'Request rate limit reached'),
        TOO_MANY_ATTEMPTS,
      ],
      ['there is no network', offline, NO_CONNECTION],
    ])('says so plainly when %s', async (_, answer, words) => {
      await opened(answer);

      expect(await outcomeOf(asked(() => auth.confirmEmail('anna@example.test', '12345678')))).toBe(
        words,
      );
      expect(state()).toBe('signed out');
    });

    it('signs in with the code, for the address as typed but for the spaces around it', async () => {
      await opened(() => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)));

      expect(
        await outcomeOf(asked(() => auth.confirmEmail(' anna@example.test ', '12345678'))),
      ).toBe('done');

      expect(sent.filter(isVerify).map((request) => request.body)).toEqual([
        expect.objectContaining({ type: 'signup', email: 'anna@example.test', token: '12345678' }),
      ]);
      expect(state()).toBe('signed in');
      expect((await kept())?.refresh_token).toBe('refresh-new');
    });
  });

  describe('on asking for a new code', () => {
    const isResend = (request: Sent) => request.url.endsWith('/auth/v1/resend');

    it.each<[string, () => Response | Promise<Response>, string]>([
      [
        // Within the minute after the last one. The local servers wait a
        // second, and count what is left of it down to nothing.
        'one was sent a moment ago',
        () =>
          authRefusal(
            429,
            'over_email_send_rate_limit',
            'For security purposes, you can only request this after 43 seconds.',
          ),
        CODE_JUST_SENT,
      ],
      [
        'one was sent less than a second ago',
        () =>
          authRefusal(
            429,
            'over_email_send_rate_limit',
            'For security purposes, you can only request this after 0 seconds.',
          ),
        'A code was sent a moment ago. Ask for a new one in a second.',
      ],
      [
        'one second is left to wait',
        () =>
          authRefusal(
            429,
            'over_email_send_rate_limit',
            'For security purposes, you can only request this after 1 seconds.',
          ),
        'A code was sent a moment ago. Ask for a new one in a second.',
      ],
      [
        'the server has sent all the emails it may',
        () => authRefusal(429, 'over_email_send_rate_limit', 'email rate limit exceeded'),
        TOO_MANY_EMAILS,
      ],
      [
        'the email could not be sent',
        () => authRefusal(500, 'unexpected_failure', 'Error sending confirmation email'),
        EMAIL_NOT_SENT,
      ],
      ['there is no network', offline, NO_CONNECTION],
    ])('says so plainly when %s', async (_, answer, words) => {
      await opened(answer);

      expect(await outcomeOf(asked(() => auth.resendConfirmationCode('anna@example.test')))).toBe(
        words,
      );
    });

    it('asks for a code to confirm the address as typed but for the spaces around it', async () => {
      await opened(() => json(200, {}));

      expect(await outcomeOf(asked(() => auth.resendConfirmationCode(' anna@example.test ')))).toBe(
        'done',
      );

      expect(sent.filter(isResend).map((request) => request.body)).toEqual([
        expect.objectContaining({ type: 'signup', email: 'anna@example.test' }),
      ]);
    });
  });

  describe('on asking for a new password', () => {
    it.each<[string, () => Response | Promise<Response>, string]>([
      [
        'there were too many attempts',
        () => authRefusal(429, 'over_request_rate_limit', 'Request rate limit reached'),
        TOO_MANY_ATTEMPTS,
      ],
      ['there is no network', offline, NO_CONNECTION],
    ])('says so plainly when %s', async (_, answer, words) => {
      await opened(answer);

      expect(await outcomeOf(asked(() => auth.sendPasswordReset(' anna@example.test ')))).toBe(
        words,
      );
    });

    /**
     * For an address with no account the auth server answers every request
     * alike, and sends nothing: it answers before it comes to sending
     * (GoTrue v2.197). Three answers come only for an address that has one: a
     * code went to it less than a minute ago, the email to it could not be
     * sent, or the project has sent all the emails it may this hour - a limit
     * on sending, so never met for an address nothing is sent to. "Check your
     * email" for the first, "Error sending recovery email" for the second
     * and "Too many emails" for the third told anyone who asked which
     * addresses have an account. All three are taken for sent; the screen
     * that follows says what to do when no code arrives. (The third found in
     * review.)
     */
    it.each<[string, () => Response]>([
      ['the address has no account', () => json(200, {})],
      [
        'a code went to the address a moment ago',
        () =>
          authRefusal(
            429,
            'over_email_send_rate_limit',
            'For security purposes, you can only request this after 43 seconds.',
          ),
      ],
      [
        'the email to it could not be sent',
        () => authRefusal(500, 'unexpected_failure', 'Error sending recovery email'),
      ],
      [
        'the project has sent all the emails it may for now',
        () => authRefusal(429, 'over_email_send_rate_limit', 'email rate limit exceeded'),
      ],
    ])('answers alike when %s', async (_, answer) => {
      await opened(answer);

      expect(await outcomeOf(asked(() => auth.sendPasswordReset('anna@example.test')))).toBe(
        'done',
      );
    });

    /**
     * A code to type, not a link to follow: the link came back through the
     * app's address, which any app on the phone can answer to, with a whole
     * session in it.
     */
    it('asks for a code, with no address to come back to, for the address as typed but for the spaces around it', async () => {
      await opened(() => json(200, {}));

      expect(await outcomeOf(asked(() => auth.sendPasswordReset(' anna@example.test ')))).toBe(
        'done',
      );

      const [request, ...others] = sent.filter(({ url }) => url.includes('/auth/v1/recover'));
      expect(others).toEqual([]);
      expect(request?.url).not.toContain('redirect_to');
      expect(request?.body).toMatchObject({ email: 'anna@example.test' });
    });
  });

  /**
   * The code from a reset email signs the courier in; the new password is set
   * with that session. Between the two the courier is signed in without a
   * password they know, and the way into the app waits: `isSettingPassword`.
   */
  describe('on setting a new password with a code', () => {
    const isVerify = (request: Sent) => request.url.endsWith('/auth/v1/verify');
    const isPasswordChange = (request: Sent) =>
      request.url.endsWith('/auth/v1/user') && request.method === 'PUT';
    const updated = () => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600).user);

    /** The auth server checks the code, and then answers the password change with `change`. */
    function codeRightThen(change: () => Response | Promise<Response>) {
      network = (request) => {
        if (isVerify(request)) return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));
        return isPasswordChange(request) ? change() : json(200, []);
      };
    }

    async function openedSignedOut() {
      await launch();
      await passes(A_MOMENT);
      expect(state()).toBe('signed out');
    }

    it('signs in with the code, holds the way in, and lets go once the password is saved', async () => {
      codeRightThen(updated);
      await openedSignedOut();

      await asked(() => auth.verifyResetCode(' anna@example.test ', '87654321'));

      expect(sent.filter(isVerify).map((request) => request.body)).toEqual([
        expect.objectContaining({
          type: 'recovery',
          email: 'anna@example.test',
          token: '87654321',
        }),
      ]);
      expect(state()).toBe('signed in');
      expect(auth.isSettingPassword).toBe(true);

      expect(await outcomeOf(asked(() => auth.setNewPassword('a new password')))).toBe('done');

      expect(sent.filter(isPasswordChange).map(({ body, bearer }) => [body, bearer])).toEqual([
        [expect.objectContaining({ password: 'a new password' }), NEW_TOKEN],
      ]);
      expect(auth.isSettingPassword).toBe(false);
      expect(state()).toBe('signed in');
    });

    /**
     * Set before the code goes to be checked, not after: the session it
     * brings is announced while the request is still being answered, and the
     * root layout would take the courier into the app in that moment.
     */
    it('holds the way in from before the session arrives', async () => {
      codeRightThen(updated);
      // Something else listening to the client takes its time over the
      // announcement, as a listener may: the code's answer reaches the app
      // only after the session has been taken and drawn.
      await launch({
        beforeOpening: (client) => {
          client.auth.onAuthStateChange(async () => {
            await new Promise((resolve) => setTimeout(resolve, 500));
          });
        },
      });
      await passes(A_MOMENT);

      await asked(() => auth.verifyResetCode('anna@example.test', '87654321'));

      const signedIn = rendered.filter((given) => given.session !== null);
      expect(signedIn.length).toBeGreaterThan(0);
      expect(signedIn.filter((given) => !given.isSettingPassword)).toEqual([]);
    });

    it.each<[string, () => Response | Promise<Response>, string]>([
      [
        'the code is wrong, or has run out',
        () => authRefusal(403, 'otp_expired', 'Token has expired or is invalid'),
        CODE_DID_NOT_WORK,
      ],
      [
        'there were too many attempts',
        () => authRefusal(429, 'over_request_rate_limit', 'Request rate limit reached'),
        TOO_MANY_ATTEMPTS,
      ],
      ['there is no network', offline, NO_CONNECTION],
      [
        // The right code, from the address's own mailbox: whoever has it may
        // know what signing in would not tell them (GoTrue v2.197 sends the
        // code to a banned account, and answers its check 403 user_banned).
        'the account is suspended',
        () => authRefusal(403, 'user_banned', 'User is banned'),
        'This account has been suspended. Write to the contact address on the help page.',
      ],
    ])('says so plainly, and holds nothing, when %s', async (_, answer, words) => {
      network = answer;
      await openedSignedOut();

      expect(
        await outcomeOf(asked(() => auth.verifyResetCode('anna@example.test', '87654321'))),
      ).toBe(words);

      expect(state()).toBe('signed out');
      expect(auth.isSettingPassword).toBe(false);
    });

    /**
     * Two checks of the same code at once: the form sent again before it had
     * drawn its spinner. The second is refused, the first having used the
     * code up, and its refusal let go of the way in while the first was still
     * bringing the session the code was right for - and the root layout took
     * the courier into the app before the new password was saved. (Found in
     * review.)
     */
    it('holds the way in while any check of a code is out, whatever another one is answered', async () => {
      let answerTheFirst: () => void = () => {};
      let checks = 0;
      network = (request) => {
        if (!isVerify(request)) return json(200, []);
        checks += 1;
        if (checks > 1) return authRefusal(403, 'otp_expired', 'Token has expired or is invalid');
        return new Promise<Response>((resolve) => {
          answerTheFirst = () => resolve(json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)));
        });
      };
      await openedSignedOut();
      let first: Promise<string> = Promise.resolve('never asked');
      await act(async () => {
        first = outcomeOf(auth.verifyResetCode('anna@example.test', '87654321'));
        await jest.advanceTimersByTimeAsync(0);
      });

      expect(
        await outcomeOf(asked(() => auth.verifyResetCode('anna@example.test', '87654321'))),
      ).toBe(CODE_DID_NOT_WORK);
      expect(auth.isSettingPassword).toBe(true);

      await act(async () => {
        answerTheFirst();
        await jest.advanceTimersByTimeAsync(0);
      });
      await passes(A_MOMENT);

      expect(await first).toBe('done');
      expect(state()).toBe('signed in');
      expect(auth.isSettingPassword).toBe(true);
      expect(
        rendered.filter((given) => given.session !== null && !given.isSettingPassword),
      ).toEqual([]);
    });

    /** And the other way round: the first check is refused while the second brings the session. */
    it('holds the way in for a check still out when an earlier one is refused', async () => {
      let refuseTheFirst: () => void = () => {};
      let checks = 0;
      network = (request) => {
        if (!isVerify(request)) return json(200, []);
        checks += 1;
        if (checks > 1) return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));
        return new Promise<Response>((resolve) => {
          refuseTheFirst = () =>
            resolve(authRefusal(403, 'otp_expired', 'Token has expired or is invalid'));
        });
      };
      await openedSignedOut();
      let first: Promise<string> = Promise.resolve('never asked');
      await act(async () => {
        first = outcomeOf(auth.verifyResetCode('anna@example.test', '87654321'));
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(
        await outcomeOf(asked(() => auth.verifyResetCode('anna@example.test', '87654321'))),
      ).toBe('done');

      await act(async () => {
        refuseTheFirst();
        await jest.advanceTimersByTimeAsync(0);
      });

      expect(await first).toBe(CODE_DID_NOT_WORK);
      expect(state()).toBe('signed in');
      expect(auth.isSettingPassword).toBe(true);
    });

    /** The code was right, but the session it brought could not be kept on the device. */
    it('holds nothing when the session the code brings cannot be kept', async () => {
      codeRightThen(updated);
      await openedSignedOut();
      mockRefusal.writes = true;

      expect(
        await outcomeOf(asked(() => auth.verifyResetCode('anna@example.test', '87654321'))),
      ).toBe('Could not encrypt the value for SecureStore');

      expect(auth.isSettingPassword).toBe(false);
    });

    /**
     * The code is used up by then, and the courier signed in with it. They are
     * told why the password was not taken, and can try another; the way in
     * stays held until one is saved.
     */
    it.each<[string, () => Response | Promise<Response>, string]>([
      [
        'the new password is the old one',
        () =>
          authRefusal(
            422,
            'same_password',
            'New password should be different from the old password.',
          ),
        'The new password has to differ from the old one.',
      ],
      [
        'the new password is too short for the server',
        () =>
          json(
            422,
            {
              code: 'weak_password',
              message: 'Password should be at least 10 characters.',
              weak_password: { reasons: ['length'] },
            },
            { 'X-Supabase-Api-Version': '2024-01-01' },
          ),
        'Passwords need at least 10 characters.',
      ],
      ['there is no network', offline, NO_CONNECTION],
    ])(
      'says why when the password is not saved after the code, and stays signed in, held: %s',
      async (_, change, words) => {
        codeRightThen(change);
        await openedSignedOut();
        await asked(() => auth.verifyResetCode('anna@example.test', '87654321'));

        expect(await outcomeOf(asked(() => auth.setNewPassword('a new password')))).toBe(words);

        expect(state()).toBe('signed in');
        expect(auth.isSettingPassword).toBe(true);

        codeRightThen(updated);
        expect(await outcomeOf(asked(() => auth.setNewPassword('another password')))).toBe('done');
        expect(auth.isSettingPassword).toBe(false);
        expect(sent.filter(isVerify)).toHaveLength(1);
      },
    );

    it.each<[string, () => Response | Promise<Response>]>([
      ['the server hears of it', () => new Response(null, { status: 204 })],
      ['the server cannot be reached', offline],
    ])('lets go of the reset when the courier signs out instead, and %s', async (_, logout) => {
      codeRightThen(() => offline());
      await openedSignedOut();
      await asked(() => auth.verifyResetCode('anna@example.test', '87654321'));
      await outcomeOf(asked(() => auth.setNewPassword('a new password')));
      network = logout;

      expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');

      expect(state()).toBe('signed out');
      expect(auth.isSettingPassword).toBe(false);
      expect(mockKeychain.size).toBe(0);
    });
  });
});

/**
 * GoTrue leaves an account that is waiting for its code as the first sign-up
 * for the address made it (v2.197, tried on the local server with
 * confirmation on): a second sign-up for the address sends a new code and
 * changes nothing else - not the password, not the username, not the name.
 * Whoever signed up first, with somebody else's address, kept a password that
 * worked once that somebody had confirmed the account with the code, and the
 * account their username. (Found in review: a stranger's account, confirmed
 * by the owner of the address, and signed in to with the stranger's password.)
 */
describe('setting up the account a sign-up’s code has confirmed', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  const details = {
    email: ' anna@example.test ',
    password: 'night-courier',
    username: '@Anna',
    displayName: ' Anna ',
  };
  const NO_CONNECTION = 'No connection. Check your network and try again.';

  const isVerify = (request: Sent) => request.url.endsWith('/auth/v1/verify');
  const isPasswordChange = (request: Sent) =>
    request.url.endsWith('/auth/v1/user') && request.method === 'PUT';
  const isProfileRead = (request: Sent) =>
    request.url.includes('/rest/v1/profiles') && request.method === 'GET';
  const isNameChange = (request: Sent) =>
    request.url.includes('/rest/v1/profiles') && request.method === 'PATCH';
  const isDeletion = (request: Sent) => request.url.includes('/rest/v1/rpc/delete_own_account');
  const isLogout = (request: Sent) => request.url.includes('/auth/v1/logout');
  const isSignUp = (request: Sent) => request.url.includes('/auth/v1/signup');

  /** The account's profile, as the database has it. */
  const profile = (username: string, displayName: string) =>
    json(200, [{ username, display_name: displayName }]);

  /**
   * The auth server and the database, answering each request as `answers`
   * says, and the rest as a server would that has nothing to object to.
   */
  function server(answers: Partial<Record<string, () => Response | Promise<Response>>> = {}) {
    network = (request) => {
      if (isVerify(request))
        return (answers.verify ?? (() => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600))))();
      if (isPasswordChange(request))
        return (
          answers.password ?? (() => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600).user))
        )();
      if (isProfileRead(request)) return (answers.profile ?? (() => profile('anna', 'Anna')))();
      if (isNameChange(request))
        return (answers.name ?? (() => new Response(null, { status: 204 })))();
      if (isDeletion(request))
        return (answers.deletion ?? (() => new Response(null, { status: 204 })))();
      if (isLogout(request)) return new Response(null, { status: 204 });
      if (isSignUp(request))
        return (
          answers.signUp ??
          (() => json(200, { ...sessionOf(NEW_TOKEN, 'refresh-new', 3600).user, id: 'user-new' }))
        )();
      return json(200, []);
    };
  }

  async function confirmed() {
    await launch();
    await passes(A_MOMENT);
    expect(state()).toBe('signed out');
    expect(await outcomeOf(asked(() => auth.confirmSignUp(details, '12345678')))).toBe('done');
  }

  it('confirms the address with the code, and holds the way in until the account is set up', async () => {
    server();
    await confirmed();

    expect(sent.filter(isVerify).map((request) => request.body)).toEqual([
      expect.objectContaining({ type: 'signup', email: 'anna@example.test', token: '12345678' }),
    ]);
    expect(state()).toBe('signed in');
    expect(auth.isSettingPassword).toBe(true);
  });

  it('sets the password typed at sign-up, and then lets the courier in', async () => {
    server();
    await confirmed();

    expect(await asked(() => auth.finishSignUp(details))).toBe('signed in');

    expect(sent.filter(isPasswordChange).map(({ body, bearer }) => [body, bearer])).toEqual([
      [expect.objectContaining({ password: 'night-courier' }), NEW_TOKEN],
    ]);
    expect(sent.filter(isProfileRead).map(({ url }) => url)).toEqual([
      expect.stringContaining(`id=eq.${ID}`),
    ]);
    expect(sent.filter(isNameChange)).toEqual([]);
    expect(auth.isSettingPassword).toBe(false);
    expect(state()).toBe('signed in');
  });

  /** An account set up by this sign-up has the password already, and GoTrue says so. */
  it('takes the password being the one the account has already for done', async () => {
    server({
      password: () =>
        authRefusal(
          422,
          'same_password',
          'New password should be different from the old password.',
        ),
    });
    await confirmed();

    expect(await asked(() => auth.finishSignUp(details))).toBe('signed in');
    expect(auth.isSettingPassword).toBe(false);
  });

  it('gives the account the name typed at sign-up, when an earlier sign-up gave it another', async () => {
    server({ profile: () => profile('anna', 'Stranger') });
    await confirmed();

    expect(await asked(() => auth.finishSignUp(details))).toBe('signed in');

    expect(sent.filter(isNameChange).map(({ url, body }) => [url.split('?')[1], body])).toEqual([
      [`id=eq.${ID}`, { display_name: 'Anna' }],
    ]);
  });

  /** The name is the courier's to change at any time; the account is set up all the same. */
  it('lets the courier in when the name could not be changed', async () => {
    server({ profile: () => profile('anna', 'Stranger'), name: offline });
    await confirmed();

    expect(await asked(() => auth.finishSignUp(details))).toBe('signed in');
    expect(auth.isSettingPassword).toBe(false);
  });

  /**
   * A username cannot be changed. An account an earlier sign-up gave another
   * one is set up again from what was typed: nothing can have been done with
   * it, the code having confirmed it only now, and a new code goes out.
   */
  it('sets the account up again when an earlier sign-up gave it another username', async () => {
    server({ profile: () => profile('stranger', 'Stranger') });
    await confirmed();

    expect(await asked(() => auth.finishSignUp(details))).toBe('new code');

    expect(sent.filter(isDeletion)).toHaveLength(1);
    expect(sent.filter(isSignUp).map((request) => request.body)).toEqual([
      expect.objectContaining({
        email: 'anna@example.test',
        password: 'night-courier',
        data: { username: 'anna', display_name: 'Anna' },
      }),
    ]);
    expect(sent.findIndex(isDeletion)).toBeLessThan(sent.findIndex(isSignUp));
    expect(state()).toBe('signed out');
    expect(auth.isSettingPassword).toBe(false);
    expect(mockKeychain.has(SESSION_KEY)).toBe(false);
  });

  it.each<[string, Partial<Record<string, () => Response | Promise<Response>>>, string]>([
    ['the password cannot be saved', { password: offline }, NO_CONNECTION],
    [
      'the server will not take the password',
      {
        password: () =>
          json(
            422,
            {
              code: 'weak_password',
              message: 'Password should be at least 10 characters.',
              weak_password: { reasons: ['length'] },
            },
            { 'X-Supabase-Api-Version': '2024-01-01' },
          ),
      },
      'Passwords need at least 10 characters.',
    ],
    ['the account cannot be looked at', { profile: offline }, NO_CONNECTION],
    [
      'the account an earlier sign-up made cannot be removed',
      {
        profile: () => profile('stranger', 'Stranger'),
        deletion: () => json(500, { message: 'boom' }),
      },
      'Your account could not be deleted. Please try again.',
    ],
  ])('says why, and holds the way in, signed in, when %s', async (_, answers, words) => {
    server(answers);
    await confirmed();

    expect(await outcomeOf(asked(() => auth.finishSignUp(details)))).toBe(words);

    expect(state()).toBe('signed in');
    expect(auth.isSettingPassword).toBe(true);
  });

  it('sets the account up when asked again after it could not be', async () => {
    let attempts = 0;
    server({ password: () => (++attempts === 1 ? offline() : json(200, {})) });
    await confirmed();
    await outcomeOf(asked(() => auth.finishSignUp(details)));

    expect(await asked(() => auth.finishSignUp(details))).toBe('signed in');

    expect(sent.filter(isVerify)).toHaveLength(1);
    expect(auth.isSettingPassword).toBe(false);
  });

  /**
   * Removed to make way for the courier's own, the earlier sign-up's account
   * is gone; if theirs then cannot be set up, they are signed out, and told
   * to set it up again from the form.
   */
  it('says so when the account was removed to make way, and the new one could not be set up', async () => {
    server({
      profile: () => profile('stranger', 'Stranger'),
      signUp: () => authRefusal(500, 'unexpected_failure', 'Database error saving new user'),
    });
    await confirmed();

    expect(await outcomeOf(asked(() => auth.finishSignUp(details)))).toBe(
      'This address had an account waiting for its code already, set up with another ' +
        'username, and it has been removed to make way for yours. Yours could not be set ' +
        'up just now: That username may already be taken. Try another. Go back to the form ' +
        'to set it up again.',
    );
    expect(state()).toBe('signed out');
    expect(auth.isSettingPassword).toBe(false);
  });

  it('lets go of the way in when the courier signs out instead', async () => {
    server({ password: offline });
    await confirmed();
    await outcomeOf(asked(() => auth.finishSignUp(details)));

    expect(await outcomeOf(asked(() => auth.signOut()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(auth.isSettingPassword).toBe(false);
  });

  it.each<[string, () => Response | Promise<Response>, string]>([
    [
      'the code is wrong, or has run out',
      () => authRefusal(403, 'otp_expired', 'Token has expired or is invalid'),
      'That code did not work. Check it against the newest email, or ask for a new one.',
    ],
    ['there is no network', offline, NO_CONNECTION],
  ])('holds nothing when %s', async (_, verify, words) => {
    server({ verify });
    await launch();
    await passes(A_MOMENT);

    expect(await outcomeOf(asked(() => auth.confirmSignUp(details, '12345678')))).toBe(words);

    expect(state()).toBe('signed out');
    expect(auth.isSettingPassword).toBe(false);
    // Nothing for the screens to take up: the code signed nobody in.
    expect(auth.unfinished).toBeNull();
  });

  /**
   * Starting over, where the account could not be set up: it is removed, and
   * the courier signed out. Signing out alone left it confirmed by the code,
   * with the password of whoever signed up for the address first. (Found in
   * review.)
   */
  it('removes the account and signs out when the courier starts over instead', async () => {
    server({ password: offline });
    await confirmed();
    await outcomeOf(asked(() => auth.finishSignUp(details)));

    expect(await outcomeOf(asked(() => auth.removeUnfinishedAccount()))).toBe('done');

    expect(sent.filter(isDeletion).map(({ bearer }) => bearer)).toEqual([NEW_TOKEN]);
    expect(state()).toBe('signed out');
    expect(auth.isSettingPassword).toBe(false);
  });

  it('holds the way in, signed in, when the account cannot be removed to start over', async () => {
    server({ password: offline, deletion: () => json(500, { message: 'boom' }) });
    await confirmed();
    await outcomeOf(asked(() => auth.finishSignUp(details)));

    expect(await outcomeOf(asked(() => auth.removeUnfinishedAccount()))).toBe(
      'Your account could not be deleted. Please try again.',
    );

    expect(state()).toBe('signed in');
    expect(auth.isSettingPassword).toBe(true);
  });

  /**
   * An account a code had only just confirmed, removed to start again, is no
   * deletion the courier asked for: the welcome screen's "Your account has
   * been deleted." is for the one asked for in the profile. Nor is the server
   * asked to end a session: removing the account ended them all. (Found in
   * the merge with the codes.)
   */
  it('leaves the welcome screen no word of a deletion, and the server no sign-out, on starting over', async () => {
    server({ password: offline });
    await confirmed();
    await outcomeOf(asked(() => auth.finishSignUp(details)));
    const farewell = jest.requireActual<typeof import('@/lib/farewell')>('@/lib/farewell');

    expect(await outcomeOf(asked(() => auth.removeUnfinishedAccount()))).toBe('done');

    expect(state()).toBe('signed out');
    expect(farewell.isFarewellDue()).toBe(false);
    expect(sent.filter(isLogout)).toEqual([]);
  });

  it('leaves the welcome screen no word of a deletion, and the server no sign-out, on setting up again', async () => {
    server({ profile: () => profile('stranger', 'Stranger') });
    await confirmed();
    const farewell = jest.requireActual<typeof import('@/lib/farewell')>('@/lib/farewell');

    expect(await asked(() => auth.finishSignUp(details))).toBe('new code');

    expect(farewell.isFarewellDue()).toBe(false);
    expect(sent.filter(isLogout)).toEqual([]);
  });

  /**
   * Where the auth server signs a new account in at once, the account set up
   * again is signed in to. The removal before it signed the device out with
   * nothing told to the server, and a session that arrives after such a
   * sign-out is ended, as one that came back by itself would be - unless
   * someone signs in, as signing up again is the courier's doing.
   */
  it('takes the session of the account set up again, where the server signs it in at once', async () => {
    const AGAIN_TOKEN = `header.${'e'.repeat(1000)}.signature`;
    server({
      profile: () => profile('stranger', 'Stranger'),
      signUp: () => json(200, sessionOf(AGAIN_TOKEN, 'refresh-again', 3600)),
    });
    await confirmed();

    expect(await asked(() => auth.finishSignUp(details))).toBe('signed in');
    await passes(A_MOMENT);

    expect(state()).toBe('signed in');
    expect((await kept())?.refresh_token).toBe('refresh-again');
    expect(sent.filter(isLogout)).toEqual([]);
  });

  /**
   * Whoever signed up first, and knows their password, can sign in the moment
   * the code has confirmed the account - and change the password before the
   * courier's own is set, which ends every other session: the courier's
   * password change is then answered 403 session_not_found (GoTrue v2.197 at
   * the local confirmation-on server, 21 November 2026). "Try again" could
   * never work. (Found in review.)
   */
  it('says so, signed out, when the session the code brought has been ended elsewhere', async () => {
    server({ password: () => authRefusal(403, 'session_not_found', 'Session not found') });
    await confirmed();

    expect(await outcomeOf(asked(() => auth.finishSignUp(details)))).toBe(
      'Your sign-in ended before your account was finished: someone who knew a password set ' +
        'for this address before yours may have changed it. Write to the contact address on ' +
        'the help page, and the account can be removed so that you can sign up again.',
    );
    expect(state()).toBe('signed out');
    expect(auth.isSettingPassword).toBe(false);
  });

  /** From signing in, the password was the account's - found right by the server. */
  it('sets nothing when an address waiting for its code is confirmed from signing in', async () => {
    server();
    await launch();
    await passes(A_MOMENT);

    expect(await outcomeOf(asked(() => auth.confirmEmail(details.email, '12345678')))).toBe('done');

    expect(state()).toBe('signed in');
    expect(auth.isSettingPassword).toBe(false);
    expect(sent.filter(isPasswordChange)).toEqual([]);
  });
});

/**
 * The session a code brings is kept on the device the moment the code is
 * answered. What the code was for - the account a sign-up's code confirmed,
 * to be set up as typed; a reset's new password - was kept in memory only, so
 * an app closed in between opened in the roost: after signing up, perhaps on
 * an account with someone else's password, username and name. (Found in
 * review.) It is kept beside the session now, never with the password, and
 * taken up again at launch.
 */
describe('what a code leaves to do, kept on the device', () => {
  const MARKER = 'night-courier.unfinished';
  const details = {
    email: 'mara@example.test',
    password: 'night-courier',
    username: 'mara',
    displayName: 'Mara',
  };
  const LEFT = {
    flow: 'sign-up',
    email: 'mara@example.test',
    username: 'mara',
    displayName: 'Mara',
  };

  const isVerify = (request: Sent) => request.url.endsWith('/auth/v1/verify');
  const isPasswordChange = (request: Sent) =>
    request.url.endsWith('/auth/v1/user') && request.method === 'PUT';
  const isDeletion = (request: Sent) => request.url.includes('/rest/v1/rpc/delete_own_account');
  const isLogout = (request: Sent) => request.url.includes('/auth/v1/logout');

  /** What the keychain holds of it, as written. */
  const marker = () => mockKeychain.get(MARKER) ?? null;
  const markerKept = () => {
    const value = marker();
    return value === null ? null : (JSON.parse(value) as unknown);
  };

  /** A right code's session, for an account whose address was confirmed at `confirmedAt`. */
  const codeSession = (confirmedAt: string, recoverySentAt?: string) => {
    const session = sessionOf(NEW_TOKEN, 'refresh-new', 3600);
    return {
      ...session,
      user: { ...session.user, email_confirmed_at: confirmedAt, recovery_sent_at: recoverySentAt },
    };
  };

  /** Everything answered as a server would that has nothing to object to. */
  function server(answers: Partial<Record<string, () => Response | Promise<Response>>> = {}) {
    network = (request) => {
      if (isVerify(request))
        return (answers.verify ?? (() => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600))))();
      if (isPasswordChange(request)) return (answers.password ?? (() => json(200, {})))();
      if (request.url.includes('/rest/v1/profiles') && request.method === 'GET')
        return json(200, [{ username: 'mara', display_name: 'Mara' }]);
      if (isDeletion(request))
        return (answers.deletion ?? (() => new Response(null, { status: 204 })))();
      if (isLogout(request)) return new Response(null, { status: 204 });
      return json(200, []);
    };
  }

  async function openedSignedOut() {
    await launch();
    await passes(A_MOMENT);
    expect(state()).toBe('signed out');
  }

  it('keeps what a sign-up’s code is for before the code goes, and never the password', async () => {
    let keptWhenChecked: string | null = null;
    server({
      verify: () => {
        keptWhenChecked = marker();
        return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));
      },
    });
    await openedSignedOut();

    await asked(() => auth.confirmSignUp({ ...details, email: ' mara@example.test ' }, '12345678'));

    expect(JSON.parse(keptWhenChecked ?? 'null')).toEqual(LEFT);
    expect(keptWhenChecked).not.toContain('night-courier');
    expect(auth.unfinished).toEqual(LEFT);
  });

  it('holds the way in again at launch, signed in by a sign-up’s code, the account not set up', async () => {
    server();
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
    mockKeychain.set(MARKER, JSON.stringify(LEFT));

    await launch();
    await passes(A_MOMENT);

    expect(state()).toBe('signed in');
    expect(auth.isSettingPassword).toBe(true);
    expect(auth.unfinished).toEqual(LEFT);
    // Held from the first moment it is signed in: the root layout would take
    // the courier into the app at any other.
    expect(rendered.filter((given) => given.session !== null && !given.isSettingPassword)).toEqual(
      [],
    );
  });

  it('lets go of the way in, and forgets it, once the account is set up', async () => {
    server();
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
    mockKeychain.set(MARKER, JSON.stringify(LEFT));
    await launch();
    await passes(A_MOMENT);

    expect(await asked(() => auth.finishSignUp(details))).toBe('signed in');

    expect(auth.isSettingPassword).toBe(false);
    expect(auth.unfinished).toBeNull();
    expect(marker()).toBeNull();
  });

  it.each([
    ['no session is kept beside it', null],
    ['the session kept is another address’s', { ...LEFT, email: 'anna@example.test' }],
  ])('holds nothing, and forgets it, when %s', async (_, other) => {
    if (other) {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
      mockKeychain.set(MARKER, JSON.stringify(other));
    } else {
      mockKeychain.set(MARKER, JSON.stringify(LEFT));
    }

    await launch();
    await passes(A_MOMENT);

    expect(auth.isSettingPassword).toBe(false);
    expect(auth.unfinished).toBeNull();
    expect(marker()).toBeNull();
  });

  it('forgets it when the courier signs in with a password', async () => {
    mockKeychain.set(MARKER, JSON.stringify(LEFT));
    server();
    await openedSignedOut();
    mockKeychain.set(MARKER, JSON.stringify(LEFT));
    network = () => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));

    await asked(() => auth.signIn('mara@example.test', 'night-courier'));

    expect(marker()).toBeNull();
  });

  it('forgets it when the courier signs out', async () => {
    server({ password: offline });
    await openedSignedOut();
    await asked(() => auth.confirmSignUp(details, '12345678'));
    expect(markerKept()).toEqual(LEFT);

    await asked(() => auth.signOut());

    expect(auth.isSettingPassword).toBe(false);
    expect(marker()).toBeNull();
  });

  it('keeps a reset’s too, and takes it up again at launch', async () => {
    server();
    await openedSignedOut();

    expect(await asked(() => auth.verifyResetCode(' mara@example.test ', '12345678'))).toBe(
      'signed in',
    );
    expect(markerKept()).toEqual({ flow: 'reset', email: 'mara@example.test' });

    await launch();
    await passes(A_MOMENT);

    expect(auth.isSettingPassword).toBe(true);
    expect(auth.unfinished).toEqual({ flow: 'reset', email: 'mara@example.test', remove: false });

    await asked(() => auth.setNewPassword('a new password'));

    expect(auth.isSettingPassword).toBe(false);
    expect(marker()).toBeNull();
  });

  /**
   * GoTrue confirms an address with a reset's code too (v2.197). An account
   * a sign-up had left waiting for its code - someone else's, with their
   * password, username and name - became the courier's that way, all of it
   * kept but the password. (Found in review.)
   */
  describe('a reset’s code that confirms an account nobody had confirmed', () => {
    const NEVER = codeSession('2026-11-21T10:10:10.188Z', '2026-11-21T10:10:10.177Z');

    it('removes the account, and signs out', async () => {
      server({ verify: () => json(200, NEVER) });
      await openedSignedOut();

      expect(await asked(() => auth.verifyResetCode('mara@example.test', '12345678'))).toBe(
        'removed',
      );

      expect(sent.filter(isDeletion).map(({ bearer }) => bearer)).toEqual([NEW_TOKEN]);
      expect(sent.filter(isPasswordChange)).toEqual([]);
      expect(state()).toBe('signed out');
      expect(auth.isSettingPassword).toBe(false);
      expect(marker()).toBeNull();
    });

    /** No deletion the courier asked for, and the server ended its sessions with the account. */
    it('leaves the welcome screen no word of a deletion, and the server no sign-out', async () => {
      server({ verify: () => json(200, NEVER) });
      await openedSignedOut();
      const farewell = jest.requireActual<typeof import('@/lib/farewell')>('@/lib/farewell');

      expect(await asked(() => auth.verifyResetCode('mara@example.test', '12345678'))).toBe(
        'removed',
      );

      expect(farewell.isFarewellDue()).toBe(false);
      expect(sent.filter(isLogout)).toEqual([]);
    });

    it('holds the way in until it is removed, after a relaunch too', async () => {
      server({ verify: () => json(200, NEVER), deletion: () => json(500, { message: 'boom' }) });
      await openedSignedOut();

      expect(
        await outcomeOf(asked(() => auth.verifyResetCode('mara@example.test', '12345678'))),
      ).toBe('Your account could not be deleted. Please try again.');
      expect(auth.isSettingPassword).toBe(true);
      expect(auth.unfinished).toEqual({ flow: 'reset', email: 'mara@example.test', remove: true });

      await launch();
      await passes(A_MOMENT);
      expect(auth.isSettingPassword).toBe(true);
      expect(auth.unfinished).toEqual({ flow: 'reset', email: 'mara@example.test', remove: true });

      server({ verify: () => json(200, NEVER) });
      expect(await outcomeOf(asked(() => auth.removeUnfinishedAccount()))).toBe('done');
      expect(state()).toBe('signed out');
      expect(marker()).toBeNull();
    });

    /** The app closed between the code and the removal, before it could say what was left. */
    it('takes the removal up at launch from the session the code brought', async () => {
      server();
      await keep({ ...NEVER, access_token: OLD_TOKEN });
      mockKeychain.set(MARKER, JSON.stringify({ flow: 'reset', email: 'mara@example.test' }));

      await launch();
      await passes(A_MOMENT);

      expect(auth.unfinished).toEqual({ flow: 'reset', email: 'mara@example.test', remove: true });
    });

    it('leaves an account confirmed before the code was sent alone', async () => {
      server({
        verify: () => json(200, codeSession('2026-11-01T10:00:00Z', '2026-11-21T10:10:10.177Z')),
      });
      await openedSignedOut();

      expect(await asked(() => auth.verifyResetCode('mara@example.test', '12345678'))).toBe(
        'signed in',
      );

      expect(sent.filter(isDeletion)).toEqual([]);
      expect(auth.isSettingPassword).toBe(true);
    });
  });
});
