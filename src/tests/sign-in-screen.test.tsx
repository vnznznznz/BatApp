import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import {
  AccessibilityInfo,
  DeviceEventEmitter,
  Platform,
  StyleSheet,
  TextInput,
  type ViewProps,
} from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import SignInScreen from '@/app/sign-in';
import { SignedOutUnfinished } from '@/features/auth/auth-context';
import { announce } from '@/lib/announce';

const mockedAnnounce = jest.mocked(announce);

const mockSignIn = jest.fn();
const mockConfirmEmail = jest.fn();
const mockFinishSignIn = jest.fn();
const mockResendConfirmationCode = jest.fn();
const mockSignOut = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
    Stack: { Screen: () => null },
  };
});

/**
 * Whether the stand-in context holds the way in, as the app's does from the
 * moment the code from signing in has signed the courier in until the
 * password is saved again; and what for. A change is drawn at once, as with
 * the app's own context.
 */
const mockHold = {
  current: false,
  unfinished: null as object | null,
  listeners: new Set<() => void>(),
  set(next: boolean, unfinished: object | null = null) {
    mockHold.current = next;
    mockHold.unfinished = unfinished;
    mockHold.listeners.forEach((listener) => listener());
  },
};

jest.mock('@/features/auth/auth-context', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  const subscribe = (listener: () => void) => {
    mockHold.listeners.add(listener);
    return () => mockHold.listeners.delete(listener);
  };
  return {
    ...jest.requireActual<object>('@/features/auth/auth-context'),
    useAuth: () => {
      const isSettingPassword = useSyncExternalStore(subscribe, () => mockHold.current);
      return {
        isSettingPassword,
        unfinished: isSettingPassword ? mockHold.unfinished : null,
        signIn: mockSignIn,
        confirmEmail: mockConfirmEmail,
        finishSignIn: mockFinishSignIn,
        resendConfirmationCode: mockResendConfirmationCode,
        signOut: mockSignOut,
      };
    },
  };
});

jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));

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
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
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
      endCoordinates: { screenX: 0, screenY: 852 - height, width: 393, height },
    });
  });

beforeEach(() => {
  mockSignIn.mockReset();
  mockConfirmEmail.mockReset();
  mockFinishSignIn.mockReset();
  mockResendConfirmationCode.mockReset();
  mockSignOut.mockReset();
  mockHold.set(false);
  mockReplace.mockReset();
  mockedAnnounce.mockReset();
  mockKeyboardAvoidingViews.length = 0;
});

afterEach(async () => {
  await keyboard('keyboardDidHide', 0);
  Platform.OS = DEFAULT_OS;
});

