import type { Session } from '@supabase/supabase-js';
import type { AppStateStatus } from 'react-native';

import { toRpcError } from '@/lib/rpc-error';
import { secureStorage } from '@/lib/secure-storage';
import { SESSION_KEY } from '@/lib/session-store';

/**
 * The client as the app builds it - the real supabase-js, the real storage and
 * the real fetch of our own - with only the two things underneath replaced: the
 * keychain and the network.
 *
 * Everything here is about one question: what becomes of the session, and of
 * the request in hand, when the network or the server does something other
 * than answer properly. The library decides most of that by itself, so the only
 * faithful check is to let it run.
 */

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

const ANON_KEY = 'sb_publishable_test_key';
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

const isRenewal = (request: Sent) =>
  request.url.includes('/auth/v1/token?grant_type=refresh_token');
const isRest = (request: Sent) => request.url.includes('/rest/v1/');
const offline = () => Promise.reject(new TypeError('Network request failed'));

/** What a screen would show for a failed request. */
const shown = (error: { message: string } | null) =>
  error && toRpcError(error, 'Your roost could not be loaded.').message;
const NO_CONNECTION = 'No connection. Check your network and try again.';

type Client = (typeof import('@/lib/supabase'))['supabase'];
let supabase: Client | null;

/** Puts a session in the keychain the way the app itself would have. */
async function keep(session: Session) {
  await secureStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/** What the keychain holds under the session's name. */
async function kept(): Promise<Session | null> {
  const value = await secureStorage.getItem(SESSION_KEY);
  return value === null ? null : (JSON.parse(value) as Session);
}

/**
 * Starts the app's client afresh, as a launch does. The client, and what the
 * app knows of the stored session, live in their modules, so each launch loads
 * them anew.
 */
function launch() {
  jest.resetModules();

  const { AppState } = jest.requireActual<typeof import('react-native')>('react-native');
  let appStateChanged: (state: AppStateStatus) => void = () => {};
  jest.mocked(AppState.addEventListener).mockImplementation((_type, listener) => {
    appStateChanged = listener;
    return { remove: () => {} };
  });

  const client = jest.requireActual<typeof import('@/lib/supabase')>('@/lib/supabase').supabase;
  supabase = client;
  const events: string[] = [];
  client.auth.onAuthStateChange((event) => {
    events.push(event);
  });

  return {
    client,
    events,
    store: jest.requireActual<typeof import('@/lib/session-store')>('@/lib/session-store'),
    appBecomes: (state: AppStateStatus) => appStateChanged(state),
  };
}

/** Lets time pass until `promise` settles: the library waits between its own retries. */
async function settled<T>(promise: PromiseLike<T>, withinSeconds = 120): Promise<T> {
  let done = false;
  const watched = Promise.resolve(promise).finally(() => {
    done = true;
  });
  watched.catch(() => {});
  for (let second = 0; second < withinSeconds && !done; second++) {
    await jest.advanceTimersByTimeAsync(1000);
  }
  if (!done) throw new Error(`still waiting after ${withinSeconds} s`);
  return watched;
}

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
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockKeychain.clear();
  mockRefusal.reads = false;
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
  jest.restoreAllMocks();
});

