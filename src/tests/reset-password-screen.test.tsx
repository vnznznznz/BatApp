import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  DeviceEventEmitter,
  Platform,
  StyleSheet,
  TextInput,
  type ViewProps,
} from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import ResetPasswordScreen from '@/app/reset-password';
import { announce } from '@/lib/announce';
import { openLink } from '@/lib/links';

const mockSendPasswordReset = jest.fn();
const mockVerifyResetCode = jest.fn();
const mockSetNewPassword = jest.fn();
const mockSignOut = jest.fn();
const mockRemoveUnfinishedAccount = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

/**
 * Every set of options the screen has given itself through <Stack.Screen>, in
 * order. Recorded rather than applied: there is no navigator here.
 */
const mockScreenOptions = jest.fn<void, [{ gestureEnabled?: boolean }]>();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace }),
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
    Stack: {
      Screen: ({ options }: { options: { gestureEnabled?: boolean } }) => {
        mockScreenOptions(options);
        return null;
      },
    },
  };
});

/**
 * What the auth context says of the session, as the app's does: a change is
 * drawn at once by whoever reads it. The calls change it as the real ones
 * would - the code signs the courier in and holds the way in, the password
 * saved lets go of it, signing out ends both.
 */
type MockAuthState = {
  session: object | null;
  isSettingPassword: boolean;
  /** What the code that holds the way in is for, once it has signed the courier in. */
  unfinished: object | null;
};

const mockAuthState = {
  current: { session: null, isSettingPassword: false, unfinished: null } as MockAuthState,
  listeners: new Set<() => void>(),
  set(next: Partial<MockAuthState>) {
    this.current = { ...this.current, ...next };
    this.listeners.forEach((listener) => listener());
  },
};

jest.mock('@/features/auth/auth-context', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    ...jest.requireActual<object>('@/features/auth/auth-context'),
    useAuth: () => ({
      ...useSyncExternalStore(
        (listener: () => void) => {
          mockAuthState.listeners.add(listener);
          return () => mockAuthState.listeners.delete(listener);
        },
        () => mockAuthState.current,
      ),
      sendPasswordReset: mockSendPasswordReset,
      verifyResetCode: mockVerifyResetCode,
      setNewPassword: mockSetNewPassword,
      signOut: mockSignOut,
      removeUnfinishedAccount: mockRemoveUnfinishedAccount,
    }),
  };
});

jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));
const mockedAnnounce = jest.mocked(announce);

/** The contact address, as this build is configured. Unset in the environment, it is null. */
const mockLinks: { contact: string | null } = { contact: null };

// A getter, so the screen reads it as it renders; see the sign-up test.
jest.mock('@/lib/links', () => ({
  get CONTACT_URL() {
    return mockLinks.contact;
  },
  PRIVACY_POLICY_URL: null,
  openLink: jest.fn(),
}));
const mockedOpenLink = jest.mocked(openLink);

/** Every KeyboardAvoidingView drawn, by the behaviour it was given. */
const mockKeyboardAvoidingViews: unknown[] = [];

// React Native's own, drawn as it would be; only counted on the way.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { default: Real } = jest.requireActual<{
    default: React.ComponentType<object>;
  }>('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView');
  function Counted(props: { behavior?: string }) {
    mockKeyboardAvoidingViews.push(props.behavior);
    return React.createElement(Real, props);
  }
  return { __esModule: true, default: Counted };
});

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 667 },
  insets: { top: 20, left: 0, right: 0, bottom: 0 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

const DEFAULT_OS = Platform.OS;

type HostNode = { type: unknown; props: Record<string, unknown> };

const hostsOfType = (type: string) =>
  screen.container.queryAll(
    (node) => (node as unknown as HostNode).type === type,
  ) as unknown as HostNode[];

/** The form's scroll view, and the props it was given. */
function scrollView(): Record<string, unknown> {
  const [view, ...others] = hostsOfType('RCTScrollView');
  if (!view || others.length > 0) throw new Error('Expected the form to have one scroll view.');
  return view.props;
}

/** The padding the screen's safe-area view adds below its content, beyond the insets. */
function paddingBelow(): number {
  const [view] = hostsOfType('RNCSafeAreaView');
  if (!view) throw new Error('The form is not in a screen.');
  return (
    (StyleSheet.flatten(view.props.style as never) as { paddingBottom?: number }).paddingBottom ?? 0
  );
}

const keyboard = (event: 'keyboardDidShow' | 'keyboardDidHide', height: number) =>
  act(async () => {
    DeviceEventEmitter.emit(event, {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 667 - height, width: 375, height },
    });
  });

