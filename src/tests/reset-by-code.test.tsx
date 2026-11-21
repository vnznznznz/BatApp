import { AuthApiError, type Session } from '@supabase/supabase-js';
import { act, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { BackHandler, Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import RootLayout from '@/app/_layout';
import ResetPasswordScreen from '@/app/reset-password';
import SignInScreen from '@/app/sign-in';

/**
 * A password reset by code, through the app's own root layout, auth context
 * and reset screen, with only the auth server's client in their place.
 *
 * The code signs the courier in; the root layout takes whoever is signed in
 * outside the app to the roost at once. Between the code and the new password
 * that would leave them signed in with a password they do not know, and the
 * screen that asks for it gone. The guard and the context are each tested on
 * their own too (root-guard.test.tsx, auth-context.test.tsx); this is the two
 * of them together, as the courier meets them.
 */

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
 * The client as far as resetting a password asks it: the code is right and
 * signs the courier in, announced as auth-js announces it; what a password
 * change is answered with, each test says.
 */
const mockServer = {
  listeners: new Set<(event: string, session: Session | null) => void>(),
  announce(event: string, session: Session | null) {
    mockServer.listeners.forEach((listener) => listener(event, session));
  },
  verify: jest.fn(),
  passwordChange: jest.fn(),
  /** The addresses a code was asked for. */
  resets: jest.fn(),
};

/** The answer to a right code: the session it brings, announced before it is answered. */
function codeRight() {
  mockServer.announce('PASSWORD_RECOVERY', SESSION);
  return { data: { session: SESSION, user: SESSION.user }, error: null };
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
        mockServer.listeners.add(listener);
        return {
          data: { subscription: { unsubscribe: () => mockServer.listeners.delete(listener) } },
        };
      },
      resetPasswordForEmail: async (email: string) => {
        mockServer.resets(email);
        return { data: {}, error: null };
      },
      verifyOtp: (attributes: unknown) => mockServer.verify(attributes),
      updateUser: async (attributes: unknown) => {
        const answer = await mockServer.passwordChange(attributes);
        if (!answer.error) mockServer.announce('USER_UPDATED', SESSION);
        return answer;
      },
    },
  },
}));

// Nobody is signed in when the app opens.
jest.mock('@/lib/session-store', () => ({
  readStoredSession: () => Promise.resolve(null),
  isSessionStored: () => false,
  clearStoredSession: () => Promise.resolve(),
}));

/** The app's routes, as far as a reset reaches: its screen, and where it leads. */
const routes = {
  _layout: RootLayout,
  index: () => <Text>Night Courier</Text>,
  'sign-in': () => <Text>Welcome back</Text>,
  'reset-password': ResetPasswordScreen,
  '(app)/home': () => <Text>Your roost</Text>,
};

/**
 * Fixed insets. The layout's own provider draws nothing until a device reports
 * the insets, which none does here; it takes them from this one instead.
 */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const withInsets = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
);

const SAME = new AuthApiError(
  'New password should be different from the old password.',
  422,
  'same_password',
);

/** A code used up already, or replaced by a newer one: GoTrue's one answer for both. */
const USED_UP = new AuthApiError('Token has expired or is invalid', 403, 'otp_expired');

beforeEach(() => {
  mockServer.listeners.clear();
  mockServer.verify.mockReset().mockImplementation(async () => codeRight());
  mockServer.passwordChange.mockReset();
  mockServer.resets.mockReset();
});