describe('renewing a session whose hour has run out', () => {
  /**
   * auth-js deletes the stored session on every answer to a renewal that it
   * does not class as worth retrying, and its list is short. A rate limit, a
   * paused project or a gateway's own page says nothing about this session.
   */
  it.each<[string, () => Response]>([
    [
      'a rate limit',
      () => authRefusal(429, 'over_request_rate_limit', 'Request rate limit reached'),
    ],
    ['a rate limit from the gateway', () => new Response('error code: 1015', { status: 429 })],
    ['a paused project', () => json(540, { message: 'Project paused' })],
    [
      'a restricted project',
      () => json(402, { message: 'Service for this project is restricted' }),
    ],
    [
      'a page from a filter in between',
      () => new Response('<html>blocked</html>', { status: 403 }),
    ],
    ['a request timeout', () => new Response('timeout', { status: 408 })],
  ])('keeps the session when the answer is %s', async (_, respond) => {
    const session = sessionOf(OLD_TOKEN, 'refresh-old', -600);
    await keep(session);
    network = (request) => (isRenewal(request) ? respond() : json(200, []));

    const { client, events } = launch();
    const { data } = await settled(client.auth.getSession());

    expect(data.session).toBeNull();
    expect(await kept()).toEqual(session);
    expect(events).not.toContain('SIGNED_OUT');
  });

  /**
   * auth-js tries a failed renewal again at once, eight times in half a minute,
   * and the same again a minute later. An answer made to look like a request
   * that did not get through is one it tries again like that: to a server that
   * was limiting requests, every open app sent sixteen renewals in two minutes.
   */
  it('asks an auth server that is limiting requests once in each round of attempts, not eight times', async () => {
    const session = sessionOf(OLD_TOKEN, 'refresh-old', -600);
    await keep(session);
    network = (request) =>
      isRenewal(request)
        ? authRefusal(429, 'over_request_rate_limit', 'Request rate limit reached')
        : json(200, []);
    const { client } = launch();

    // A screen asks for its data every ten seconds or so, for two minutes.
    const started = Date.now();
    while (Date.now() - started < 120_000) {
      const { error } = await settled(client.rpc('get_roost'));
      expect(shown(error)).toBe(NO_CONNECTION);
      await jest.advanceTimersByTimeAsync(10_000);
    }

    expect(sent.filter(isRenewal)).toHaveLength(2);
    expect(sent.filter(isRest)).toEqual([]);
    expect(await kept()).toEqual(session);
  });

  it('ends the session when the auth server says it is over', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = (request) =>
      isRenewal(request)
        ? authRefusal(
            400,
            'refresh_token_not_found',
            'Invalid Refresh Token: Refresh Token Not Found',
          )
        : json(200, []);

    const { client, events } = launch();
    const { data } = await settled(client.auth.getSession());

    expect(data.session).toBeNull();
    expect(await kept()).toBeNull();
    expect(events).toContain('SIGNED_OUT');
  });

  it('takes the new session when the auth server gives one', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    const renewed = sessionOf(NEW_TOKEN, 'refresh-new', 3600);
    network = (request) => (isRenewal(request) ? json(200, renewed) : json(200, []));

    const { client } = launch();
    const { data } = await settled(client.auth.getSession());

    expect(data.session?.access_token).toBe(NEW_TOKEN);
    expect((await kept())?.refresh_token).toBe('refresh-new');
  });

  /**
   * Nothing underneath sets a time limit: on a connection that takes requests
   * and never answers, the client waited for as long as the app was open.
   */
  it('gives up on a connection that never answers, and keeps the session', async () => {
    const session = sessionOf(OLD_TOKEN, 'refresh-old', -600);
    await keep(session);
    network = () => new Promise<Response>(() => {});

    const { client } = launch();
    const { data, error } = await settled(client.auth.getSession(), 60);

    expect(data.session).toBeNull();
    expect(error?.name).toBe('AuthRetryableFetchError');
    expect(await kept()).toEqual(session);
  });
});

