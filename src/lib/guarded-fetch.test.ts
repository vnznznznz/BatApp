import { createGuardedFetch, RENEWAL_PAUSE_MS, REQUEST_TIMEOUT_MS } from '@/lib/guarded-fetch';

const ANON_KEY = 'sb_publishable_test_key';
const PROJECT = 'https://test-project.supabase.co';
const RENEWAL = `${PROJECT}/auth/v1/token?grant_type=refresh_token`;
const SIGN_IN = `${PROJECT}/auth/v1/token?grant_type=password`;
const ROOST = `${PROJECT}/rest/v1/rpc/get_roost`;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** A refusal in the shape the auth server gives one to supabase-js. */
const authRefusal = (status: number, code: string, message: string) =>
  json(status, { code, message }, { 'X-Supabase-Api-Version': '2024-01-01' });

const expired = () =>
  json(401, { code: 'PGRST303', details: null, hint: null, message: 'JWT expired' });

/** What supabase-js gives its fetch for a call to a database function. */
const call = (token: string | null, body: unknown = {}): RequestInit => ({
  method: 'POST',
  headers: new Headers({
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
    ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
  }),
  body: JSON.stringify(body),
});

const bearerOf = (init: RequestInit | undefined) =>
  new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '') ?? null;

function setUp({ sessionStored = true } = {}) {
  const network = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit | undefined]>();
  const renewSession = jest.fn<Promise<string | null>, [string]>();
  const guarded = createGuardedFetch({
    anonKey: ANON_KEY,
    isSessionStored: () => sessionStored,
    renewSession,
    fetch: network,
  });
  return { guarded, network, renewSession };
}

/** A promise's outcome, without waiting for it. */
function watch<T>(promise: Promise<T>) {
  const state: { outcome: 'pending' | 'resolved' | 'rejected'; error?: unknown } = {
    outcome: 'pending',
  };
  promise.then(
    () => {
      state.outcome = 'resolved';
    },
    (error: unknown) => {
      state.outcome = 'rejected';
      state.error = error;
    },
  );
  return state;
}

/**
 * Nothing underneath sets a time limit. React Native's Android client is built
 * with every timeout at zero, so a request on a connection that takes it and
 * never answers was waited for until the app was closed.
 */