const SESSION = { user: { id: 'user-anna' } };

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];

/** The screen's listeners for Android's back button, added and not yet removed, oldest first. */
let backListeners: BackListener[] = [];

/**
 * Presses Android's back button. As on a phone, the listeners in place are
 * asked newest first until one answers true, having handled the press; if
 * none does, the navigator goes back a screen. Resolves to whether one did.
 */
const pressBackOnAndroid = () =>
  act(() =>
    [...backListeners]
      .reverse()
      .some((listener) => listener({ type: 'hardwareBackPress', timeStamp: 0 }) === true),
  );

/** Whether the swipe back is allowed, as the screen last set it; allowed until it says. */
const swipeBack = () => mockScreenOptions.mock.calls.at(-1)?.[0].gestureEnabled ?? true;

beforeEach(() => {
  mockScreenOptions.mockClear();
  backListeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, listener) => {
    backListeners.push(listener);
    return {
      remove: () => {
        backListeners = backListeners.filter((other) => other !== listener);
      },
    };
  });
  mockAuthState.current = { session: null, isSettingPassword: false, unfinished: null };
  mockSendPasswordReset.mockReset().mockResolvedValue(undefined);
  mockVerifyResetCode.mockReset().mockImplementation(async () => {
    mockAuthState.set({ session: SESSION, isSettingPassword: true });
  });
  mockSetNewPassword.mockReset().mockImplementation(async () => {
    mockAuthState.set({ isSettingPassword: false });
  });
  mockSignOut.mockReset().mockImplementation(async () => {
    mockAuthState.set({ session: null, isSettingPassword: false });
  });
  // Removed, the account is gone and the courier signed out.
  mockRemoveUnfinishedAccount.mockReset().mockImplementation(async () => {
    mockAuthState.set({ session: null, isSettingPassword: false, unfinished: null });
  });
  mockReplace.mockReset();
  mockBack.mockReset();
  mockedAnnounce.mockReset();
  mockLinks.contact = null;
  mockedOpenLink.mockReset().mockResolvedValue(undefined);
  mockKeyboardAvoidingViews.length = 0;
});

afterEach(async () => {
  await keyboard('keyboardDidHide', 0);
  Platform.OS = DEFAULT_OS;
  jest.restoreAllMocks();
});