describe('a request to the database', () => {
  /**
   * After a renewal has failed, auth-js answers "no session" from memory for a
   * minute, and supabase-js then sends the request with the publishable key in
   * the session's place. The database refuses that as a stranger's request.
   */
  it('is not sent in the name of nobody while a session is stored', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', -600));
    network = offline;
    const { client } = launch();
    await settled(client.auth.getSession());

    // The network is back; the client still remembers the failure.
    network = () => json(200, []);
    const { error } = await settled(client.rpc('get_roost'));

    expect(sent.filter(isRest)).toEqual([]);
    expect(shown(error)).toBe(NO_CONNECTION);
  });

  it('gives up after twenty seconds on a connection that never answers', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
    network = () => new Promise<Response>(() => {});
    const { client } = launch();

    const started = Date.now();
    const { error } = await settled(client.rpc('get_roost'));

    expect(Date.now() - started).toBeLessThanOrEqual(21_000);
    expect(shown(error)).toBe(NO_CONNECTION);
  });

  it('is sent with the publishable key when nobody is signed in', async () => {
    const { client } = launch();

    const { data, error } = await settled(client.rpc('get_roost'));

    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(sent.filter(isRest).map((request) => request.bearer)).toEqual([ANON_KEY]);
  });

  /**
   * The client renews by this device's clock; the server refuses by its own. On
   * a phone whose clock is slow the token runs out on the server first, and
   * every request was then refused until the phone thought the hour was over.
   */
  describe('refused because the server holds the token for expired', () => {
    const expired = () =>
      json(401, { code: 'PGRST303', details: null, hint: null, message: 'JWT expired' });

    it('is repeated once with a renewed session', async () => {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
      const renewed = sessionOf(NEW_TOKEN, 'refresh-new', 3600);
      network = (request) => {
        if (isRenewal(request)) return json(200, renewed);
        return request.bearer === NEW_TOKEN ? json(200, [{ bat_id: 'b1' }]) : expired();
      };
      const { client } = launch();

      const { data, error } = await settled(client.rpc('get_roost'));

      expect(error).toBeNull();
      expect(data).toEqual([{ bat_id: 'b1' }]);
      expect(sent.filter(isRenewal)).toHaveLength(1);
      expect(sent.filter(isRest).map((request) => request.bearer)).toEqual([OLD_TOKEN, NEW_TOKEN]);
      expect((await kept())?.refresh_token).toBe('refresh-new');
    });

    it('renews once for all the requests refused together', async () => {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
      const renewed = sessionOf(NEW_TOKEN, 'refresh-new', 3600);
      network = (request) => {
        if (isRenewal(request)) return json(200, renewed);
        return request.bearer === NEW_TOKEN ? json(200, []) : expired();
      };
      const { client } = launch();

      const answers = await settled(
        Promise.all([
          client.rpc('get_roost'),
          client.rpc('get_badges'),
          client.rpc('list_friends'),
        ]),
      );

      expect(answers.map((answer) => answer.error)).toEqual([null, null, null]);
      expect(sent.filter(isRenewal)).toHaveLength(1);
    });

    it('says there is no connection when the renewal cannot reach the auth server', async () => {
      const session = sessionOf(OLD_TOKEN, 'refresh-old', 3000);
      await keep(session);
      network = (request) => (isRenewal(request) ? offline() : expired());
      const { client } = launch();

      const { error } = await settled(client.rpc('get_roost'));

      expect(shown(error)).toBe(NO_CONNECTION);
      expect(await kept()).toEqual(session);
    });

    /**
     * Both tokens refused: the session is over. auth-js removes it by itself
     * only when this device's clock agrees that the access token has run out,
     * and a slow clock - what leads here - says it has not.
     */
    it('ends the session when the auth server refuses the renewal as well', async () => {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
      network = (request) => {
        if (isRenewal(request)) {
          return authRefusal(
            400,
            'refresh_token_not_found',
            'Invalid Refresh Token: Refresh Token Not Found',
          );
        }
        // What is left is the sign-out, with a token the auth server holds for expired too.
        return isRest(request)
          ? expired()
          : authRefusal(403, 'bad_jwt', 'invalid JWT: token has invalid claims: token is expired');
      };
      const { client, events, store } = launch();

      const { error } = await settled(client.rpc('get_roost'));

      expect(error?.code).toBe('PGRST303');
      expect(await kept()).toBeNull();
      expect(store.isSessionStored()).toBe(false);
      expect(events).toContain('SIGNED_OUT');
    });

    it('does not renew again when its refusal arrives after the renewal', async () => {
      await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
      let refuseLate: (answer: Response) => void = () => {};
      network = (request) => {
        if (isRenewal(request)) return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));
        if (request.bearer === NEW_TOKEN) return json(200, []);
        return request.url.endsWith('/get_badges')
          ? new Promise<Response>((resolve) => (refuseLate = resolve))
          : expired();
      };
      const { client } = launch();

      // Two requests leave with the old token. One is refused at once and
      // renews the session; the other hears of its refusal only afterwards.
      const slow = Promise.resolve(client.rpc('get_badges'));
      await jest.advanceTimersByTimeAsync(100);
      expect(sent.filter(isRest).map((request) => request.bearer)).toEqual([OLD_TOKEN]);
      await settled(client.rpc('get_roost'));
      refuseLate(expired());
      const { error } = await settled(slow);

      expect(error).toBeNull();
      expect(sent.filter(isRenewal)).toHaveLength(1);
    });
  });
});

/**
 * Android's keystore and the iOS keychain can both refuse a read. The client's
 * first act is to read its session, and a read that threw left it - and with it
 * the app, behind its splash screen - waiting for good.
 */
