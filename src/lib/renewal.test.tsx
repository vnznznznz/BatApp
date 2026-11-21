import type { Session } from '@supabase/supabase-js';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import * as ReactNative from 'react-native';

import type { AuthContextValue } from '@/features/auth/auth-context';
import { secureStorage } from '@/lib/secure-storage';
import { SESSION_KEY } from '@/lib/session-store';

/**
 * A screen's load over the client as the app builds it - the real supabase-js,
 * the real storage, the app's own fetch - with only the keychain and the
 * network replaced: what "Try again" does once the network is back after a
 * start without one, an hour after the app was last used.
 *
 * auth-js remembers a renewal that failed, for a minute, and answers every
 * request from that memory without sending it. Pressing "Try again" in that
 * minute sent nothing, and the screen went on saying "No connection" for one
 * to two minutes after the network came back. (Found in the browser.) The
 * memory is not part of auth-js's public face, which is why this test runs on
 * the real client: if a new version names it differently, this fails.
 */

// The first render compiles React Native's components on a cold cache.
jest.setTimeout(20_000);

const mockKeychain = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockKeychain.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

// There is no navigator here: being mounted stands in for being in front. The
// React this file renders with, as the modules are loaded anew in each test.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => mockReact.useEffect(effect, [effect]),
}));
const mockReact = React;

const OLD_TOKEN = `header.${'a'.repeat(100)}.signature`;
const NEW_TOKEN = `header.${'b'.repeat(100)}.signature`;

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
      user_metadata: { username: 'mara', display_name: 'Mara' },
      created_at: '2026-11-01T10:00:00Z',
    },
  };
}

type Sent = { url: string; bearer: string | null; at: number };

/** Every request that reached the network, and what the network makes of the next one. */
let sent: Sent[];
let network: (request: Sent) => Response | Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const offline = () => Promise.reject(new TypeError('Network request failed'));

const isRenewal = (request: Sent) =>
  request.url.includes('/auth/v1/token?grant_type=refresh_token');

/** The network as it is once it is back: a new session, and the bats. */
const online = (request: Sent) =>
  isRenewal(request) ? json(200, sessionOf(NEW_TOKEN, 'refresh-new', 3600)) : json(200, [1, 2, 3]);

const NO_CONNECTION = 'No connection. Check your network and try again.';

type Client = (typeof import('@/lib/supabase'))['supabase'];
let client: Client | null = null;

/**
 * Opens a screen that loads the roost, on a client loaded anew as at a launch:
 * the client keeps what it knows in its module. `count` is how many such loads
 * the screen has, each kept as it is by a hook of its own.
 */
async function open(count = 1) {
  jest.resetModules();
  jest.doMock('react', () => React);
  jest.doMock('react-native', () => ReactNative);
  const db = jest.requireActual<typeof import('@/lib/supabase')>('@/lib/supabase').supabase;
  client = db;
  const { useRemote } = jest.requireActual<typeof import('@/lib/use-remote')>('@/lib/use-remote');
  const { toRpcError } = jest.requireActual<typeof import('@/lib/rpc-error')>('@/lib/rpc-error');
  const context = jest.requireActual<typeof import('@/features/auth/auth-context')>(
    '@/features/auth/auth-context',
  );

  async function loadRoost() {
    const { data, error } = await db.rpc('get_roost');
    if (error) throw toRpcError(error, 'Your roost could not be loaded.');
    return data as unknown[];
  }

  function Roost({ id }: { id: number }) {
    const roost = useRemote(loadRoost);
    return (
      <>
        <ReactNative.Text testID={`roost-${id}`}>
          {roost.data ? `${roost.data.length} bats` : (roost.error ?? 'loading')}
        </ReactNative.Text>
        <ReactNative.Pressable accessibilityRole="button" onPress={() => void roost.refresh()}>
          <ReactNative.Text>Try again {id}</ReactNative.Text>
        </ReactNative.Pressable>
      </>
    );
  }

  function Probe() {
    auth = context.useAuth();
    return null;
  }

  function Screens({ shown }: { shown: number }) {
    return (
      <context.AuthProvider>
        <Probe />
        {Array.from({ length: shown }, (_, id) => (
          <Roost key={id} id={id} />
        ))}
      </context.AuthProvider>
    );
  }

  const view = await render(<Screens shown={count} />);
  openAnother = () => view.rerender(<Screens shown={++count} />);
}