describe('ResetPasswordScreen', () => {
  const CODE_DID_NOT_WORK =
    'That code did not work. Check it against the newest email, or ask for a new one.';
  const SENT =
    'If there is an account for anna@example.com, a code is on its way to it. Type it in ' +
    'below, with your new password.';
  const WAIT = 'You can ask for a new code a minute after the last one.';

  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const button = (name: string) => screen.getByRole('button', { name });
  const passes = (ms: number) => act(async () => jest.advanceTimersByTime(ms));

  /** Asks for a code for the address, as typed, and lands on the screen for it. */
  async function askedForACode() {
    await renderScreen(<ResetPasswordScreen />);
    await user.type(screen.getByLabelText('Email'), ' anna@example.com ');
    await user.press(button('Send the code'));
    expect(screen.getByText(SENT)).toBeOnTheScreen();
  }

  async function typedCodeAndPassword(code = '87654321', password = 'a new password') {
    await user.type(screen.getByLabelText('Code'), code);
    await user.type(screen.getByLabelText('New password'), password);
    await user.press(button('Set the new password'));
  }

  /**
   * The form, and the button that was pressed, are replaced where they stood:
   * a screen reader would stay on nothing, and say nothing of what is asked
   * now. It is taken to the title and the words under it. (Found in review.)
   */
  describe('what a screen reader is told', () => {
    let focus: jest.SpiedFunction<typeof AccessibilityInfo.sendAccessibilityEvent>;

    /** Where a screen reader has been taken so far: the event, and the name of the view. */
    const focusedOn = () =>
      focus.mock.calls.map(([view, event]) => [
        event,
        (view as unknown as { props: ViewProps }).props.accessibilityLabel,
      ]);

    beforeEach(() => {
      focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
      // React Native's own stand-in records every call, from every test before.
      focus.mockClear();
    });

    it('is taken to the code and the new password once a code has been asked for', async () => {
      await askedForACode();

      expect(focusedOn()).toEqual([['focus', `Check your email. ${SENT}`]]);
    });

    it('is taken to the word that the new password is saved', async () => {
      await askedForACode();

      await typedCodeAndPassword();

      expect(focusedOn().at(-1)).toEqual([
        'focus',
        'Your new password is saved. Your bats are waiting.',
      ]);
    });

    /** The button pressed is still there, under another name, and a screen reader stays on it. */
    it('hears what has become of the screen, and why, when the password is not saved', async () => {
      const SAME = 'The new password has to differ from the old one.';
      mockSetNewPassword.mockRejectedValueOnce(new Error(SAME));
      await askedForACode();

      await typedCodeAndPassword();

      expect(mockedAnnounce).toHaveBeenLastCalledWith(
        'Your new password. The code was right, and you are signed in, but the new password ' +
          `was not saved. Try again, or sign out. ${SAME}`,
      );
      expect(focusedOn()).toHaveLength(1);
    });
  });

  describe('asking for a code', () => {
    it('sends a code, not a link, to the address as typed', async () => {
      await renderScreen(<ResetPasswordScreen />);
      expect(screen.getByText('We will send a code to your email address.')).toBeOnTheScreen();

      await user.type(screen.getByLabelText('Email'), ' anna@example.com ');
      await user.press(button('Send the code'));

      expect(mockSendPasswordReset).toHaveBeenCalledWith(' anna@example.com ');
      expect(screen.getByText('Check your email')).toBeOnTheScreen();
      expect(screen.getByText(SENT)).toBeOnTheScreen();
    });

    it('says why no code could be asked for, and stays on the address', async () => {
      const TOO_MANY = 'Too many attempts. Wait a minute and try again.';
      mockSendPasswordReset.mockRejectedValue(new Error(TOO_MANY));
      await renderScreen(<ResetPasswordScreen />);

      await user.type(screen.getByLabelText('Email'), 'anna@example.com');
      await user.press(button('Send the code'));

      expect(screen.getByText(TOO_MANY)).toBeOnTheScreen();
      expect(mockedAnnounce).toHaveBeenCalledWith(TOO_MANY);
      expect(screen.queryByText('Check your email')).toBeNull();
    });

    it('asks again once the answer has come', async () => {
      const NO_CONNECTION = 'No connection. Check your network and try again.';
      mockSendPasswordReset.mockRejectedValueOnce(new Error(NO_CONNECTION));
      await renderScreen(<ResetPasswordScreen />);
      await user.type(screen.getByLabelText('Email'), 'anna@example.com');
      await user.press(button('Send the code'));

      await user.press(button('Send the code'));

      expect(mockSendPasswordReset).toHaveBeenCalledTimes(2);
      expect(screen.getByText(SENT)).toBeOnTheScreen();
    });

    /** The keyboard's "go" key is not held back by the button's spinner. */
    it('asks for one code, however often the form is sent while it is being asked for', async () => {
      mockSendPasswordReset.mockReturnValue(new Promise(() => {}));
      await renderScreen(<ResetPasswordScreen />);
      await user.type(screen.getByLabelText('Email'), 'anna@example.com');

      await user.press(button('Send the code'));
      await user.type(screen.getByLabelText('Email'), '', { skipPress: true, submitEditing: true });

      expect(mockSendPasswordReset).toHaveBeenCalledTimes(1);
    });

    it('asks nothing for an address that cannot be one', async () => {
      await renderScreen(<ResetPasswordScreen />);

      await user.type(screen.getByLabelText('Email'), 'anna');
      await user.press(button('Send the code'));

      expect(mockSendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('the code and the new password', () => {
    it('asks for the code with the number pad, and for the new password as a new one', async () => {
      await askedForACode();

      expect(screen.getByLabelText('Code')).toHaveProp('keyboardType', 'number-pad');
      expect(screen.getByLabelText('Code')).toHaveProp('textContentType', 'oneTimeCode');
      expect(screen.getByLabelText('New password')).toHaveProp('secureTextEntry', true);
      expect(screen.getByLabelText('New password')).toHaveProp('textContentType', 'newPassword');
    });

    /** The code signs in, the password is saved with that session, and the root layout does the rest. */
    it('checks the code, then saves the new password', async () => {
      await askedForACode();

      await typedCodeAndPassword();

      expect(mockVerifyResetCode).toHaveBeenCalledWith('anna@example.com', '87654321');
      expect(mockSetNewPassword).toHaveBeenCalledWith('a new password');
      expect(mockVerifyResetCode.mock.invocationCallOrder[0]).toBeLessThan(
        mockSetNewPassword.mock.invocationCallOrder[0] ?? 0,
      );
      // The root layout takes the courier on; until the screen is gone it
      // says what happened, not what it asked before.
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.getByText('Your new password is saved')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Code')).toBeNull();
    });

    /**
     * The keyboard stays up while the code is being checked, and its "go" key
     * is not held back by the button's spinner. Sent twice, the second check
     * of the code was refused - the first had used it up - and let go of the
     * way into the app before the new password was saved. (Found in review.)
     */
    it('checks the code once, however often the form is sent while it is being checked', async () => {
      mockVerifyResetCode.mockReturnValue(new Promise(() => {}));
      await askedForACode();
      await user.type(screen.getByLabelText('Code'), '87654321');
      await user.type(screen.getByLabelText('New password'), 'a new password');

      await user.press(button('Set the new password'));
      await user.type(screen.getByLabelText('New password'), '', {
        skipPress: true,
        submitEditing: true,
      });
      await user.press(button('Set the new password'));

      expect(mockVerifyResetCode).toHaveBeenCalledTimes(1);
      expect(mockSetNewPassword).not.toHaveBeenCalled();
    });

    it('sends nothing until the code is whole and the password one the server takes', async () => {
      await askedForACode();

      await typedCodeAndPassword('1234', 'short');

      expect(mockVerifyResetCode).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Code')).toHaveProp(
        'accessibilityHint',
        'The code has 8 digits.',
      );
      expect(screen.getByLabelText('New password')).toHaveProp(
        'accessibilityHint',
        'Passwords need at least 8 characters.',
      );
    });

    it('says at the code when it did not work, and asks for no password', async () => {
      mockVerifyResetCode.mockRejectedValue(new Error(CODE_DID_NOT_WORK));
      await askedForACode();

      await typedCodeAndPassword();

      expect(screen.getByLabelText('Code')).toHaveProp('accessibilityHint', CODE_DID_NOT_WORK);
      expect(mockSetNewPassword).not.toHaveBeenCalled();
    });

    it('says other failures of the code aloud, under the form', async () => {
      const NO_CONNECTION = 'No connection. Check your network and try again.';
      mockVerifyResetCode.mockRejectedValue(new Error(NO_CONNECTION));
      await askedForACode();

      await typedCodeAndPassword();

      expect(screen.getByText(NO_CONNECTION)).toBeOnTheScreen();
      expect(mockedAnnounce).toHaveBeenCalledWith(NO_CONNECTION);
      expect(mockSetNewPassword).not.toHaveBeenCalled();
    });

    /**
     * The way in is held from before the code goes to be checked, but nothing
     * has gone wrong until the password is refused: while the code is checked,
     * and while the password is saved with the session it brought, the screen
     * is still the one with the code, its button busy. It said "the new
     * password was not saved", with a live Sign out, for that moment of every
     * reset that worked. (Found in review.)
     */
    it('says nothing has gone wrong while the code is checked and the password saved', async () => {
      let answer: () => void = () => {};
      let refuse: (error: Error) => void = () => {};
      mockVerifyResetCode.mockImplementation(async () => {
        mockAuthState.set({ isSettingPassword: true });
        await new Promise<void>((resolve) => (answer = resolve));
        mockAuthState.set({ session: SESSION });
      });
      mockSetNewPassword.mockImplementation(
        () => new Promise((_, reject: (error: Error) => void) => (refuse = reject)),
      );
      await askedForACode();

      await typedCodeAndPassword();
      expect(screen.getByText('Check your email')).toBeOnTheScreen();
      expect(screen.getByLabelText('Code')).toBeOnTheScreen();

      // The code was right: signed in, and the password on its way.
      await act(async () => answer());
      expect(mockSetNewPassword).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Check your email')).toBeOnTheScreen();
      expect(screen.queryByText(/not saved/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
      expect(button('Set the new password')).toBeDisabled();

      await act(async () => refuse(new Error('The new password has to differ from the old one.')));
      expect(screen.getByText('Your new password')).toBeOnTheScreen();
      expect(screen.getByText(/the new password was not saved/)).toBeOnTheScreen();
      expect(button('Sign out')).toBeEnabled();
    });

    /** Only a code makes these words true; signed in some other way, nobody is told them. */
    it('asks for the code of a courier signed in some other way', async () => {
      mockAuthState.current = { session: SESSION, isSettingPassword: false, unfinished: null };

      await askedForACode();

      expect(screen.getByLabelText('Code')).toBeOnTheScreen();
      expect(screen.queryByText('Your new password')).toBeNull();
    });

    /**
     * The code is used up, and the courier is signed in with it - but without
     * the password they chose. They are told so, and can try another password
     * without a code, or sign out.
     */
    describe('when the password is not saved after the code', () => {
      const SAME = 'The new password has to differ from the old one.';
      const NOT_SAVED =
        'The code was right, and you are signed in, but the new password was not saved. ' +
        'Try again, or sign out.';

      beforeEach(() => {
        mockSetNewPassword.mockRejectedValueOnce(new Error(SAME));
      });

      it('says so, and why, and asks for the password alone', async () => {
        await askedForACode();

        await typedCodeAndPassword();

        expect(screen.getByText(NOT_SAVED)).toBeOnTheScreen();
        expect(screen.getByText(SAME)).toBeOnTheScreen();
        expect(mockedAnnounce).toHaveBeenCalledWith(`Your new password. ${NOT_SAVED} ${SAME}`);
        expect(screen.queryByLabelText('Code')).toBeNull();
        expect(screen.getByLabelText('New password').props.value).toBe('a new password');
      });

      it('saves the password once, however often the form is sent while it is being saved', async () => {
        await askedForACode();
        await typedCodeAndPassword();
        mockSetNewPassword.mockReturnValue(new Promise(() => {}));

        await user.press(button('Save the new password'));
        await user.type(screen.getByLabelText('New password'), '', {
          skipPress: true,
          submitEditing: true,
        });

        expect(mockSetNewPassword).toHaveBeenCalledTimes(2);
      });

      /** Signed out some other way - the session over - the code is all there is to go on. */
      it('asks for a code again once the code’s sign-in has ended', async () => {
        await askedForACode();
        await typedCodeAndPassword();
        expect(screen.getByText(NOT_SAVED)).toBeOnTheScreen();

        await act(async () => mockAuthState.set({ session: null, isSettingPassword: false }));

        expect(screen.queryByText(NOT_SAVED)).toBeNull();
        expect(screen.getByLabelText('Code')).toBeOnTheScreen();
        expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
      });

      it('saves another password, with no code asked for again', async () => {
        await askedForACode();
        await typedCodeAndPassword();

        await user.clear(screen.getByLabelText('New password'));
        await user.type(screen.getByLabelText('New password'), 'another password');
        await user.press(button('Save the new password'));

        expect(mockSetNewPassword).toHaveBeenLastCalledWith('another password');
        expect(mockVerifyResetCode).toHaveBeenCalledTimes(1);
      });

      it('signs out instead, and goes to sign in', async () => {
        await askedForACode();
        await typedCodeAndPassword();

        await user.press(button('Sign out'));

        expect(mockSignOut).toHaveBeenCalledTimes(1);
        expect(mockReplace).toHaveBeenCalledWith('/sign-in');
      });

      it('says so when signing out does not work', async () => {
        const STUCK = 'This device could not be signed out. Try again.';
        mockSignOut.mockRejectedValue(new Error(STUCK));
        await askedForACode();
        await typedCodeAndPassword();

        await user.press(button('Sign out'));

        expect(screen.getByText(STUCK)).toBeOnTheScreen();
        expect(mockReplace).not.toHaveBeenCalled();
      });
    });
  });

  describe('a new code', () => {
    /**
     * The same wait for every address: the auth server refuses an email
     * within its minute only for an address that has an account, and the
     * app takes that answer for sent - a screen that let a new code be asked
     * for sooner would say "on its way" for a code that never went.
     */
    it('can be asked for a minute after the last one, and again a minute later', async () => {
      await askedForACode();
      expect(button('Send the code again')).toBeDisabled();
      expect(screen.getByText(WAIT)).toBeOnTheScreen();

      await passes(60_000);
      await user.press(button('Send the code again'));

      expect(mockSendPasswordReset).toHaveBeenLastCalledWith('anna@example.com');
      const resent =
        'If there is an account for anna@example.com, a new code is on its way to it. ' +
        'Only the newest code works.';
      expect(screen.getByText(resent)).toBeOnTheScreen();
      expect(mockedAnnounce).toHaveBeenCalledWith(resent);
      expect(button('Send the code again')).toBeDisabled();
    });

    it('says why a new code was not asked for', async () => {
      const TOO_MANY = 'Too many attempts. Wait a minute and try again.';
      await askedForACode();
      await passes(60_000);
      mockSendPasswordReset.mockRejectedValue(new Error(TOO_MANY));

      await user.press(button('Send the code again'));

      expect(screen.getByText(TOO_MANY)).toBeOnTheScreen();
      expect(button('Send the code again')).toBeEnabled();
    });

    /**
     * Taken for sent are also an email to an address with an account that
     * could not go out: whoever owns it needs a way to someone who can help.
     */
    it('offers the contact address, where one is configured, for when no code comes', async () => {
      mockLinks.contact = 'mailto:night-courier@example.com';
      await askedForACode();
      await passes(60_000);
      expect(
        screen.getByText('No email? Look in your spam folder, then ask for the code again.'),
      ).toBeOnTheScreen();

      await user.press(button('Contact'));

      expect(mockedOpenLink).toHaveBeenCalledWith('mailto:night-courier@example.com');
    });

    it('offers no contact while none is configured', async () => {
      await askedForACode();

      expect(screen.queryByRole('button', { name: 'Contact' })).toBeNull();
    });

    it('goes back to the address, as it was typed, for another', async () => {
      await askedForACode();

      await user.press(button('Use another address'));

      expect(screen.getByLabelText('Email').props.value).toBe(' anna@example.com ');
      expect(screen.queryByText('Check your email')).toBeNull();
    });
  });

  /**
   * The root layout holds the way into the app only while this screen is in
   * front. Gone back while the code was checked, or with the password not
   * saved after it, the courier was in the roost, signed in with a password
   * they did not know, and why it was not saved was told to a screen that
   * was gone. The screen says what to do instead: save it, or sign out.
   * (Found in review.)
   */
  describe('going back', () => {
    it('takes the swipe and Android’s back button away while the code is checked', async () => {
      mockVerifyResetCode.mockImplementation(async () => {
        mockAuthState.set({ isSettingPassword: true });
        await new Promise(() => {});
      });
      await askedForACode();
      expect(swipeBack()).toBe(true);

      await typedCodeAndPassword();

      expect(swipeBack()).toBe(false);
      expect(await pressBackOnAndroid()).toBe(true);
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('keeps them away while the password is not saved after the code', async () => {
      mockSetNewPassword.mockRejectedValueOnce(
        new Error('The new password has to differ from the old one.'),
      );
      await askedForACode();
      await typedCodeAndPassword();
      expect(screen.getByText('Your new password')).toBeOnTheScreen();

      expect(swipeBack()).toBe(false);
      expect(await pressBackOnAndroid()).toBe(true);
    });

    it('gives them back once the courier has signed out', async () => {
      mockSetNewPassword.mockRejectedValueOnce(
        new Error('The new password has to differ from the old one.'),
      );
      await askedForACode();
      await typedCodeAndPassword();

      await user.press(button('Sign out'));

      expect(swipeBack()).toBe(true);
      expect(await pressBackOnAndroid()).toBe(false);
    });

    it('leaves going back as it is while nothing is being finished', async () => {
      mockVerifyResetCode.mockRejectedValue(new Error(CODE_DID_NOT_WORK));
      await askedForACode();

      await typedCodeAndPassword();

      expect(swipeBack()).toBe(true);
      expect(await pressBackOnAndroid()).toBe(false);
    });
  });

  /**
   * "Use another address", pressed while the code was checked, left the
   * screen that holds the way in: with a refused password the courier was
   * then on the address form, signed in, with nothing said - and "Back" led
   * into the app. (Found in review.)
   */
  it('offers no way off the screen while the code is checked, or has signed the courier in', async () => {
    mockVerifyResetCode.mockImplementation(async () => {
      mockAuthState.set({ session: SESSION, isSettingPassword: true });
      await new Promise(() => {});
    });
    await askedForACode();
    await passes(60_000);
    expect(button('Use another address')).toBeEnabled();
    expect(button('Send the code again')).toBeEnabled();

    await typedCodeAndPassword();

    expect(button('Use another address')).toBeDisabled();
    expect(button('Send the code again')).toBeDisabled();
    await user.press(button('Use another address'));
    expect(screen.getByLabelText('Code')).toBeOnTheScreen();
  });

  /**
   * GoTrue confirms an address with a reset's code too. An account a sign-up
   * had left waiting for its code - perhaps a stranger's, with their password,
   * username and name - became the courier's that way, all of it kept but the
   * password. The context removes it instead (auth-context.test.tsx); the
   * screen says so, and leads to signing up. (Found in review.)
   */
  describe('an account the code confirmed that nobody had confirmed', () => {
    const NEVER_CONFIRMED =
      'The code was right, but this address had an account nobody had confirmed: one a ' +
      "sign-up for it left waiting for its code - perhaps yours, perhaps someone else's, with " +
      'a password and a username you may not have chosen.';
    const REMOVED = `${NEVER_CONFIRMED} It has been removed, with nothing in it, and the address is free: sign up with it to make it yours.`;
    const TO_REMOVE = `${NEVER_CONFIRMED} It has to be removed before the address can be yours, and that could not be done just now.`;
    const NOT_ANSWERED =
      'Your account may or may not have been deleted - no answer came back. Check again once ' +
      'you are online.';
    const LEFT = { flow: 'reset', email: 'anna@example.com', remove: true };

    it('says it has been removed, saves no password, and leads to signing up', async () => {
      mockVerifyResetCode.mockResolvedValue('removed');
      await askedForACode();

      await typedCodeAndPassword();

      expect(screen.getByText('Sign up again')).toBeOnTheScreen();
      expect(screen.getByText(REMOVED)).toBeOnTheScreen();
      expect(mockSetNewPassword).not.toHaveBeenCalled();
      await user.press(button('Sign up'));
      expect(mockReplace).toHaveBeenCalledWith('/sign-up');
    });

    it('holds the courier, and asks again, while it could not be removed', async () => {
      mockVerifyResetCode.mockImplementation(async () => {
        mockAuthState.set({ session: SESSION, isSettingPassword: true, unfinished: LEFT });
        throw new Error(NOT_ANSWERED);
      });
      await askedForACode();

      await typedCodeAndPassword();

      expect(screen.getByText('One more step')).toBeOnTheScreen();
      expect(screen.getByText(TO_REMOVE)).toBeOnTheScreen();
      expect(screen.getByText(NOT_ANSWERED)).toBeOnTheScreen();
      expect(screen.queryByLabelText('New password')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
      expect(mockSetNewPassword).not.toHaveBeenCalled();
      expect(swipeBack()).toBe(false);

      await user.press(button('Try again'));

      expect(mockRemoveUnfinishedAccount).toHaveBeenCalledTimes(1);
      expect(screen.getByText(REMOVED)).toBeOnTheScreen();
      expect(swipeBack()).toBe(true);
    });

    it('asks to remove it at once when the app opens on it', async () => {
      mockAuthState.current = { session: SESSION, isSettingPassword: true, unfinished: LEFT };

      await renderScreen(<ResetPasswordScreen />);

      expect(screen.getByText('One more step')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Email')).toBeNull();
    });
  });

  /**
   * The app closed once the code had signed the courier in, and before the
   * new password was saved: it opened in the roost, the password unknown.
   * The root layout brings the courier back here instead. (Found in review.)
   */
  it('asks for the new password alone when the app opens on a reset its code signed in for', async () => {
    mockAuthState.current = {
      session: SESSION,
      isSettingPassword: true,
      unfinished: { flow: 'reset', email: 'anna@example.com', remove: false },
    };
    await renderScreen(<ResetPasswordScreen />);

    expect(screen.getByText('Your new password')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Code')).toBeNull();

    await user.type(screen.getByLabelText('New password'), 'a new password');
    await user.press(button('Save the new password'));

    expect(mockVerifyResetCode).not.toHaveBeenCalled();
    expect(mockSetNewPassword).toHaveBeenCalledWith('a new password');
  });

  /** The keyboard's own keys, as on the sign-in and sign-up forms. */
  describe('moving through the form', () => {
    let focus: jest.SpiedFunction<TextInput['focus']>;

    /** The fields the form has moved the focus to, by label, in order. */
    const focused = () =>
      focus.mock.contexts.map((field) => (field as TextInput).props.accessibilityLabel);

    beforeEach(() => {
      focus = jest.spyOn(TextInput.prototype, 'focus');
    });

    afterEach(() => {
      focus.mockRestore();
    });

    it('asks for a code from the address’s own key', async () => {
      await renderScreen(<ResetPasswordScreen />);
      expect(screen.getByLabelText('Email')).toHaveProp('returnKeyType', 'go');

      await user.type(screen.getByLabelText('Email'), 'anna@example.com', { submitEditing: true });

      expect(mockSendPasswordReset).toHaveBeenCalledWith('anna@example.com');
      expect(screen.getByText('Check your email')).toBeOnTheScreen();
    });

    it('goes on from the code to the new password with the keyboard’s key, keeping the keyboard up', async () => {
      await askedForACode();
      const code = screen.getByLabelText('Code');
      expect(code).toHaveProp('returnKeyType', 'next');
      // Letting go of the focus first would close the number pad, and the
      // password would open the keyboard again.
      expect(code).toHaveProp('submitBehavior', 'submit');

      await user.type(code, '87654321', { submitEditing: true });

      expect(focused()).toEqual(['New password']);
      expect(mockVerifyResetCode).not.toHaveBeenCalled();
    });

    it('sets the new password from its own key', async () => {
      await askedForACode();
      await user.type(screen.getByLabelText('Code'), '87654321');
      expect(screen.getByLabelText('New password')).toHaveProp('returnKeyType', 'go');

      await user.type(screen.getByLabelText('New password'), 'a new password', {
        submitEditing: true,
      });

      expect(mockVerifyResetCode).toHaveBeenCalledWith('anna@example.com', '87654321');
      expect(mockSetNewPassword).toHaveBeenCalledWith('a new password');
    });

    it('saves the password alone from its key once the code has signed the courier in', async () => {
      mockSetNewPassword.mockRejectedValueOnce(
        new Error('The new password has to differ from the old one.'),
      );
      await askedForACode();
      await typedCodeAndPassword();
      await user.clear(screen.getByLabelText('New password'));

      await user.type(screen.getByLabelText('New password'), 'another password', {
        submitEditing: true,
      });

      expect(mockSetNewPassword).toHaveBeenLastCalledWith('another password');
      expect(mockVerifyResetCode).toHaveBeenCalledTimes(1);
    });
  });
});

describe('ResetPasswordScreen', () => {
  describe('the keyboard', () => {
    /**
     * Inside a scroll view a KeyboardAvoidingView pads itself taller on every
     * layout pass while the keyboard is up. This form was short enough to
     * stay clear of it at the default text size, but not at a larger one.
     */
    it('puts no KeyboardAvoidingView on the form', async () => {
      await renderScreen(<ResetPasswordScreen />);

      expect(mockKeyboardAvoidingViews).toHaveLength(0);
    });

    it('lets the scroll view follow the keyboard on iOS, and a drag put it away', async () => {
      Platform.OS = 'ios';
      await renderScreen(<ResetPasswordScreen />);

      expect(scrollView().automaticallyAdjustKeyboardInsets).toBe(true);
      expect(scrollView().keyboardDismissMode).toBe('interactive');
    });

    it('makes room for the keyboard on Android', async () => {
      Platform.OS = 'android';
      await renderScreen(<ResetPasswordScreen />);

      await keyboard('keyboardDidShow', 280);

      expect(paddingBelow()).toBe(280);
    });
  });
});