describe('a keychain that refuses to be read', () => {
  it('does not keep the client from starting', async () => {
    const session = sessionOf(OLD_TOKEN, 'refresh-old', 3000);
    await keep(session);
    mockRefusal.reads = true;

    const { client, events } = launch();
    const { data, error } = await settled(client.auth.getSession());

    expect(data.session).toBeNull();
    expect(error).toBeNull();
    expect(events).toContain('INITIAL_SESSION');
    // What could not be read was left alone; it may be readable the next time.
    mockRefusal.reads = false;
    expect(await kept()).toEqual(session);
  });

  it('lets a new sign-in take the place of what could not be read', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 3000));
    mockRefusal.reads = true;
    network = () => json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));
    const { client } = launch();

    const { error } = await settled(
      client.auth.signInWithPassword({ email: 'mara@example.test', password: 'night-courier' }),
    );

    expect(error).toBeNull();
    mockRefusal.reads = false;
    expect((await kept())?.refresh_token).toBe('refresh-new');
  });
});

describe('signing in and out', () => {
  const issued = () => sessionOf(NEW_TOKEN, 'refresh-new', 3600);
  const credentials = { email: 'mara@example.test', password: 'night-courier' };

  /**
   * The app reads the session for itself at launch, so it has to know where it
   * is - and the keychain refuses some of the names supabase-js makes up.
   */
  it('keeps the session in the keychain, under the name the app reads it by', async () => {
    network = (request) =>
      request.url.includes('grant_type=password') ? json(200, issued()) : json(200, []);
    const { client, store } = launch();

    const { error } = await settled(client.auth.signInWithPassword(credentials));

    expect(error).toBeNull();
    expect((await kept())?.refresh_token).toBe('refresh-new');
    expect(await store.readStoredSession()).toEqual(await kept());
    expect(store.isSessionStored()).toBe(true);
  });

  it('leaves nothing in the keychain after signing out', async () => {
    network = (request) => {
      if (request.url.includes('grant_type=password')) return json(200, issued());
      return new Response(null, { status: 204 });
    };
    const { client, store } = launch();
    await settled(client.auth.signInWithPassword(credentials));

    const { error } = await settled(client.auth.signOut());

    expect(error).toBeNull();
    expect(mockKeychain.size).toBe(0);
    expect(store.isSessionStored()).toBe(false);
  });

  it('lets the form see a rate limit as the auth server gave it', async () => {
    network = () => authRefusal(429, 'over_request_rate_limit', 'Request rate limit reached');
    const { client } = launch();

    const { error } = await settled(client.auth.signInWithPassword(credentials));

    expect(error?.status).toBe(429);
    expect(error?.message).toBe('Request rate limit reached');
  });
});

/**
 * The client asks for the code flow (PKCE). The emails carry a code to type,
 * and no link; but should a template with a link ever be used, the link then
 * brings a one-time code that only this device can turn into a session, with
 * the verifier it keeps for it - not a whole session, handed through the app's
 * URL scheme to whichever app answers to it.
 */
