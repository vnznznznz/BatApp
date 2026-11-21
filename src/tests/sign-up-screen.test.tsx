import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { DeviceEventEmitter, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import SignUpScreen from '@/app/sign-up';
import { MINIMUM_AGE, PARENTAL_PERMISSION_UNDER } from '@/constants/config';
import { AuthProvider } from '@/features/auth/auth-context';
import { announce } from '@/lib/announce';
import { openLink } from '@/lib/links';

const mockSignUp = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
}));

/**
 * Whether the form is given the app's own auth context, over an auth server
 * whose answers the test writes, in place of the stand-in the other tests use.
 */
const mockAuth = { real: false, serverSignUp: jest.fn() };

jest.mock('@/features/auth/auth-context', () => {
  const actual = jest.requireActual<typeof import('@/features/auth/auth-context')>(
    '@/features/auth/auth-context',
  );
  return {
    ...actual,
    useAuth: () => (mockAuth.real ? actual.useAuth() : { signUp: mockSignUp }),
  };
});

// The client, as far as signing up asks it. Nobody is signed in, and nothing
// is stored.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...credentials: unknown[]) => mockAuth.serverSignUp(...credentials),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

jest.mock('@/lib/session-store', () => ({
  readStoredSession: () => Promise.resolve(null),
  isSessionStored: () => false,
}));

/** The privacy policy's address, as this build is configured. Unset in the environment, it is null. */
const mockLinks: { privacyPolicy: string | null } = { privacyPolicy: null };

// The address is configuration, read from the build's environment, and the
// form leaves the link out while it is unset. A getter, so the form reads it as
// it renders and each test can configure it as a build would; opening it is the
// device's business. No spread of the real module: Babel turns a spread beside
// a getter into a copy, and the copy would read the getter once, too early.
jest.mock('@/lib/links', () => ({
  CONTACT_URL: null,
  get PRIVACY_POLICY_URL() {
    return mockLinks.privacyPolicy;
  },
  openLink: jest.fn(),
}));

const mockedOpenLink = jest.mocked(openLink);

jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));
const mockedAnnounce = jest.mocked(announce);

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

const AGE_SWITCH = `I am ${MINIMUM_AGE} or older`;
const AGE_RULE =
  `Turn on "I am ${MINIMUM_AGE} or older" to continue. Night Courier is for people aged ` +
  `${MINIMUM_AGE} and over - under ${PARENTAL_PERMISSION_UNDER}, with a parent's or ` +
  `guardian's permission.`;

const PRIVACY_POLICY = 'https://example.com/night-courier/privacy';

/** What creating an account agrees to, as the form says it. */
const AGREEMENT =
  'By creating an account, you agree to the house rules - the terms of using Night Courier. ' +
  'There is no tolerance for harassment, threats, hate, scams, spam, or sexual content nobody ' +
  'asked for, and none at all for sexual content involving or sent to anyone under 18. ' +
  'Accounts that break them may be removed.';

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

async function fillForm({ oldEnough = true }: { oldEnough?: boolean } = {}) {
  await fireEvent.changeText(screen.getByLabelText('Your name'), 'Anna Weber');
  await fireEvent.changeText(screen.getByLabelText('Username'), 'AnnaWeber');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'anna@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'a-good-password');
  if (oldEnough) await fireEvent(ageSwitch(), 'valueChange', true);
}

const ageSwitch = () => screen.getByRole('switch', { name: AGE_SWITCH });

const button = (name: string) => screen.getByRole('button', { name });

type Element = ReturnType<typeof screen.getByText>;

/**
 * Where an element falls on the form, counted from the top: the order the form
 * is laid out in, one thing under the next, and the order a screen reader moves
 * through it.
 */
function placeOf(element: Element): number {
  const place = screen.container.queryAll(() => true).indexOf(element);
  if (place < 0) throw new Error('That is not on the form.');
  return place;
}

beforeEach(() => {
  mockAuth.real = false;
  mockAuth.serverSignUp.mockReset();
  mockSignUp.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  mockLinks.privacyPolicy = null;
  mockedOpenLink.mockReset().mockResolvedValue(undefined);
  mockedAnnounce.mockReset();
  mockKeyboardAvoidingViews.length = 0;
});

