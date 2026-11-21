/**
 * The fetch the Supabase client is given, in place of the platform's own.
 *
 * supabase-js decides what becomes of the session from what its fetch returns
 * or throws, and three of its decisions cost a courier their session, or an
 * hour of the app, for no fault of theirs:
 *
 * - it waits for an answer for as long as the platform does, and on a phone
 *   that is without end;
 * - it deletes the stored session on almost any failed renewal, a rate limit
 *   or a gateway's error page included;
 * - while it has no usable token it sends requests in nobody's name, and it
 *   never renews a token because the server said it had run out.
 *
 * Each is put right here, where every request passes. A failure that says
 * nothing about the session is made to look like what it most resembles, a
 * request that did not get through: auth-js keeps the session after one and
 * tries again later, and `toRpcError` words it as "No connection".
 */

import { forgetSuspension, noteAccountSuspended, noteSessionEnded } from '@/lib/farewell';

export type GuardedFetchOptions = {
  /** The publishable key: what a request carries in a token's place when it has no session. */
  anonKey: string;
  /** Whether this device holds a session, whether or not the client can use it right now. */
  isSessionStored: () => boolean;
  /**
   * Whether `refreshToken` is that of the session this device holds, and not
   * of one it has let go of and renews only to tell the server of a sign-out.
   */
  isStoredRefreshToken: (refreshToken: string) => boolean;
  /**
   * Renews the session for a request the database refused because its token,
   * `staleToken`, had run out. Resolves with the token to repeat the request
   * with, or with null when the session is over; rejects, the way a request
   * that did not get through does, when the auth server could not be asked.
   */
  renewSession: (staleToken: string) => Promise<string | null>;
  /** The fetch underneath: the platform's, unless a test brings its own. */
  fetch?: typeof fetch;
};

/**
 * How long one request may take, from sending it to the last byte of the
 * answer. Long enough for a slow mobile connection, short enough to still be
 * waited for.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * How long no renewal is sent after one that was answered with neither a
 * session nor the end of one, unless the answer says how long itself.
 *
 * auth-js tries a failed renewal again at once - after 200 ms, then after
 * twice as long each time - for the half minute it allows itself, and whatever
 * answered the first that way answers the other seven the same: a rate limit
 * counts each of them, a paused project stays paused. Half a minute makes one
 * request of the eight.
 */
export const RENEWAL_PAUSE_MS = 30_000;

/**
 * The longest an answer is taken at its word about waiting. Nothing renews the
 * session meanwhile, and what is held here lasts until the app is closed.
 */
const LONGEST_RENEWAL_PAUSE_MS = 5 * 60_000;

/**
 * What React Native's fetch throws for a request that never arrived. Both
 * halves of the client read it the right way: auth-js takes any thrown error
 * for a failure worth retrying, and postgrest-js hands the message on.
 */
const networkError = (what: string) => new TypeError(`Network request ${what}`);

/** The name postgrest-js knows a called-off request by, and does not retry. */
const abortError = () =>
  Object.assign(new Error('The request was called off'), { name: 'AbortError' });

type Answer = { response: Response; body: string };

/**
 * Sends one request and waits for the whole answer, body included, for no
 * longer than the time limit - or than the caller's own signal allows.
 *
 * The limit is a race, not only an abort: Expo's fetch resolves once the
 * headers are in, and a body read that is then cut off never settles at all.
 * So the body is read here, inside the race, and the caller is handed a copy
 * of the answer that has nothing left to wait for. It is read as text, which
 * is all the auth server and the database ever send.
 */