describe('the code flow', () => {
  const isSignUp = (request: Sent) => request.url.endsWith('/auth/v1/signup');
  const isResend = (request: Sent) => request.url.endsWith('/auth/v1/resend');
  const isRecover = (request: Sent) => request.url.includes('/auth/v1/recover');
  const VERIFIERS = [
    'night-courier.session-code-verifier',
    'night-courier.session-flows-code-verifier',
  ];
  const isVerifier = (key: string) =>
    key.startsWith('night-courier.session-') && key.endsWith('code-verifier');

  const answered = () => {
    network = (request) => {
      if (isSignUp(request)) return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600).user);
      if (request.url.endsWith('/auth/v1/verify')) {
        return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));
      }
      if (request.url.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
      return json(200, {});
    };
  };

  /** The challenge is the verifier itself there, which only the auth server is shown. */
  it('sends a code challenge with a sign-up, a new code and a reset, as a phone makes one', async () => {
    answered();
    const { client } = launch();

    await settled(client.auth.signUp({ email: 'mara@example.test', password: 'night-courier' }));
    await settled(client.auth.resend({ type: 'signup', email: 'mara@example.test' }));
    await settled(client.auth.resetPasswordForEmail('mara@example.test'));

    const challenges = sent
      .filter((request) => isSignUp(request) || isResend(request) || isRecover(request))
      .map(({ body }) => body as { code_challenge?: string; code_challenge_method?: string });
    expect(challenges).toHaveLength(3);
    for (const { code_challenge, code_challenge_method } of challenges) {
      expect(code_challenge).toEqual(expect.stringMatching(/^[\w.~-]{56}$/));
      expect(code_challenge_method).toBe('plain');
    }
    expect(new Set(challenges.map(({ code_challenge }) => code_challenge)).size).toBe(3);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('WebCrypto API is not supported'),
    );
  });

  /** In a browser, which has WebCrypto, the challenge is the verifier's hash. */
  it('sends the verifier’s hash as the challenge where there is WebCrypto', async () => {
    jest.useRealTimers();
    cryptoAs(webCrypto);
    try {
      answered();
      const { client } = launch();

      await client.auth.resetPasswordForEmail('mara@example.test');

      expect(sent.find(isRecover)?.body).toMatchObject({
        code_challenge: expect.stringMatching(/^[\w-]{43}$/),
        code_challenge_method: 's256',
      });
    } finally {
      cryptoAs(undefined);
    }
  });

  /**
   * The verifier for each code goes into the keychain, under names it takes
   * and in entries small enough for it, and stays until signing out - which
   * takes it, as it takes the session.
   */
  it('keeps the verifiers in the keychain until signing out, and leaves nothing after it', async () => {
    answered();
    const { client } = launch();

    await settled(client.auth.signUp({ email: 'mara@example.test', password: 'night-courier' }));
    await settled(client.auth.resetPasswordForEmail('mara@example.test'));

    const kept = [...mockKeychain.keys()];
    expect(kept).toEqual(expect.arrayContaining(VERIFIERS));
    expect(kept.filter(isVerifier)).toHaveLength(4);
    expect(kept.filter((key) => !isVerifier(key))).toEqual([]);

    await settled(client.auth.signOut());

    expect(mockKeychain.size).toBe(0);
  });

  /** A code typed in needs no verifier: the auth server checks the code itself. */
  it('signs in with a code from an email as before', async () => {
    answered();
    const { client, store } = launch();

    const { error } = await settled(
      client.auth.verifyOtp({ type: 'signup', email: 'mara@example.test', token: '12345678' }),
    );

    expect(error).toBeNull();
    expect(sent.find(({ url }) => url.endsWith('/auth/v1/verify'))?.body).not.toHaveProperty(
      'code_verifier',
    );
    expect(store.isSessionStored()).toBe(true);
    expect([...mockKeychain.keys()].filter(isVerifier)).toEqual([]);
  });

  it('signs in with a password, and changes a password, with nothing of it', async () => {
    network = (request) => {
      if (request.url.includes('grant_type=password')) {
        return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600));
      }
      return json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600).user);
    };
    const { client } = launch();

    await settled(
      client.auth.signInWithPassword({ email: 'mara@example.test', password: 'night-courier' }),
    );
    const { error } = await settled(client.auth.updateUser({ password: 'a new password' }));

    expect(error).toBeNull();
    for (const { body } of sent.filter(({ url }) => url.includes('/auth/v1/'))) {
      expect(body).not.toEqual(expect.objectContaining({ code_challenge: expect.anything() }));
    }
    expect([...mockKeychain.keys()].filter(isVerifier)).toEqual([]);
  });
});

describe('while the app is open', () => {
  const renews = () => {
    network = (request) =>
      isRenewal(request) ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)) : json(200, []);
  };

  it('renews a session that is about to run out, without being asked', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 200));
    renews();
    launch();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(sent.filter(isRenewal)).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(sent.filter(isRenewal)).toHaveLength(1);
    expect((await kept())?.refresh_token).toBe('refresh-new');
  });

  it('renews nothing while the app is in the background, and catches up in front', async () => {
    await keep(sessionOf(OLD_TOKEN, 'refresh-old', 200));
    renews();
    const { appBecomes } = launch();
    await jest.advanceTimersByTimeAsync(1_000);

    appBecomes('background');
    await jest.advanceTimersByTimeAsync(150_000);
    expect(sent.filter(isRenewal)).toHaveLength(0);

    appBecomes('active');
    await jest.advanceTimersByTimeAsync(1_000);
    expect(sent.filter(isRenewal)).toHaveLength(1);
  });
});