describe('a password reset by code', () => {
  it('keeps the courier on the reset screen until the new password is saved, then goes to the roost', async () => {
    mockServer.passwordChange
      .mockResolvedValueOnce({ data: { user: null }, error: SAME })
      .mockResolvedValue({ data: { user: SESSION.user }, error: null });
    const app = renderRouter(routes, { initialUrl: '/reset-password', wrapper: withInsets });
    await app;
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.press(screen.getByRole('button', { name: 'Send the code' }));
    await user.type(screen.getByLabelText('Code'), '87654321');
    await user.type(screen.getByLabelText('New password'), 'the old password');
    await user.press(screen.getByRole('button', { name: 'Set the new password' }));

    // Signed in by the code, and still here, told what happened.
    expect(app.getPathname()).toBe('/reset-password');
    expect(
      screen.getByText(
        'The code was right, and you are signed in, but the new password was not saved. ' +
          'Try again, or sign out.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('The new password has to differ from the old one.')).toBeOnTheScreen();

    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'a brand new password');
    await user.press(screen.getByRole('button', { name: 'Save the new password' }));

    expect(mockServer.passwordChange).toHaveBeenLastCalledWith({
      password: 'a brand new password',
    });
    expect(app.getPathname()).toBe('/home');
    expect(screen.getByText('Your roost')).toBeOnTheScreen();
  });

  /**
   * The keyboard stays up while the code is being checked, and its "go" key is
   * not held back by the button's spinner. A second check of the same code is
   * refused - the first has used it up - and that refusal let go of the way in
   * while the first was still bringing its session: the courier was taken to
   * the roost before the new password was saved, and why it was not saved
   * went to a screen that was gone. (Found in review.)
   */
  it('checks the code once however often the form is sent, and keeps the courier until the password is saved', async () => {
    let answer: () => void = () => {};
    mockServer.verify
      .mockImplementationOnce(() => new Promise((resolve) => (answer = () => resolve(codeRight()))))
      .mockResolvedValue({ data: { session: null, user: null }, error: USED_UP });
    mockServer.passwordChange.mockResolvedValue({ data: { user: null }, error: SAME });
    const app = renderRouter(routes, { initialUrl: '/reset-password', wrapper: withInsets });
    await app;
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.press(screen.getByRole('button', { name: 'Send the code' }));
    await user.type(screen.getByLabelText('Code'), '87654321');
    await user.type(screen.getByLabelText('New password'), 'the old password');

    await user.press(screen.getByRole('button', { name: 'Set the new password' }));
    // The keyboard's own key, while the code is out.
    await user.type(screen.getByLabelText('New password'), '', {
      skipPress: true,
      submitEditing: true,
    });
    await act(async () => answer());

    expect(app.getPathname()).toBe('/reset-password');
    expect(screen.getByText('The new password has to differ from the old one.')).toBeOnTheScreen();
    expect(mockServer.verify).toHaveBeenCalledTimes(1);
  });

  /**
   * Android's back button, through the navigator's own listener and the
   * screen's. Gone back from the screen that says the password is not saved,
   * the courier was in the roost, signed in with a password they did not
   * know. (Found in review.)
   */
  it('keeps the courier on the reset screen when Android’s back button is pressed before the password is saved', async () => {
    let backListeners: Parameters<typeof BackHandler.addEventListener>[1][] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, listener) => {
      backListeners.push(listener);
      return {
        remove: () => {
          backListeners = backListeners.filter((other) => other !== listener);
        },
      };
    });
    // Newest first, until one has handled the press, as on a phone.
    const pressBack = () =>
      act(() =>
        [...backListeners]
          .reverse()
          .some((listener) => listener({ type: 'hardwareBackPress', timeStamp: 0 }) === true),
      );
    mockServer.passwordChange.mockResolvedValue({ data: { user: null }, error: SAME });
    const app = renderRouter(routes, { initialUrl: '/sign-in', wrapper: withInsets });
    await app;
    await act(() => router.push('/reset-password'));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.press(screen.getByRole('button', { name: 'Send the code' }));
    await user.type(screen.getByLabelText('Code'), '87654321');
    await user.type(screen.getByLabelText('New password'), 'the old password');
    await user.press(screen.getByRole('button', { name: 'Set the new password' }));

    await pressBack();

    expect(app.getPathname()).toBe('/reset-password');
    expect(screen.getByText('The new password has to differ from the old one.')).toBeOnTheScreen();
    jest.restoreAllMocks();
  });

  /**
   * Left some other way without a new password - a browser's back button -
   * the courier was signed in all the same, and taken into the app, the
   * password unknown. (Found in review: the root layout held the way in on
   * this screen only.) They are taken back to it, and asked for the password.
   */
  it('takes a courier who goes back from the reset screen back to it, and asks for the password', async () => {
    mockServer.passwordChange
      .mockResolvedValueOnce({ data: { user: null }, error: SAME })
      .mockResolvedValue({ data: { user: SESSION.user }, error: null });
    const app = renderRouter(routes, { initialUrl: '/sign-in', wrapper: withInsets });
    await app;
    await act(() => router.push('/reset-password'));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.press(screen.getByRole('button', { name: 'Send the code' }));
    await user.type(screen.getByLabelText('Code'), '87654321');
    await user.type(screen.getByLabelText('New password'), 'the old password');
    await user.press(screen.getByRole('button', { name: 'Set the new password' }));
    expect(app.getPathname()).toBe('/reset-password');

    await act(() => router.back());

    expect(app.getPathname()).toBe('/reset-password');
    expect(screen.queryByText('Your roost')).toBeNull();
    expect(screen.getByText('Your new password')).toBeOnTheScreen();

    await user.type(screen.getByLabelText('New password'), 'a brand new password');
    await user.press(screen.getByRole('button', { name: 'Save the new password' }));

    expect(mockServer.passwordChange).toHaveBeenLastCalledWith({
      password: 'a brand new password',
    });
    expect(app.getPathname()).toBe('/home');
  });

  /**
   * From the sign-in form, through the router as the app has it: the address
   * typed there reaches the reset as it was typed - a plus sign too, which a
   * query string can turn into a space - and the code goes to it.
   */
  it('starts the reset with the address typed to sign in', async () => {
    const app = renderRouter(
      { ...routes, 'sign-in': SignInScreen },
      { initialUrl: '/sign-in', wrapper: withInsets },
    );
    await app;
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.type(screen.getByLabelText('Email'), 'anna+bats@example.com');

    await user.press(screen.getByRole('button', { name: 'I forgot my password' }));
    expect(app.getPathname()).toBe('/reset-password');
    await user.press(screen.getByRole('button', { name: 'Send the code' }));

    expect(mockServer.resets).toHaveBeenCalledWith('anna+bats@example.com');
    expect(
      screen.getByText(/^If there is an account for anna\+bats@example\.com, a code/),
    ).toBeOnTheScreen();
  });

  /** "Use another address" led off the screen while the code was checked. (Found in review.) */
  it('offers no way off the reset screen while the code is checked', async () => {
    let answer: () => void = () => {};
    mockServer.verify.mockImplementationOnce(
      () => new Promise((resolve) => (answer = () => resolve(codeRight()))),
    );
    mockServer.passwordChange.mockResolvedValue({ data: { user: null }, error: SAME });
    const app = renderRouter(routes, { initialUrl: '/reset-password', wrapper: withInsets });
    await app;
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.press(screen.getByRole('button', { name: 'Send the code' }));
    await user.type(screen.getByLabelText('Code'), '87654321');
    await user.type(screen.getByLabelText('New password'), 'the old password');
    await user.press(screen.getByRole('button', { name: 'Set the new password' }));

    await user.press(screen.getByRole('button', { name: 'Use another address' }));
    await act(async () => answer());

    expect(app.getPathname()).toBe('/reset-password');
    expect(screen.getByText('The new password has to differ from the old one.')).toBeOnTheScreen();
  });
});
