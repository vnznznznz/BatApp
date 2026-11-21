import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { DeviceEventEmitter, Platform, StyleSheet, TextInput } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import SignInScreen from '@/app/sign-in';
import { announce } from '@/lib/announce';

const mockedAnnounce = jest.mocked(announce);

const mockSignIn = jest.fn();
const mockConfirmEmail = jest.fn();
const mockResendConfirmationCode = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
}));

jest.mock('@/features/auth/auth-context', () => ({
  ...jest.requireActual<object>('@/features/auth/auth-context'),
  useAuth: () => ({
    signIn: mockSignIn,
    confirmEmail: mockConfirmEmail,
    resendConfirmationCode: mockResendConfirmationCode,
  }),
}));

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
  mockResendConfirmationCode.mockReset();
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

    it('asks for the code sent to the address', async () => {
      await signedInUnconfirmed();

      expect(screen.getByText(INTRO)).toBeOnTheScreen();
      expect(screen.getByLabelText('Code')).toHaveProp('textContentType', 'oneTimeCode');
    });

    it('confirms the address with the code, which signs the courier in', async () => {
      mockConfirmEmail.mockResolvedValue(undefined);
      await signedInUnconfirmed();

      await user.type(screen.getByLabelText('Code'), '87654321');
      await user.press(button('Confirm'));

      expect(mockConfirmEmail).toHaveBeenCalledWith('anna@example.com', '87654321');
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