/** Opens one more screen that loads the roost, as going on to another screen does. */
let openAnother: () => Promise<void>;
/** What the screens are given of the session, as of the latest render. */
let auth: AuthContextValue;

const shown = (id = 0) => screen.getByTestId(`roost-${id}`).props.children as string;

/** Lets time pass, with everything that is due in it. */
const passes = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  // The client warns of every renewal it could not make.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockKeychain.clear();
  sent = [];
  network = online;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request: Sent = {
      url: String(input),
      bearer: new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '') ?? null,
      at: Date.now(),
    };
    sent.push(request);
    return network(request);
  });
  // Signed in an hour and a minute ago, the last time the app was used.
  await secureStorage.setItem(
    SESSION_KEY,
    JSON.stringify(sessionOf(OLD_TOKEN, 'refresh-old', -60)),
  );
});

afterEach(async () => {
  await client?.auth.stopAutoRefresh();
  client = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a load asked for after the network has come back', () => {
  it('renews the session and loads at once when Try again is pressed', async () => {
    network = offline;
    await open();
    // The client has given up on the renewal by then, and remembers it.
    await passes(40_000);
    expect(shown()).toBe(NO_CONNECTION);

    network = online;
    const back = Date.now();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again 0' }));
    await passes(1000);

    expect(sent.filter((request) => request.at >= back && isRenewal(request))).toHaveLength(1);
    expect(shown()).toBe('3 bats');
    // In the name of the session it renewed, not in nobody's.
    expect(sent.at(-1)?.bearer).toBe(NEW_TOKEN);
  });

  /**
   * Whoever renews the session first, the other loads waiting to be made again
   * are made at once, rather than after their own pause - up to a minute.
   */
  it('loads everything else that got no answer as soon as the session is renewed', async () => {
    network = offline;
    await open(2);
    await passes(40_000);
    expect([shown(0), shown(1)]).toEqual([NO_CONNECTION, NO_CONNECTION]);

    network = online;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again 0' }));
    await passes(1000);

    expect([shown(0), shown(1)]).toEqual(['3 bats', '3 bats']);
  });

  /**
   * Coming into view asks for a load as well, and so does the app's return to
   * the front - but nobody pressed anything. Renewing for those started half a
   * minute of attempts without a network each time a screen was opened, with
   * the screen, every other request and "Sign out" waiting behind them. (Found
   * in review: 25 s for each, where the memory answered at once.)
   */
  it('sends no renewal for a screen opened within the minute, and says at once what is wrong', async () => {
    network = offline;
    await open();
    await passes(40_000);
    const renewals = sent.filter(isRenewal).length;

    await openAnother();
    await passes(1000);

    expect(shown(1)).toBe(NO_CONNECTION);
    expect(sent.filter(isRenewal)).toHaveLength(renewals);
  });

  /**
   * Sign out shares a renewal under way. With none started by opening a
   * screen, it is through at once, as before. (Found in review: 24 s after
   * the profile was opened without a network.)
   */
  it('lets Sign out through at once after a screen was opened offline', async () => {
    network = offline;
    await open();
    await passes(40_000);
    await openAnother();
    await passes(1000);

    const started = Date.now();
    let done = false;
    await act(async () => {
      void auth.signOut().then(() => {
        done = true;
      });
    });
    for (let tenths = 0; tenths < 100 && !done; tenths++) await passes(100);

    expect(done).toBe(true);
    expect(Date.now() - started).toBeLessThanOrEqual(1000);
  });

  /**
   * A load the app makes again by itself keeps to the client's memory: asking
   * the auth server again at every pause is what that memory is there to
   * prevent.
   */
  it('sends no renewal for a load the screen makes again by itself, within the minute', async () => {
    network = offline;
    await open();
    await passes(30_000);
    const renewals = sent.filter(isRenewal).length;

    // The screen's own next attempts, after 8 and 16 seconds, find the memory.
    await passes(25_000);

    expect(sent.filter(isRenewal)).toHaveLength(renewals);
    expect(shown()).toBe(NO_CONNECTION);
  });
});