describe('SignInScreen', () => {
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

    /**
     * The keyboard's "next" key only closed the keyboard: nothing moved the
     * focus on, so the password had to be tapped into by hand.
     */
    it('goes on to the password from the email address, keeping the keyboard up', async () => {
      const user = userEvent.setup();
      await renderScreen(<SignInScreen />);
      const email = screen.getByLabelText('Email');
      expect(email).toHaveProp('returnKeyType', 'next');
      // Submitting without letting go of the focus: letting go first would
      // close the keyboard, and the password would open it again.
      expect(email).toHaveProp('submitBehavior', 'submit');

      await user.type(email, 'anna@example.com', { submitEditing: true });

      expect(focused()).toEqual(['Password']);
      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('signs in from the password’s key', async () => {
      mockSignIn.mockResolvedValue({ needsEmailConfirmation: false });
      const user = userEvent.setup();
      await renderScreen(<SignInScreen />);
      await user.type(screen.getByLabelText('Email'), 'anna@example.com');

      await user.type(screen.getByLabelText('Password'), 'a-good-password', {
        submitEditing: true,
      });

      expect(mockSignIn).toHaveBeenCalledWith('anna@example.com', 'a-good-password');
      expect(screen.getByLabelText('Password')).toHaveProp('returnKeyType', 'go');
    });
  });

  /** The keyboard's "go" key is not held back by the button's spinner. */
  it('signs in once, however often the form is sent while it is being answered', async () => {
    mockSignIn.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await renderScreen(<SignInScreen />);
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-good-password');

    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    await user.type(screen.getByLabelText('Password'), '', {
      skipPress: true,
      submitEditing: true,
    });

    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('can be sent again once the answer has come', async () => {
    const NO_MATCH = 'That email and password do not match an account.';
    mockSignIn
      .mockRejectedValueOnce(new Error(NO_MATCH))
      .mockResolvedValue({ needsEmailConfirmation: false });
    const user = userEvent.setup();
    await renderScreen(<SignInScreen />);
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-wrong-password');
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText(NO_MATCH)).toBeOnTheScreen();

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'a-good-password');
    await user.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(mockSignIn).toHaveBeenCalledTimes(2);
    expect(mockSignIn).toHaveBeenLastCalledWith('anna@example.com', 'a-good-password');
  });

  /**
   * Shown under the form while a screen reader is still on the button that
   * sent it, and said to nobody. (Found in review.)
   */
  it('says aloud why it could not sign in', async () => {
    const NO_MATCH = 'That email and password do not match an account.';
    mockSignIn.mockRejectedValue(new Error(NO_MATCH));
    const user = userEvent.setup();
    await renderScreen(<SignInScreen />);
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-wrong-password');

    await user.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText(NO_MATCH)).toBeOnTheScreen();
    expect(mockedAnnounce).toHaveBeenCalledWith(NO_MATCH);
  });

  /**
   * "Check your email and confirm your address first" was all the form said,
   * and it led nowhere: a link that had run out could not be sent again. The
   * auth server says this only for the right password, so the code screen
   * tells nobody anything they did not know.
   */
  describe('an address still waiting for its code', () => {
    const INTRO =
      'Your account is waiting for the code we sent to anna@example.com. Type it in below. ' +
      'If you cannot find it, or it no longer works, ask for a new one.';

    let user: ReturnType<typeof userEvent.setup>;

    beforeEach(() => {
      jest.useFakeTimers();
      user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function signedInUnconfirmed() {
      mockSignIn.mockResolvedValue({ needsEmailConfirmation: true });
      await renderScreen(<SignInScreen />);
      await user.type(screen.getByLabelText('Email'), ' anna@example.com ');
      await user.type(screen.getByLabelText('Password'), 'a-good-password');
      await user.press(screen.getByRole('button', { name: 'Sign in' }));
      expect(screen.getByText('Confirm your address')).toBeOnTheScreen();
    }

    const button = (name: string) => screen.getByRole('button', { name });

    /** The form, and the button pressed, are gone; a screen reader is taken to what is asked now. */
    it('takes a screen reader to what it asks now', async () => {
      const focus = jest
        .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
        .mockImplementation(() => {});
      // React Native's own stand-in records every call, from every test before.
      focus.mockClear();

      await signedInUnconfirmed();

      expect(
        focus.mock.calls.map(([view, event]) => [
          event,
          (view as unknown as { props: ViewProps }).props.accessibilityLabel,
        ]),
      ).toEqual([['focus', `Confirm your address. ${INTRO}`]]);
      focus.mockRestore();
    });

    it('asks for the code sent to the address', async () => {
      await signedInUnconfirmed();

      expect(screen.getByText(INTRO)).toBeOnTheScreen();
      expect(screen.getByLabelText('Code')).toHaveProp('textContentType', 'oneTimeCode');
    });

    /** As the app's context does: the code signs the courier in, and holds the way in. */
    const codeSignsIn = () =>
      mockConfirmEmail.mockImplementation(async () =>
        mockHold.set(true, { flow: 'sign-in', email: 'anna@example.com' }),
      );

    /**
     * Confirming the address takes the account's password away (the database
     * does, as the code confirms it), so that nobody's password from before
     * signs in to it: the one the courier has just signed in with is set
     * again.
     */
    it('confirms the address with the code, and then saves the password signed in with again', async () => {
      codeSignsIn();
      mockFinishSignIn.mockResolvedValue(undefined);
      await signedInUnconfirmed();

      await user.type(screen.getByLabelText('Code'), '87654321');
      await user.press(button('Confirm'));

      expect(mockConfirmEmail).toHaveBeenCalledWith('anna@example.com', '87654321');
      expect(mockFinishSignIn).toHaveBeenCalledWith('a-good-password');
    });

    describe('when the password could not be saved again after the code', () => {
      const NOT_SAVED =
        'Your address is confirmed, but your password is not saved yet: confirming the address ' +
        'takes it away until it is saved again. Try again. Or sign out, and set a password ' +
        'with "I forgot my password".';

      async function notSaved() {
        codeSignsIn();
        mockFinishSignIn.mockRejectedValueOnce(
          new Error('No connection. Check your network and try again.'),
        );
        await signedInUnconfirmed();
        await user.type(screen.getByLabelText('Code'), '87654321');
        await user.press(button('Confirm'));
      }

      it('says so, and why, aloud, and offers no way back to the form', async () => {
        await notSaved();

        expect(screen.getByText('Almost there')).toBeOnTheScreen();
        expect(screen.getByText(NOT_SAVED)).toBeOnTheScreen();
        expect(mockedAnnounce).toHaveBeenLastCalledWith(
          `Almost there. ${NOT_SAVED} No connection. Check your network and try again.`,
        );
        expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
        expect(screen.queryByLabelText('Code')).toBeNull();
      });

      it('saves it when asked again, with no code asked for again', async () => {
        await notSaved();
        mockFinishSignIn.mockResolvedValue(undefined);

        await user.press(button('Try again'));

        expect(mockFinishSignIn).toHaveBeenCalledTimes(2);
        expect(mockFinishSignIn).toHaveBeenLastCalledWith('a-good-password');
        expect(mockConfirmEmail).toHaveBeenCalledTimes(1);
      });

      it('signs out instead, and goes back to the form, saying how to sign in now', async () => {
        await notSaved();
        mockSignOut.mockImplementation(async () => mockHold.set(false));

        await user.press(button('Sign out'));

        expect(mockSignOut).toHaveBeenCalledTimes(1);
        expect(mockedAnnounce).toHaveBeenLastCalledWith(
          'Signed out. To sign in, set a password with "I forgot my password".',
        );
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
        expect(mockFinishSignIn).toHaveBeenCalledTimes(1);
      });

      it('asks for a code again, with the reason, once the code’s sign-in has ended', async () => {
        codeSignsIn();
        const ended = 'Your sign-in ended before your password was saved again.';
        mockFinishSignIn.mockImplementation(async () => {
          mockHold.set(false);
          throw new SignedOutUnfinished(ended);
        });
        await signedInUnconfirmed();
        await user.type(screen.getByLabelText('Code'), '87654321');

        await user.press(button('Confirm'));

        expect(screen.getByText(ended)).toBeOnTheScreen();
        expect(screen.getByLabelText('Code')).toBeOnTheScreen();
        expect(screen.queryByText('Almost there')).toBeNull();
      });
    });

    /**
     * The code had signed the courier in, and the app was closed before the
     * password was saved again: the root layout brings them back here, and
     * the password, never kept, is asked for.
     */
    it('asks for the password at launch when the code had signed the courier in, and saves it', async () => {
      mockHold.set(true, { flow: 'sign-in', email: 'anna@example.com' });
      mockFinishSignIn.mockResolvedValue(undefined);
      await renderScreen(<SignInScreen />);

      expect(screen.getByText('Almost there')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Code')).toBeNull();
      await user.type(screen.getByLabelText('Password'), 'another-password');
      await user.press(button('Finish'));

      expect(mockFinishSignIn).toHaveBeenCalledWith('another-password');
      expect(mockConfirmEmail).not.toHaveBeenCalled();
    });

    it('confirms with the code from the keyboard’s key too, and only once while it is checked', async () => {
      mockConfirmEmail.mockReturnValue(new Promise(() => {}));
      await signedInUnconfirmed();
      expect(screen.getByLabelText('Code')).toHaveProp('returnKeyType', 'go');

      await user.type(screen.getByLabelText('Code'), '87654321', { submitEditing: true });
      expect(mockConfirmEmail).toHaveBeenCalledTimes(1);
      await user.press(button('Confirm'));
      await user.type(screen.getByLabelText('Code'), '', { skipPress: true, submitEditing: true });

      expect(mockConfirmEmail).toHaveBeenCalledTimes(1);
      expect(mockConfirmEmail).toHaveBeenCalledWith('anna@example.com', '87654321');
    });

    /** The code may be days old, or lost: a new one can be asked for at once. */
    it('sends a new code at once when asked, and waits a minute before the next', async () => {
      mockResendConfirmationCode.mockResolvedValue(undefined);
      await signedInUnconfirmed();
      expect(button('Send the code again')).toBeEnabled();

      await user.press(button('Send the code again'));

      expect(mockResendConfirmationCode).toHaveBeenCalledWith('anna@example.com');
      const resent = 'A new code is on its way to anna@example.com. Only the newest code works.';
      expect(screen.getByText(resent)).toBeOnTheScreen();
      expect(mockedAnnounce).toHaveBeenCalledWith(resent);
      expect(button('Send the code again')).toBeDisabled();
    });

    it('offers no way back to the form while the code is checked', async () => {
      mockConfirmEmail.mockReturnValue(new Promise(() => {}));
      await signedInUnconfirmed();
      await user.type(screen.getByLabelText('Code'), '12345678');

      await user.press(button('Confirm'));

      expect(button('Back')).toBeDisabled();
      expect(button('Send the code again')).toBeDisabled();
      await user.press(button('Back'));
      expect(screen.getByText('Confirm your address')).toBeOnTheScreen();
    });

    it('goes back to the form, with the address still there', async () => {
      await signedInUnconfirmed();

      await user.press(button('Back'));

      expect(screen.queryByText('Confirm your address')).toBeNull();
      expect(screen.getByLabelText('Email').props.value).toBe(' anna@example.com ');
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('the keyboard', () => {
    /**
     * A KeyboardAvoidingView inside a scroll view has no fixed height: its own
     * padding made it taller, which made it pad more, on every layout pass for
     * as long as the keyboard was up - on a small iPhone, without end.
     */
    it('puts no KeyboardAvoidingView on the form', async () => {
      await renderScreen(<SignInScreen />);

      expect(mockKeyboardAvoidingViews).toHaveLength(0);
    });

    it('lets the scroll view follow the keyboard on iOS, and a drag put it away', async () => {
      Platform.OS = 'ios';
      await renderScreen(<SignInScreen />);

      expect(scrollView().automaticallyAdjustKeyboardInsets).toBe(true);
      expect(scrollView().keyboardDismissMode).toBe('interactive');
    });

    it('makes room for the keyboard on Android', async () => {
      Platform.OS = 'android';
      await renderScreen(<SignInScreen />);

      await keyboard('keyboardDidShow', 280);

      expect(paddingBelow()).toBe(280);
    });
  });
});