describe('SignUpScreen', () => {
  describe('who can join', () => {
    /**
     * Nobody's age is known or stored, so it cannot be checked - but the rule is
     * said where it applies, and saying yes to it is a deliberate act rather than
     * something the courier can miss.
     */
    it('asks whether the courier is old enough, saying what is needed under the age of consent', async () => {
      await renderScreen(<SignUpScreen />);

      expect(ageSwitch()).toBeOnTheScreen();
      expect(ageSwitch()).not.toBeChecked();
      expect(
        screen.getByText(
          `If you are under ${PARENTAL_PERMISSION_UNDER}, a parent or guardian has said yes.`,
        ),
      ).toBeOnTheScreen();
    });

    it('creates no account until the courier says they are old enough, and says why aloud', async () => {
      await renderScreen(<SignUpScreen />);

      await fillForm({ oldEnough: false });
      await fireEvent.press(button('Create account'));

      expect(mockSignUp).not.toHaveBeenCalled();
      expect(screen.getByText(AGE_RULE)).toBeOnTheScreen();
      expect(mockedAnnounce).toHaveBeenCalledWith(AGE_RULE);
    });

    /**
     * The fields say their own errors aloud. The age reminder used to be said
     * only once they were all right, so a screen reader user learnt of it on a
     * second try. (Found in review.)
     */
    it('says the age reminder aloud even when a field is wrong too, and as the switch hint', async () => {
      await renderScreen(<SignUpScreen />);
      await fillForm({ oldEnough: false });
      await fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');

      await fireEvent.press(button('Create account'));

      expect(mockSignUp).not.toHaveBeenCalled();
      expect(mockedAnnounce).toHaveBeenCalledWith(AGE_RULE);
      expect(ageSwitch()).toHaveProp('accessibilityHint', AGE_RULE);
    });

    it('lets go of the reminder once the switch is turned on, and then creates the account', async () => {
      mockSignUp.mockResolvedValue({ needsEmailConfirmation: false });
      await renderScreen(<SignUpScreen />);
      await fillForm({ oldEnough: false });
      await fireEvent.press(button('Create account'));

      await fireEvent(ageSwitch(), 'valueChange', true);

      expect(screen.queryByText(AGE_RULE)).toBeNull();
      await fireEvent.press(button('Create account'));
      expect(mockSignUp).toHaveBeenCalledTimes(1);
    });
  });

  it('does not submit an empty form, and says why', async () => {
    await renderScreen(<SignUpScreen />);

    await fireEvent.press(screen.getByText('Create account'));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a username.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your email address.')).toBeOnTheScreen();
  });

  it('passes the typed username through unchanged for the context to normalise', async () => {
    mockSignUp.mockResolvedValue({ needsEmailConfirmation: true });
    await renderScreen(<SignUpScreen />);

    await fillForm();
    await fireEvent.press(screen.getByText('Create account'));

    expect(mockSignUp).toHaveBeenCalledWith({
      displayName: 'Anna Weber',
      username: 'AnnaWeber',
      email: 'anna@example.com',
      password: 'a-good-password',
    });
  });

  /**
   * Which of these two happens depends on a Supabase project setting, not on
   * anything the app controls, so both have to be handled. Telling a user to
   * check an inbox when no email was sent leaves them waiting forever.
   */
  it('asks the user to check their email when confirmation is required', async () => {
    mockSignUp.mockResolvedValue({ needsEmailConfirmation: true });
    await renderScreen(<SignUpScreen />);

    await fillForm();
    await fireEvent.press(screen.getByText('Create account'));

    expect(screen.getByText('Check your email')).toBeOnTheScreen();
  });

  it('does not mention email when the account is usable immediately', async () => {
    mockSignUp.mockResolvedValue({ needsEmailConfirmation: false });
    await renderScreen(<SignUpScreen />);

    await fillForm();
    await fireEvent.press(screen.getByText('Create account'));

    expect(screen.queryByText('Check your email')).toBeNull();
  });

  it('reports a failure without clearing what was typed', async () => {
    mockSignUp.mockRejectedValue(new Error('There is already an account with that email address.'));
    await renderScreen(<SignUpScreen />);

    await fillForm();
    await fireEvent.press(screen.getByText('Create account'));

    expect(
      screen.getByText('There is already an account with that email address.'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Email').props.value).toBe('anna@example.com');
  });

  /**
   * The test above hands the form words the app has already made its own,
   * which is how this stayed hidden: what the auth server really answers to a
   * taken username is a 500, "Database error saving new user", and that is
   * what the form showed. Here the server's own answer goes in at the bottom,
   * under the app's real auth context, and the form has to say something a
   * newcomer can act on - at the field it is about.
   */
  it('says at the username that it may be taken, when the auth server refuses it as it really does', async () => {
    const TAKEN = 'That username may already be taken. Try another.';
    mockAuth.real = true;
    mockAuth.serverSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError('Database error saving new user', 500),
    });
    await renderScreen(
      <AuthProvider>
        <SignUpScreen />
      </AuthProvider>,
    );

    await fillForm();
    await fireEvent.press(button('Create account'));

    expect(mockAuth.serverSignUp).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/database error/i)).toBeNull();
    expect(screen.getAllByText(TAKEN)).toHaveLength(1);
    expect(screen.getByLabelText('Username')).toHaveProp('accessibilityHint', TAKEN);
    expect(screen.getByLabelText('Email')).not.toHaveProp('accessibilityHint', TAKEN);
    expect(screen.getByLabelText('Username').props.value).toBe('AnnaWeber');
  });

  it('lets go of that once the username is changed and the form sent again', async () => {
    mockAuth.real = true;
    mockAuth.serverSignUp
      .mockResolvedValueOnce({
        data: { user: null, session: null },
        error: new AuthRetryableFetchError('Database error saving new user', 500),
      })
      .mockResolvedValue({ data: { user: { id: 'user-anna' }, session: null }, error: null });
    await renderScreen(
      <AuthProvider>
        <SignUpScreen />
      </AuthProvider>,
    );
    await fillForm();
    await fireEvent.press(button('Create account'));

    await fireEvent.changeText(screen.getByLabelText('Username'), 'anna_w');
    await fireEvent.press(button('Create account'));

    expect(screen.queryByText('That username may already be taken. Try another.')).toBeNull();
    expect(screen.getByText('Check your email')).toBeOnTheScreen();
  });

  /**
   * Asking someone to be friends shows them your name before they have said
   * yes, so the hint names everyone who will see it. A screen reader says the
   * same on reaching the field.
   */
  it('says the name is seen by friends, and by anyone asked to be friends', async () => {
    const hint = 'What your friends, and anyone you ask to be friends, will see.';
    await renderScreen(<SignUpScreen />);

    expect(screen.getByText(hint)).toBeOnTheScreen();
    expect(screen.getByLabelText('Your name').props.accessibilityHint).toBe(hint);
  });

  describe('the keyboard', () => {
    const DEFAULT_OS = Platform.OS;

    type HostNode = { type: unknown; props: Record<string, unknown> };

    const hostsOfType = (type: string) =>
      screen.container.queryAll(
        (node) => (node as unknown as HostNode).type === type,
      ) as unknown as HostNode[];

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
        (StyleSheet.flatten(view.props.style as never) as { paddingBottom?: number })
          .paddingBottom ?? 0
      );
    }

    const keyboard = (event: 'keyboardDidShow' | 'keyboardDidHide', height: number) =>
      act(async () => {
        DeviceEventEmitter.emit(event, {
          duration: 0,
          easing: 'keyboard',
          endCoordinates: { screenX: 0, screenY: 844 - height, width: 390, height },
        });
      });

    afterEach(async () => {
      await keyboard('keyboardDidHide', 0);
      Platform.OS = DEFAULT_OS;
    });

    /**
     * Inside the scroll view a KeyboardAvoidingView has no fixed height: its own
     * padding made it taller, which made it pad more, on every layout pass for
     * as long as the keyboard was up - 453pt, 906pt, 1359pt on an iPhone 15 -
     * and a flick ran on past the form into empty space.
     */
    it('puts no KeyboardAvoidingView on the form', async () => {
      await renderScreen(<SignUpScreen />);

      expect(mockKeyboardAvoidingViews).toHaveLength(0);
    });

    it('lets the scroll view follow the keyboard on iOS, and a drag put it away', async () => {
      Platform.OS = 'ios';
      await renderScreen(<SignUpScreen />);

      expect(scrollView().automaticallyAdjustKeyboardInsets).toBe(true);
      expect(scrollView().keyboardDismissMode).toBe('interactive');
    });

    it('makes room for the keyboard on Android', async () => {
      Platform.OS = 'android';
      await renderScreen(<SignUpScreen />);

      await keyboard('keyboardDidShow', 280);

      expect(paddingBelow()).toBe(280);
    });
  });

  describe('the house rules', () => {
    /**
     * Creating an account agrees to the house rules - the terms, with the
     * zero-tolerance clause App Review asks an app with user content for. So
     * what they forbid, and the way to read them whole, come before the button
     * that agrees to them: on screen, and to a screen reader moving through the
     * form, nobody should meet the terms only after accepting them.
     */
    it('says what creating an account agrees to, before the button that does it', async () => {
      await renderScreen(<SignUpScreen />);

      const createAccount = placeOf(button('Create account'));
      expect(placeOf(screen.getByText(AGREEMENT))).toBeLessThan(createAccount);
      expect(placeOf(button('Read the house rules'))).toBeLessThan(createAccount);
    });

    it('opens the house rules, and creates no account', async () => {
      await renderScreen(<SignUpScreen />);

      await fireEvent.press(button('Read the house rules'));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/rules');
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('offers no privacy policy while none is configured', async () => {
      await renderScreen(<SignUpScreen />);

      expect(screen.queryByRole('button', { name: 'Privacy policy' })).toBeNull();
    });

    // App Review asks for the privacy policy to be linked in the app, and
    // signing up is where the data it covers starts to be collected.
    it('offers the privacy policy once one is configured, and opens it', async () => {
      mockLinks.privacyPolicy = PRIVACY_POLICY;
      await renderScreen(<SignUpScreen />);

      await fireEvent.press(button('Privacy policy'));

      expect(mockedOpenLink).toHaveBeenCalledTimes(1);
      expect(mockedOpenLink).toHaveBeenCalledWith(PRIVACY_POLICY);
      expect(mockSignUp).not.toHaveBeenCalled();
    });
  });
});