describe('the time a request may take', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ends, as a failed network request, when no answer comes', async () => {
    const { guarded, network } = setUp();
    network.mockReturnValue(new Promise(() => {}));

    const state = watch(guarded(ROOST, call('token')));
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(state.outcome).toBe('pending');
    await jest.advanceTimersByTimeAsync(1);

    expect(state.outcome).toBe('rejected');
    expect(state.error).toBeInstanceOf(TypeError);
    // What auth-js retries on, and what the app words as "No connection".
    expect((state.error as Error).message).toMatch(/^Network request/);
    // The request itself is given up, not left running.
    expect(network.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('is about twenty seconds', () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  /**
   * Expo's fetch answers as soon as the headers are in, and its `text()` then
   * waits for a body with no limit of its own - and without end if the
   * connection is lost meanwhile. The answer counts as here only with its body.
   */
  it('covers the body of the answer as well as its headers', async () => {
    const { guarded, network } = setUp();
    const headersOnly = { status: 200, statusText: 'OK', headers: new Headers() };
    network.mockResolvedValue({ ...headersOnly, text: () => new Promise(() => {}) } as Response);

    const state = watch(guarded(ROOST, call('token')));
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    expect(state.outcome).toBe('rejected');
    expect((state.error as Error).message).toMatch(/^Network request/);
  });

  it('leaves no timer behind once the answer is in', async () => {
    const { guarded, network } = setUp();
    network.mockResolvedValue(json(200, []));

    await guarded(ROOST, call('token'));

    expect(jest.getTimerCount()).toBe(0);
  });

  it('starts again for a request that is repeated', async () => {
    const { guarded, network, renewSession } = setUp();
    network.mockResolvedValueOnce(expired()).mockReturnValueOnce(new Promise(() => {}));
    renewSession.mockResolvedValue('new-token');

    const state = watch(guarded(ROOST, call('old-token')));
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(state.outcome).toBe('pending');
    await jest.advanceTimersByTimeAsync(1);

    expect(state.outcome).toBe('rejected');
  });

  describe('for a caller with a signal of its own', () => {
    it('ends at once when the caller gives up', async () => {
      const { guarded, network } = setUp();
      network.mockReturnValue(new Promise(() => {}));
      const caller = new AbortController();

      const state = watch(guarded(ROOST, { ...call('token'), signal: caller.signal }));
      await jest.advanceTimersByTimeAsync(1000);
      caller.abort();
      await jest.advanceTimersByTimeAsync(0);

      expect(state.outcome).toBe('rejected');
      // postgrest-js tells a request that was called off from one that failed by this name.
      expect((state.error as Error).name).toBe('AbortError');
      expect(network.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('sends nothing for a caller who has given up already', async () => {
      const { guarded, network } = setUp();
      const caller = new AbortController();
      caller.abort();

      await expect(guarded(ROOST, { ...call('token'), signal: caller.signal })).rejects.toThrow(
        expect.objectContaining({ name: 'AbortError' }),
      );

      expect(network).not.toHaveBeenCalled();
    });

    /**
     * One signal can serve many requests, and outlive each of them. A request
     * that is over lets go of it, or everything it held would be kept for as
     * long as the signal is.
     */
    it('no longer listens to the caller once the request is over', async () => {
      const { guarded, network } = setUp();
      network
        .mockResolvedValueOnce(json(200, []))
        .mockRejectedValueOnce(new TypeError('Network request failed'));
      const caller = new AbortController();
      await guarded(ROOST, { ...call('token'), signal: caller.signal });
      await guarded(ROOST, { ...call('token'), signal: caller.signal }).catch(() => {});

      caller.abort();

      // Giving up now reaches neither: not the one answered, not the one that failed.
      expect(network.mock.calls.map(([, init]) => init?.signal?.aborted)).toEqual([false, false]);
    });
  });
});

describe('an answer', () => {
  it('reaches the caller as it came', async () => {
    const { guarded, network } = setUp();
    network.mockResolvedValue(
      new Response(JSON.stringify([{ name: 'Zoë' }]), {
        status: 206,
        statusText: 'Partial Content',
        headers: { 'content-type': 'application/json', 'content-range': '0-0/7' },
      }),
    );

    const answer = await guarded(ROOST, call('token'));

    expect(answer.status).toBe(206);
    expect(answer.ok).toBe(true);
    expect(answer.statusText).toBe('Partial Content');
    expect(answer.headers.get('content-range')).toBe('0-0/7');
    expect(await answer.json()).toEqual([{ name: 'Zoë' }]);
  });

  /** A database function that returns nothing answers 204, which may carry no body. */
  it('reaches the caller when it has no body', async () => {
    const { guarded, network } = setUp();
    network.mockResolvedValue(new Response(null, { status: 204 }));

    const answer = await guarded(ROOST, call('token'));

    expect(answer.status).toBe(204);
    expect(await answer.text()).toBe('');
  });

  it('reaches the caller when it is a refusal', async () => {
    const { guarded, network, renewSession } = setUp();
    const refusal = { code: 'P0001', hint: 'no_available_bat', message: 'every bat is out' };
    network.mockResolvedValue(json(400, refusal));

    const answer = await guarded(ROOST, call('token'));

    expect(answer.status).toBe(400);
    expect(answer.ok).toBe(false);
    expect(await answer.json()).toEqual(refusal);
    expect(renewSession).not.toHaveBeenCalled();
  });

  it('is asked of the fetch the platform has at that moment', async () => {
    const guarded = createGuardedFetch({
      anonKey: ANON_KEY,
      isSessionStored: () => true,
      renewSession: jest.fn(),
    });
    const platform = jest.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, [1]));

    const answer = await guarded(ROOST, call('token'));

    expect(await answer.json()).toEqual([1]);
    expect(platform).toHaveBeenCalledWith(ROOST, expect.objectContaining({ method: 'POST' }));
    platform.mockRestore();
  });
});

/**
 * Once the access token has run out, auth-js deletes the stored session on
 * every failed renewal it does not class as worth retrying - which is every
 * answer but a handful of status codes. Only the auth server saying that this
 * session is over may end it.
 */
describe('the answer to a renewal of the session', () => {
  it.each<[string, () => Response]>([
    [
      'a rate limit from the auth server',
      () => authRefusal(429, 'over_request_rate_limit', 'Request rate limit reached'),
    ],
    ['a rate limit from the gateway', () => new Response('error code: 1015', { status: 429 })],
    [
      'too many renewals at once',
      () =>
        authRefusal(
          409,
          'conflict',
          'Too many concurrent token refresh requests on the same session or refresh token',
        ),
    ],
    [
      'a request the auth server could not read',
      () => authRefusal(400, 'bad_json', 'Could not parse request body as JSON'),
    ],
    ['a key the gateway does not know', () => json(401, { message: 'Invalid API key' })],
    [
      'a restricted project',
      () => json(402, { message: 'Service for this project is restricted' }),
    ],
    [
      'a page from a filter in between',
      () => new Response('<html>blocked</html>', { status: 403 }),
    ],
    ['a page that is not there', () => new Response('<html>not found</html>', { status: 404 })],
    ['a request timeout', () => new Response('timeout', { status: 408 })],
    [
      'an error inside the auth server',
      () => authRefusal(500, 'unexpected_failure', 'Database error querying schema'),
    ],
    ['a gateway that cannot reach it', () => new Response('<html>502</html>', { status: 502 })],
    ['a paused project', () => json(540, { message: 'Project paused' })],
    ['a paused project, without a word', () => new Response(null, { status: 540 })],
    ['a gateway timeout', () => json(544, { message: 'The upstream server is timing out' })],
  ])('counts as a failed network request when it is %s', async (_, respond) => {
    const { guarded, network } = setUp();
    network.mockResolvedValue(respond());

    const renewal = guarded(RENEWAL, { method: 'POST', body: '{"refresh_token":"r"}' });

    await expect(renewal).rejects.toThrow(TypeError);
    await expect(renewal).rejects.toThrow(/^Network request/);
  });

  it.each<[string, number, object]>([
    [
      'the token is not known',
      400,
      {
        code: 'refresh_token_not_found',
        message: 'Invalid Refresh Token: Refresh Token Not Found',
      },
    ],
    [
      'the token is not known, in the older shape',
      400,
      {
        code: 400,
        error_code: 'refresh_token_not_found',
        msg: 'Invalid Refresh Token: Refresh Token Not Found',
      },
    ],
    [
      'the token has been used',
      400,
      { code: 'refresh_token_already_used', message: 'Invalid Refresh Token: Already Used' },
    ],
    [
      'there is no such session',
      400,
      { code: 'session_not_found', message: 'Invalid Refresh Token: No Valid Session Found' },
    ],
    [
      'the session has run out',
      400,
      { code: 'session_expired', message: 'Invalid Refresh Token: Session Expired (Inactivity)' },
    ],
    [
      'the account is suspended',
      400,
      { code: 'user_banned', message: 'Invalid Refresh Token: User Banned' },
    ],
    [
      'the account is gone',
      403,
      { code: 'user_not_found', message: 'User from sub claim in JWT does not exist' },
    ],
    [
      'the token is refused, in the oldest shape',
      400,
      { error: 'invalid_grant', error_description: 'Invalid Refresh Token' },
    ],
    // No code of its own for these two; the auth server's words are what say it.
    [
      'the token is no token',
      400,
      { code: 'validation_failed', message: 'Refresh token is not valid' },
    ],
    [
      'the token is from another server',
      400,
      { code: 'unknown_to_this_app', message: 'Invalid Refresh Token: Not Issued By This Server' },
    ],
  ])('is handed on when the auth server says %s', async (_, status, body) => {
    const { guarded, network } = setUp();
    network.mockResolvedValue(json(status, body, { 'X-Supabase-Api-Version': '2024-01-01' }));

    const answer = await guarded(RENEWAL, { method: 'POST', body: '{"refresh_token":"r"}' });

    expect(answer.status).toBe(status);
    // auth-js reads the version to know where the code is.
    expect(answer.headers.get('X-Supabase-Api-Version')).toBe('2024-01-01');
    expect(await answer.json()).toEqual(body);
  });

  /** The code is what auth-js goes by; it counts whatever words come with it. */
  it.each([
    'refresh_token_not_found',
    'refresh_token_already_used',
    'session_not_found',
    'session_expired',
    'user_banned',
    'user_not_found',
    'invalid_grant',
  ])('is handed on for the code %s alone', async (code) => {
    const { guarded, network } = setUp();
    network.mockResolvedValue(json(400, { code, message: 'reworded' }));

    const answer = await guarded(RENEWAL, { method: 'POST', body: '{"refresh_token":"r"}' });

    expect(await answer.json()).toEqual({ code, message: 'reworded' });
  });

  /** A client that names no API version gets the code and the words under other names. */
  it.each<[string, object]>([
    ['the code', { code: 400, error_code: 'session_expired', msg: 'reworded' }],
    [
      'the words',
      { code: 400, error_code: 'validation_failed', msg: 'Refresh token is not valid' },
    ],
    ['a refusal from before there were codes', { error: 'invalid_grant' }],
  ])('is handed on for %s in an older shape of the answer', async (_, body) => {
    const { guarded, network } = setUp();
    network.mockResolvedValue(json(400, body));

    const answer = await guarded(RENEWAL, { method: 'POST', body: '{"refresh_token":"r"}' });

    expect(await answer.json()).toEqual(body);
  });

  it('is handed on when it is a new session', async () => {
    const { guarded, network } = setUp();
    const session = { access_token: 'a', refresh_token: 'r', expires_in: 3600 };
    network.mockResolvedValue(json(200, session));

    const answer = await guarded(RENEWAL, { method: 'POST', body: '{"refresh_token":"r"}' });

    expect(await answer.json()).toEqual(session);
  });

  it('is told apart from the answers to a form, which reach the form as they are', async () => {
    const { guarded, network } = setUp();
    const limit = { code: 'over_request_rate_limit', message: 'Request rate limit reached' };
    const taken = { code: 'unexpected_failure', message: 'Database error saving new user' };
    network
      .mockResolvedValueOnce(json(429, limit))
      .mockResolvedValueOnce(json(500, taken))
      .mockResolvedValueOnce(json(429, limit));

    const signIn = await guarded(SIGN_IN, { method: 'POST', body: '{}' });
    const signUp = await guarded(`${PROJECT}/auth/v1/signup`, { method: 'POST', body: '{}' });
    const reset = await guarded(`${PROJECT}/auth/v1/recover`, { method: 'POST', body: '{}' });

    expect([signIn.status, signUp.status, reset.status]).toEqual([429, 500, 429]);
    expect(await signIn.json()).toEqual(limit);
    expect(await signUp.json()).toEqual(taken);
  });

  it('is recognised however the address is given', async () => {
    const { guarded, network } = setUp();
    network.mockImplementation(async () => json(540, { message: 'Project paused' }));

    await expect(guarded(new URL(RENEWAL), { method: 'POST' })).rejects.toThrow(/^Network request/);
    await expect(guarded(new Request(RENEWAL, { method: 'POST' }))).rejects.toThrow(
      /^Network request/,
    );
  });
});

/**
 * auth-js tries a renewal that failed again at once: after 200 ms, then after
 * twice as long each time, eight attempts in the half minute it allows itself,
 * and the same again a minute later. That suits a network that drops. A rate
 * limit, or a project that is paused, answers the eighth as it answered the
 * first - and every open app sent eight renewals where it had sent one.
 */
describe('after an answer to a renewal that neither renews the session nor ends it', () => {
  /** When auth-js tries a renewal again, counted from its first attempt. */
  const RETRIES_MS = [200, 600, 1400, 3000, 6200, 12_600, 25_400];

  const limited = (headers: Record<string, string> = {}) =>
    json(
      429,
      { code: 'over_request_rate_limit', message: 'Request rate limit reached' },
      { 'X-Supabase-Api-Version': '2024-01-01', ...headers },
    );

  const renewal: RequestInit = { method: 'POST', body: '{"refresh_token":"r"}' };
  const FIVE_MINUTES = 5 * 60_000;

  /** Lets time pass; nothing is waiting for it but the clock. */
  const passes = (ms: number) => jest.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends one renewal where auth-js asks for eight, and fails the others as the first failed', async () => {
    const { guarded, network } = setUp();
    network.mockImplementation(async () => limited());

    const failures: unknown[] = [await guarded(RENEWAL, renewal).catch((error: unknown) => error)];
    let waited = 0;
    for (const at of RETRIES_MS) {
      await passes(at - waited);
      waited = at;
      failures.push(await guarded(RENEWAL, renewal).catch((error: unknown) => error));
    }

    expect(network).toHaveBeenCalledTimes(1);
    expect(failures).toHaveLength(8);
    for (const failure of failures) {
      // What auth-js keeps the session after, and the app words as "No connection".
      expect(failure).toBeInstanceOf(TypeError);
      expect((failure as Error).message).toMatch(/^Network request/);
      // What the auth server answered stays in the words, for whoever looks into it.
      expect((failure as Error).message).toContain('429');
    }
  });

  it('asks again once half a minute is over', async () => {
    const { guarded, network } = setUp();
    network
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(json(200, { access_token: 'a', refresh_token: 'r2' }));
    await guarded(RENEWAL, renewal).catch(() => {});

    await passes(RENEWAL_PAUSE_MS - 1);
    await expect(guarded(RENEWAL, renewal)).rejects.toThrow(/^Network request/);
    expect(network).toHaveBeenCalledTimes(1);
    await passes(1);
    const answer = await guarded(RENEWAL, renewal);

    expect(await answer.json()).toEqual({ access_token: 'a', refresh_token: 'r2' });
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('is about half a minute, which is how long auth-js goes on trying', () => {
    expect(RENEWAL_PAUSE_MS).toBeGreaterThan(RETRIES_MS.at(-1)!);
    expect(RENEWAL_PAUSE_MS).toBeLessThanOrEqual(60_000);
  });

  it('starts the wait again with each answer of that kind', async () => {
    const { guarded, network } = setUp();
    network.mockImplementation(async () => limited());
    await guarded(RENEWAL, renewal).catch(() => {});
    await passes(RENEWAL_PAUSE_MS);
    await guarded(RENEWAL, renewal).catch(() => {});
    expect(network).toHaveBeenCalledTimes(2);

    await passes(RENEWAL_PAUSE_MS - 1);
    await guarded(RENEWAL, renewal).catch(() => {});

    expect(network).toHaveBeenCalledTimes(2);
  });

  it.each<[string, () => Response]>([
    ['a paused project', () => json(540, { message: 'Project paused' })],
    [
      'a gateway that cannot reach the auth server',
      () => new Response('<html>502</html>', { status: 502 }),
    ],
    [
      'a page from a filter in between',
      () => new Response('<html>blocked</html>', { status: 403 }),
    ],
  ])('waits after %s as after a rate limit', async (_, respond) => {
    const { guarded, network } = setUp();
    network.mockImplementation(async () => respond());
    await guarded(RENEWAL, renewal).catch(() => {});

    await passes(RENEWAL_PAUSE_MS - 1);
    await guarded(RENEWAL, renewal).catch(() => {});

    expect(network).toHaveBeenCalledTimes(1);
  });

  /** A rate limit that says when it ends: `Retry-After`, in seconds or as a date. */
  describe('when the answer says how long to wait', () => {
    it.each([
      ['longer than half a minute', '120', 120_000],
      ['shorter than half a minute', '5', 5000],
    ])('waits that long: %s', async (_, retryAfter, ms) => {
      const { guarded, network } = setUp();
      network.mockImplementation(async () => limited({ 'Retry-After': retryAfter }));
      await guarded(RENEWAL, renewal).catch(() => {});

      await passes(ms - 1);
      await guarded(RENEWAL, renewal).catch(() => {});
      expect(network).toHaveBeenCalledTimes(1);
      await passes(1);
      await guarded(RENEWAL, renewal).catch(() => {});

      expect(network).toHaveBeenCalledTimes(2);
    });

    it('waits until the time of day it names', async () => {
      const { guarded, network } = setUp();
      // To the second, which is as fine as an HTTP date is.
      jest.setSystemTime(new Date('2026-11-17T12:00:00Z'));
      network.mockImplementation(async () =>
        limited({ 'Retry-After': 'Tue, 17 Nov 2026 12:01:30 GMT' }),
      );
      await guarded(RENEWAL, renewal).catch(() => {});

      await passes(90_000 - 1);
      await guarded(RENEWAL, renewal).catch(() => {});
      expect(network).toHaveBeenCalledTimes(1);
      await passes(1);
      await guarded(RENEWAL, renewal).catch(() => {});

      expect(network).toHaveBeenCalledTimes(2);
    });

    /**
     * Nothing renews the session while renewals wait, so a wait is taken at
     * its word only so far: an answer that says a day would sign nobody out,
     * but would leave the app without its server until it was closed.
     */
    it.each([
      ['a day', '86400'],
      ['a date a year off', 'Wed, 17 Nov 2027 12:00:00 GMT'],
    ])('waits no longer than five minutes when it says %s', async (_, retryAfter) => {
      const { guarded, network } = setUp();
      jest.setSystemTime(new Date('2026-11-17T12:00:00Z'));
      network.mockImplementation(async () => limited({ 'Retry-After': retryAfter }));
      await guarded(RENEWAL, renewal).catch(() => {});

      await passes(FIVE_MINUTES - 1);
      await guarded(RENEWAL, renewal).catch(() => {});
      expect(network).toHaveBeenCalledTimes(1);
      await passes(1);
      await guarded(RENEWAL, renewal).catch(() => {});

      expect(network).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['words that are no time', 'soon'],
      ['nothing', ''],
      ['a number that is no count of seconds', '1.5e3'],
      ['a time that is past', 'Mon, 16 Nov 2026 12:00:00 GMT'],
      ['no time at all', '0'],
    ])('waits half a minute when it says %s', async (_, retryAfter) => {
      const { guarded, network } = setUp();
      jest.setSystemTime(new Date('2026-11-17T12:00:00Z'));
      network.mockImplementation(async () => limited({ 'Retry-After': retryAfter }));
      await guarded(RENEWAL, renewal).catch(() => {});

      await passes(RENEWAL_PAUSE_MS - 1);
      await guarded(RENEWAL, renewal).catch(() => {});
      expect(network).toHaveBeenCalledTimes(1);
      await passes(1);
      await guarded(RENEWAL, renewal).catch(() => {});

      expect(network).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * Only an answer starts the wait. A request that did not get through is what
   * auth-js's eight attempts are for: the network may be back for the second.
   */
  it('does not wait after a renewal that did not get through', async () => {
    const { guarded, network } = setUp();
    network
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(json(200, { access_token: 'a', refresh_token: 'r2' }));
    await expect(guarded(RENEWAL, renewal)).rejects.toThrow('Network request failed');

    await passes(RETRIES_MS[0]!);
    const answer = await guarded(RENEWAL, renewal);

    expect(answer.status).toBe(200);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('does not wait after a renewal that timed out', async () => {
    const { guarded, network } = setUp();
    network.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(json(200, {}));
    const timedOut = watch(guarded(RENEWAL, renewal));
    await passes(REQUEST_TIMEOUT_MS);
    expect(timedOut.outcome).toBe('rejected');

    const answer = await guarded(RENEWAL, renewal);

    expect(answer.status).toBe(200);
  });

  it.each<[string, () => Response]>([
    ['renewed', () => json(200, { access_token: 'a', refresh_token: 'r2' })],
    [
      'over',
      () =>
        authRefusal(
          400,
          'refresh_token_not_found',
          'Invalid Refresh Token: Refresh Token Not Found',
        ),
    ],
  ])('does not wait once the session is %s', async (_, respond) => {
    const { guarded, network } = setUp();
    network.mockImplementation(async () => respond());
    await guarded(RENEWAL, renewal);

    await guarded(RENEWAL, renewal);

    expect(network).toHaveBeenCalledTimes(2);
  });

  /** A sign-in is the person's own doing, and the database has limits of its own. */
  it('holds back renewals only', async () => {
    const { guarded, network } = setUp();
    network.mockResolvedValueOnce(limited()).mockImplementation(async () => json(200, []));
    await guarded(RENEWAL, renewal).catch(() => {});

    const signIn = await guarded(SIGN_IN, { method: 'POST', body: '{}' });
    const roost = await guarded(ROOST, call('token'));

    expect([signIn.status, roost.status]).toEqual([200, 200]);
    expect(network).toHaveBeenCalledTimes(3);
  });
});

describe('a request to the database', () => {
  /**
   * For a minute after a renewal has failed, auth-js answers "no session" from
   * memory, and supabase-js then sends the publishable key where the session's
   * token belongs. The database refuses that as a stranger - "permission
   * denied" - and the app blames the connection for it, wrongly.
   */
  describe('that carries no session', () => {
    it.each([
      ['the publishable key in its place', ANON_KEY],
      ['nothing in its place', null],
    ])('is not sent while a session is stored: %s', async (_, token) => {
      const { guarded, network } = setUp({ sessionStored: true });

      const request = guarded(ROOST, call(token));

      await expect(request).rejects.toThrow(TypeError);
      await expect(request).rejects.toThrow(/^Network request/);
      expect(network).not.toHaveBeenCalled();
    });

    it('is sent when nobody is signed in', async () => {
      const { guarded, network } = setUp({ sessionStored: false });
      network.mockResolvedValue(json(200, []));

      const answer = await guarded(ROOST, call(ANON_KEY));

      expect(answer.status).toBe(200);
      expect(bearerOf(network.mock.calls[0]?.[1])).toBe(ANON_KEY);
    });

    it('is not held back when it goes to the auth server', async () => {
      const { guarded, network } = setUp({ sessionStored: true });
      network.mockResolvedValue(json(200, {}));

      const answer = await guarded(SIGN_IN, call(ANON_KEY));

      expect(answer.status).toBe(200);
    });
  });

  /**
   * The client renews by this device's clock, the server refuses by its own. On
   * a phone whose clock is slow the token runs out on the server first; nothing
   * renewed it then, and every request failed until the phone caught up.
   */
  describe('refused because its token has run out', () => {
    it.each([
      ['expired', 'PGRST303', 'JWT expired'],
      ['not accepted', 'PGRST301', 'No suitable key or wrong key type'],
    ])('is repeated once with a renewed token: %s', async (_, code, message) => {
      const { guarded, network, renewSession } = setUp();
      network
        .mockResolvedValueOnce(json(401, { code, details: null, hint: null, message }))
        .mockResolvedValueOnce(json(200, [{ bat_id: 'b1' }]));
      renewSession.mockResolvedValue('new-token');

      const answer = await guarded(ROOST, call('old-token', { a: 1 }));

      expect(await answer.json()).toEqual([{ bat_id: 'b1' }]);
      expect(renewSession).toHaveBeenCalledTimes(1);
      expect(renewSession).toHaveBeenCalledWith('old-token');
      expect(network).toHaveBeenCalledTimes(2);
      // The same request again, but for the token.
      const [address, repeated] = network.mock.calls[1]!;
      expect(address).toBe(ROOST);
      expect(repeated?.method).toBe('POST');
      expect(repeated?.body).toBe('{"a":1}');
      expect(bearerOf(repeated)).toBe('new-token');
      expect(new Headers(repeated?.headers).get('apikey')).toBe(ANON_KEY);
      expect(new Headers(repeated?.headers).get('Content-Type')).toBe('application/json');
    });

    it('renews once for all the requests refused together', async () => {
      const { guarded, network, renewSession } = setUp();
      // Refusals whose reading can be counted, so that the renewal is let go
      // only once every request has its refusal - by count, not by the clock.
      let refusalsRead = 0;
      const refusal = {
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        text: async () => {
          refusalsRead += 1;
          return JSON.stringify({ code: 'PGRST303', message: 'JWT expired' });
        },
      } as Response;
      network.mockImplementation(async (_address, init) =>
        bearerOf(init) === 'new-token' ? json(200, []) : refusal,
      );
      let renewed: (token: string) => void = () => {};
      renewSession.mockReturnValue(new Promise((resolve) => (renewed = resolve)));
      const nextTurn = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

      const requests = [1, 2, 3].map(() => guarded(ROOST, call('old-token')));
      while (refusalsRead < 3) await nextTurn();
      await nextTurn();
      renewed('new-token');
      const answers = await Promise.all(requests);

      expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
      expect(renewSession).toHaveBeenCalledTimes(1);
    });

    it('asks again for a renewal the next time it happens', async () => {
      const { guarded, network, renewSession } = setUp();
      network.mockImplementation(async (_address, init) =>
        bearerOf(init) === 'old-token' ? expired() : json(200, []),
      );
      renewSession.mockResolvedValue('new-token');

      await guarded(ROOST, call('old-token'));
      await guarded(ROOST, call('old-token'));

      expect(renewSession).toHaveBeenCalledTimes(2);
    });

    it('is not repeated a second time', async () => {
      const { guarded, network, renewSession } = setUp();
      network.mockImplementation(async () => expired());
      renewSession.mockResolvedValue('new-token');

      const answer = await guarded(ROOST, call('old-token'));

      expect(answer.status).toBe(401);
      expect((await answer.json()).code).toBe('PGRST303');
      expect(network).toHaveBeenCalledTimes(2);
      expect(renewSession).toHaveBeenCalledTimes(1);
    });

    it('is answered with the refusal when the session is over', async () => {
      const { guarded, network, renewSession } = setUp();
      network.mockResolvedValue(expired());
      renewSession.mockResolvedValue(null);

      const answer = await guarded(ROOST, call('old-token'));

      expect(answer.status).toBe(401);
      expect((await answer.json()).message).toBe('JWT expired');
      expect(network).toHaveBeenCalledTimes(1);
    });

    /** A renewal that hands back the token just refused has renewed nothing. */
    it('is not repeated with the very token that was refused', async () => {
      const { guarded, network, renewSession } = setUp();
      network.mockImplementation(async () => expired());
      renewSession.mockResolvedValue('old-token');

      const answer = await guarded(ROOST, call('old-token'));

      expect(answer.status).toBe(401);
      expect((await answer.json()).message).toBe('JWT expired');
      expect(network).toHaveBeenCalledTimes(1);
    });

    it('fails as the renewal failed when the auth server could not be asked', async () => {
      const { guarded, network, renewSession } = setUp();
      network.mockResolvedValue(expired());
      renewSession.mockRejectedValue(new TypeError('Network request failed'));

      await expect(guarded(ROOST, call('old-token'))).rejects.toThrow('Network request failed');
    });
  });

  it.each<[string, () => Response]>([
    [
      'refused for another reason',
      () => json(401, { code: '42501', message: 'permission denied for function get_roost' }),
    ],
    ['refused by the gateway', () => json(401, { message: 'Invalid API key' })],
    ['refused without a word', () => new Response(null, { status: 401 })],
    ['answered with an error that only mentions the code', () => json(400, { code: 'PGRST303' })],
  ])('renews nothing when it is %s', async (_, respond) => {
    const { guarded, network, renewSession } = setUp();
    network.mockResolvedValue(respond());

    await guarded(ROOST, call('old-token'));

    expect(renewSession).not.toHaveBeenCalled();
    expect(network).toHaveBeenCalledTimes(1);
  });

  /**
   * The auth client uses the same fetch, and a renewal is itself one of its
   * requests: renewing from inside one would never end.
   */
  it('renews nothing for a request of the auth client, whatever the answer looks like', async () => {
    const { guarded, network, renewSession } = setUp();
    network.mockImplementation(async () => expired());

    const user = await guarded(`${PROJECT}/auth/v1/user`, call('old-token'));
    const signOut = await guarded(`${PROJECT}/auth/v1/logout?scope=local`, call('old-token'));

    expect([user.status, signOut.status]).toEqual([401, 401]);
    expect(renewSession).not.toHaveBeenCalled();
  });
});
