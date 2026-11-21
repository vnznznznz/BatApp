import { AuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import RootLayout from '@/app/_layout';
import SignUpScreen from '@/app/sign-up';

/**
 * Confirming a new account by code, through the app's own root layout, auth
 * context and sign-up screen, with only the auth server's client and the
 * keychain in their place.
 *
 * The code signs the courier in, and the account it confirmed may have been
 * set up by whoever signed up for the address first, with a password and a
 * username of theirs: until the app has made it the courier's, the way in is
 * held on the screen that asked for the code. Review found two ways past it:
 * leaving that screen while the code was checked, and closing the app before
 * the account was set up.
 */

jest.setTimeout(20_000);

// The gesture handler's root view installs a native module, and nothing here
// makes a gesture.
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

const SESSION = {
  access_token: 'token',
  refresh_token: 'refresh',
  token_type: 'bearer',
  expires_in: 3600,
  user: { id: 'user-anna', email: 'anna@example.com' },
} as unknown as Session;

/**
 * The client as far as confirming a sign-up asks it. The code is right and
 * signs the courier in, announced as auth-js announces it; the account is the
 * courier's as typed; what the password is answered with, each test says.
 */
const mockServer = {
  listeners: new Set<(event: string, session: Session | null) => void>(),
  announce(event: string, session: Session | null) {
    mockServer.listeners.forEach((listener) => listener(event, session));
  },
  verify: jest.fn(),
  passwordChange: jest.fn(),
  /** Who is signed in, as far as the client knows. */
  session: null as Session | null,
};

function codeRight() {
  mockServer.session = SESSION;
  mockServer.announce('SIGNED_IN', SESSION);
  return { data: { session: SESSION, user: SESSION.user }, error: null };
}

/** What is kept in the keychain, by name. */
const mockKeychain = new Map<string, string>();

jest.mock('@/lib/supabase', () => {
  const profile = {
    select: () => profile,
    eq: () => profile,
    maybeSingle: async () => ({
      data: { username: 'annaweber', display_name: 'Anna Weber' },
      error: null,
    }),
  };
  return {
    supabase: {
      auth: {
        onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
          mockServer.listeners.add(listener);
          return {
            data: { subscription: { unsubscribe: () => mockServer.listeners.delete(listener) } },
          };
        },
        signUp: async () => ({ data: { user: { id: 'user-anna' }, session: null }, error: null }),
        verifyOtp: (attributes: unknown) => mockServer.verify(attributes),
        updateUser: async (attributes: unknown) => {
          const answer = await mockServer.passwordChange(attributes);
          if (!answer.error) mockServer.announce('USER_UPDATED', SESSION);
          return answer;
        },
        getSession: async () => ({ data: { session: mockServer.session }, error: null }),
      },
      from: () => profile,
    },
  };
});

/** The session the keychain holds as the app opens. */
const mockStored: { session: Session | null } = { session: null };

jest.mock('@/lib/session-store', () => ({
  readStoredSession: () => Promise.resolve(mockStored.session),
  isSessionStored: () => mockStored.session !== null,
  clearStoredSession: () => Promise.resolve(),
  authStorage: {
    getItem: async (key: string) => mockKeychain.get(key) ?? null,
    setItem: async (key: string, value: string) => void mockKeychain.set(key, value),
    removeItem: async (key: string) => void mockKeychain.delete(key),
  },
}));

const routes = {
  _layout: RootLayout,
  index: () => <Text>Night Courier</Text>,
  'sign-in': () => <Text>Welcome back</Text>,
  'sign-up': SignUpScreen,
  rules: () => <Text>House rules</Text>,
  '(app)/home': () => <Text>Your roost</Text>,
};

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const withInsets = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
);

const NO_CONNECTION = new AuthRetryableFetchError('Network request failed', 0);

beforeEach(() => {
  mockServer.listeners.clear();
  mockServer.session = null;
  mockServer.verify.mockReset().mockImplementation(async () => codeRight());
  mockServer.passwordChange.mockReset();
  mockStored.session = null;
  mockKeychain.clear();
});

async function signedUp(user: ReturnType<typeof userEvent.setup>) {
  await fireEvent.changeText(screen.getByLabelText('Your name'), 'Anna Weber');
  await fireEvent.changeText(screen.getByLabelText('Username'), 'annaweber');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'anna@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'a-good-password');
  await fireEvent(screen.getByRole('switch'), 'valueChange', true);
  await user.press(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByText('Check your email')).toBeOnTheScreen();
}

describe('a sign-up confirmed by code', () => {
  /**
   * The Confirm button spun; "Sign in instead" beside it did not, and led to
   * the sign-in form while the code was checked. The code then signed the
   * courier in there, and with the account not set up - the network gone as
   * its password was saved - the root layout took them into the app: in the
   * stranger's case, the stranger's account, with the stranger's password.
   * (Found in review.)
   */
  it('keeps the courier off the roost when they leave the screen while the code is checked', async () => {
    let answer: () => void = () => {};
    mockServer.verify.mockImplementation(
      () => new Promise((resolve) => (answer = () => resolve(codeRight()))),
    );
    mockServer.passwordChange.mockResolvedValue({ data: { user: null }, error: NO_CONNECTION });
    const app = renderRouter(routes, { initialUrl: '/sign-up', wrapper: withInsets });
    await app;
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await signedUp(user);
    await user.type(screen.getByLabelText('Code'), '12345678');
    await user.press(screen.getByRole('button', { name: 'Confirm' }));

    expect(screen.getByRole('button', { name: 'Sign in instead' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Sign in instead' }));
    expect(app.getPathname()).toBe('/sign-up');

    // Off the screen all the same, as a browser's back button takes the courier.
    await act(() => router.replace('/sign-in'));
    await act(async () => answer());

    expect(screen.queryByText('Your roost')).toBeNull();
    expect(app.getPathname()).toBe('/sign-up');
    expect(screen.getByText('Almost there')).toBeOnTheScreen();
  });

  /**
   * The code had signed the courier in, and the app was closed before the
   * account was set up: it opened in the roost, the account as an earlier
   * sign-up had left it. (Found in review.) It opens on the sign-up screen,
   * which asks for a password and finishes the account as it was typed.
   */
  it('takes the account up again where it was left when the app opens', async () => {
    mockStored.session = SESSION;
    mockServer.session = SESSION;
    mockKeychain.set(
      'night-courier.unfinished',
      JSON.stringify({
        flow: 'sign-up',
        email: 'anna@example.com',
        username: 'annaweber',
        displayName: 'Anna Weber',
      }),
    );
    mockServer.passwordChange.mockResolvedValue({ data: { user: SESSION.user }, error: null });
    const app = renderRouter(routes, { initialUrl: '/', wrapper: withInsets });
    await app;
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    expect(app.getPathname()).toBe('/sign-up');
    expect(screen.queryByText('Your roost')).toBeNull();
    expect(screen.getByText('Almost there')).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Password'), 'a-good-password');
    await user.press(screen.getByRole('button', { name: 'Finish' }));

    expect(mockServer.passwordChange).toHaveBeenCalledWith({ password: 'a-good-password' });
    expect(app.getPathname()).toBe('/home');
    expect(mockKeychain.has('night-courier.unfinished')).toBe(false);
  });
});