async function exchange(
  send: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Answer> {
  const caller = init?.signal;
  if (caller?.aborted) throw abortError();

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let calledOff = () => {};

  const stopped = new Promise<never>((_resolve, reject) => {
    const stop = (error: Error) => {
      controller.abort();
      reject(error);
    };
    timer = setTimeout(() => stop(networkError('timed out')), REQUEST_TIMEOUT_MS);
    calledOff = () => stop(abortError());
    caller?.addEventListener('abort', calledOff);
  });

  const answered = (async () => {
    const response = await send(input, { ...init, signal: controller.signal });
    const body = await response.text();
    // No body at all for an empty one: an answer such as 204 may not have one,
    // and a browser's Response refuses even an empty string for it.
    const copy = new Response(body === '' ? null : body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    return { response: copy, body };
  })();

  try {
    return await Promise.race([answered, stopped]);
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener('abort', calledOff);
  }
}

/** What a JSON answer says, field by field; nothing for an answer that is not one. */
function fieldsOf(body: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const textOf = (field: unknown) => (typeof field === 'string' ? field : '');

/** The auth server's codes for a session that is over, in every shape it has given them. */
const SESSION_OVER = [
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'session_expired',
  'user_banned',
  'user_not_found',
  'invalid_grant',
];

/**
 * Whether a refused renewal is the auth server's word on this session. Its
 * refusals of the token itself all begin alike, and not each has a code of its
 * own, so its words count as well as its codes.
 */
function endsTheSession(body: string): boolean {
  const said = fieldsOf(body);
  // `code` and `message` are how supabase-js is answered today. A client that
  // names no API version is answered with `error_code` and `msg` instead, and
  // before there were codes a refused token was `error: "invalid_grant"`.
  const codes = [said.code, said.error_code, said.error].map(textOf);
  const words = textOf(said.message) || textOf(said.msg);
  return (
    codes.some((code) => SESSION_OVER.includes(code)) ||
    /^(invalid refresh token|refresh token is not valid)/i.test(words)
  );
}

/**
 * Whether a refused renewal says the account is suspended - the one answer
 * that tells why a suspended account's session is over. The app has nothing
 * else to tell it by: signed out by the client, it lands on the welcome screen
 * as after any sign-out, which is told (see farewell.ts).
 */
function saysSuspended(body: string): boolean {
  const said = fieldsOf(body);
  return [said.code, said.error_code].map(textOf).includes('user_banned');
}

/** The refresh token a renewal carries, as auth-js sends it; empty when there is none. */
const refreshTokenOf = (init: RequestInit | undefined) =>
  textOf(fieldsOf(typeof init?.body === 'string' ? init.body : '').refresh_token);

/**
 * How long an answer asks to be left alone: its `Retry-After`, which counts in
 * seconds or names a time of day. The usual pause when it does not say, or
 * says nothing that lies ahead.
 */
function pauseAfter(response: Response): number {
  const asked = response.headers.get('Retry-After') ?? '';
  const ms = /^\d+$/.test(asked) ? Number(asked) * 1000 : Date.parse(asked) - Date.now();
  return ms > 0 ? Math.min(ms, LONGEST_RENEWAL_PAUSE_MS) : RENEWAL_PAUSE_MS;
}

/** PostgREST's two refusals of a token: it cannot be verified, or it has expired. */
const refusesTheToken = ({ response, body }: Answer) =>
  response.status === 401 && ['PGRST301', 'PGRST303'].includes(textOf(fieldsOf(body).code));

const addressOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : 'href' in input ? input.href : input.url;

const isRenewal = (address: string) =>
  /\/auth\/v1\/token\?(.*&)?grant_type=refresh_token(&|$)/.test(address);

const isDatabase = (address: string) => address.includes('/rest/v1/');

function tokenOf(init: RequestInit | undefined): string | null {
  const authorization = new Headers(init?.headers).get('Authorization');
  return authorization?.replace(/^Bearer /, '') ?? null;
}

function withToken(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

export function createGuardedFetch({
  anonKey,
  isSessionStored,
  isStoredRefreshToken,
  renewSession,
  fetch: send = (input, init) => fetch(input, init),
}: GuardedFetchOptions): typeof fetch {
  let renewal: Promise<string | null> | null = null;
  // The latest answer to a renewal that left the session as it was: when it
  // came, and for how long no other renewal is sent because of it. Counted
  // from when it came, so that a clock put back ends the wait rather than
  // making it longer by as much.
  let unrenewed = { status: 0, at: 0, pause: 0 };

  /** One renewal for all the requests that were refused together. */
  function renewOnce(staleToken: string): Promise<string | null> {
    renewal ??= renewSession(staleToken).finally(() => {
      renewal = null;
    });
    return renewal;
  }

  return async (input, init) => {
    const address = addressOf(input);

    if (isRenewal(address)) {
      const waited = Date.now() - unrenewed.at;
      if (waited >= 0 && waited < unrenewed.pause) {
        throw networkError(`not sent: the auth server answered ${unrenewed.status} a moment ago`);
      }
      const answer = await exchange(send, input, init);
      if (answer.response.ok) forgetSuspension();
      // Only for the session this device holds: the app also renews one it
      // has let go of, to tell the server of a sign-out, and what the server
      // says of that is no news for whoever uses the device next.
      else if (saysSuspended(answer.body) && isStoredRefreshToken(refreshTokenOf(init))) {
        noteAccountSuspended();
      }
      // The session this device holds is over for some other reason: ended on
      // another device, tidied away after 90 days unused, or by a new password
      // set elsewhere - the auth server answers each alike. The client signs
      // the device out, and the welcome screen it lands on said nothing. A
      // sign-out made on this device takes the word back (auth-context.tsx).
      else if (endsTheSession(answer.body) && isStoredRefreshToken(refreshTokenOf(init))) {
        noteSessionEnded();
      }
      // Anything but a new session, or the auth server's own word that this
      // one is over, is a renewal that has not happened yet - and one that
      // asking again at once would not make happen.
      if (!answer.response.ok && !endsTheSession(answer.body)) {
        const { status } = answer.response;
        unrenewed = { status, at: Date.now(), pause: pauseAfter(answer.response) };
        throw networkError(`failed: the auth server answered ${status}`);
      }
      return answer.response;
    }

    // The auth client's other requests pass as they are - a sign-in form must
    // see its rate limit - and so does anything else the client may send. Only
    // a request to the database is ever repeated: renewing from inside one of
    // the auth client's own requests would never end.
    if (!isDatabase(address)) return (await exchange(send, input, init)).response;

    const token = tokenOf(init);
    if (token === null || token === anonKey) {
      // The client has no token to give, although this device is signed in:
      // a renewal has just failed. Sent like this, the request would be
      // refused as a stranger's.
      if (isSessionStored()) throw networkError('not sent: the session could not be renewed');
      return (await exchange(send, input, init)).response;
    }

    const answer = await exchange(send, input, init);
    if (!refusesTheToken(answer)) return answer.response;

    const renewed = await renewOnce(token);
    if (renewed === null || renewed === token) return answer.response;
    return (await exchange(send, input, withToken(init, renewed))).response;
  };
}
