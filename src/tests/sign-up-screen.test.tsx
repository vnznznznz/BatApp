import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { DeviceEventEmitter, Platform, StyleSheet, TextInput } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import SignUpScreen from '@/app/sign-up';
import { MINIMUM_AGE, PARENTAL_PERMISSION_UNDER } from '@/constants/config';
import { AuthProvider } from '@/features/auth/auth-context';
import { announce } from '@/lib/announce';
import { openLink } from '@/lib/links';

const mockSignUp = jest.fn();
const mockConfirmEmail = jest.fn();
const mockResendConfirmationCode = jest.fn();
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
    useAuth: () =>
      mockAuth.real
        ? actual.useAuth()
        : {
            signUp: mockSignUp,
            confirmEmail: mockConfirmEmail,
            resendConfirmationCode: mockResendConfirmationCode,
          },
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
  mockConfirmEmail.mockReset();
  mockResendConfirmationCode.mockReset();
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
    mockSignUp.mockRejectedValue(new Error('The email could not be sent. Try again later.'));
    await renderScreen(<SignUpScreen />);

    await fillForm();
    await fireEvent.press(screen.getByText('Create account'));

    expect(screen.getByText('The email could not be sent. Try again later.')).toBeOnTheScreen();
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
   * With email confirmation on, the account waits for the code emailed to its
   * address. There was only "Check your email" and a link in the email, which
   * came back through the app's URL scheme with a whole session that the app
   * never read; a link that had run out was the end of the road.
   */
  describe('confirming the address with the code from the email', () => {
    const CODE_DID_NOT_WORK =
      'That code did not work. Check it against the newest email, or ask for a new one.';
    const INTRO =
      'If anna@example.com is new here, a code is on its way to it. Type it in below, and your ' +
      '3 bats will be waiting. If you already have an account, sign in instead.';
    const WAIT = 'You can ask for a new code a minute after the last one.';

    let user: ReturnType<typeof userEvent.setup>;

    beforeEach(() => {
      jest.useFakeTimers();
      user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function signedUp() {
      mockSignUp.mockResolvedValue({ needsEmailConfirmation: true });
      await renderScreen(<SignUpScreen />);
      await fillForm();
      await user.press(button('Create account'));
      expect(screen.getByText('Check your email')).toBeOnTheScreen();
    }

    const codeField = () => screen.getByLabelText('Code');
    const passes = (ms: number) => act(async () => jest.advanceTimersByTime(ms));

    it('asks for the code, in words true whether or not the address has an account', async () => {
      await signedUp();

      expect(screen.getByText(INTRO)).toBeOnTheScreen();
      expect(codeField()).toHaveProp('keyboardType', 'number-pad');
      expect(codeField()).toHaveProp('accessibilityHint', 'The 8 digits from the email.');
      expect(button('Confirm')).toBeOnTheScreen();
      expect(button('Sign in instead')).toBeOnTheScreen();
    });

    it('confirms the address with the code typed in', async () => {
      mockConfirmEmail.mockResolvedValue(undefined);
      await signedUp();

      await user.type(codeField(), '12345678');
      await user.press(button('Confirm'));

      expect(mockConfirmEmail).toHaveBeenCalledWith('anna@example.com', '12345678');
    });

    it('sends nothing until the code is whole, and says why', async () => {
      await signedUp();

      await user.type(codeField(), '1234');
      await user.press(button('Confirm'));

      expect(mockConfirmEmail).not.toHaveBeenCalled();
      expect(codeField()).toHaveProp('accessibilityHint', 'The code has 8 digits.');
    });

    it('says at the code when the code did not work', async () => {
      mockConfirmEmail.mockRejectedValue(new Error(CODE_DID_NOT_WORK));
      await signedUp();

      await user.type(codeField(), '12345678');
      await user.press(button('Confirm'));

      expect(screen.getAllByText(CODE_DID_NOT_WORK)).toHaveLength(1);
      expect(codeField()).toHaveProp('accessibilityHint', CODE_DID_NOT_WORK);
    });

    it('says other failures under the code, aloud', async () => {
      const NO_CONNECTION = 'No connection. Check your network and try again.';
      mockConfirmEmail.mockRejectedValue(new Error(NO_CONNECTION));
      await signedUp();

      await user.type(codeField(), '12345678');
      await user.press(button('Confirm'));

      expect(screen.getByText(NO_CONNECTION)).toBeOnTheScreen();
      expect(codeField()).not.toHaveProp('accessibilityHint', NO_CONNECTION);
      expect(mockedAnnounce).toHaveBeenCalledWith(NO_CONNECTION);
    });

    /**
     * The auth server refuses a new code within a minute of the last one, and
     * says so only for an address that has an account: for any other it
     * answers as if it had sent one. So the screen waits its minute itself,
     * whatever the address, and nobody can learn anything from pressing it.
     */
    it('lets a new code be asked for a minute after the last one, and then again a minute later', async () => {
      mockResendConfirmationCode.mockResolvedValue(undefined);
      await signedUp();

      expect(button('Send the code again')).toBeDisabled();
      expect(button('Send the code again')).toHaveProp('accessibilityHint', WAIT);
      expect(screen.getByText(WAIT)).toBeOnTheScreen();
      await passes(59_000);
      expect(button('Send the code again')).toBeDisabled();
      await passes(1_000);
      expect(button('Send the code again')).toBeEnabled();

      await user.press(button('Send the code again'));

      expect(mockResendConfirmationCode).toHaveBeenCalledWith('anna@example.com');
      const resent =
        'If anna@example.com is new here, a new code is on its way to it. Only the newest code works.';
      expect(screen.getByText(resent)).toBeOnTheScreen();
      expect(mockedAnnounce).toHaveBeenCalledWith(resent);
      expect(button('Send the code again')).toBeDisabled();
      await passes(60_000);
      expect(button('Send the code again')).toBeEnabled();
    });

    it('says why a new code was not sent', async () => {
      const JUST_SENT = 'A code was sent a moment ago. Ask for a new one in 43 seconds.';
      mockResendConfirmationCode.mockRejectedValue(new Error(JUST_SENT));
      await signedUp();
      await passes(60_000);

      await user.press(button('Send the code again'));

      expect(screen.getByText(JUST_SENT)).toBeOnTheScreen();
      expect(mockedAnnounce).toHaveBeenCalledWith(JUST_SENT);
      expect(button('Send the code again')).toBeEnabled();
    });

    it('goes to sign in for an address that has an account', async () => {
      await signedUp();

      await user.press(button('Sign in instead'));

      expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    });

    /**
     * A mistyped address has an account now, waiting for a code that goes to
     * someone else - with the username, until the tidy-up deletes it a week
     * later. Said where the way back is, in words that are true whether or not
     * it was so.
     */
    it('goes back to the form to correct the address, with everything typed still there', async () => {
      await signedUp();
      expect(
        screen.getByText(
          'Wrong address? Go back and correct it. You may need another username then: the one ' +
            'you chose can stay with this address for about a week.',
        ),
      ).toBeOnTheScreen();

      await user.press(button('Change the address'));

      expect(screen.queryByText('Check your email')).toBeNull();
      expect(screen.getByLabelText('Email').props.value).toBe('anna@example.com');
      expect(screen.getByLabelText('Username').props.value).toBe('AnnaWeber');
      expect(mockSignUp).toHaveBeenCalledTimes(1);
    });

    /**
     * Under the app's own auth context, over the auth server's real answers: a
     * new address gets an account and no session; one with a confirmed account
     * gets "User already registered" (GoTrue v2.197, confirmation on). What the
     * screen then shows has to be the same, to the last word.
     */
    it('shows exactly the same for an address that has an account as for a new one', async () => {
      mockAuth.real = true;
      const shownFor = async (answer: unknown) => {
        mockAuth.serverSignUp.mockResolvedValue(answer);
        await renderScreen(
          <AuthProvider>
            <SignUpScreen />
          </AuthProvider>,
        );
        await fillForm();
        await user.press(button('Create account'));
        const tree = JSON.stringify(screen.toJSON());
        await screen.unmount();
        return tree;
      };

      const forNew = await shownFor({
        data: { user: { id: 'user-anna', identities: [{}] }, session: null },
        error: null,
      });
      const forTaken = await shownFor({
        data: { user: null, session: null },
        error: new AuthApiError('User already registered', 422, 'user_already_exists'),
      });

      expect(forNew).toContain('Check your email');
      expect(forTaken).toBe(forNew);
    });
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

  /**
   * What the database or the auth server would refuse is said at the field
   * before anything is sent. A name the database refuses came back from the
   * auth server as the same error as a taken username, and was said as one.
   */
  describe('what the form checks before asking', () => {
    const NOTHING_TO_SEE = 'Enter a name your friends will recognise.';
    const NOT_PLAIN = 'A name cannot contain line breaks or hidden characters.';

    async function fillWith(details: {
      name?: string;
      username?: string;
      email?: string;
      password?: string;
    }) {
      const user = userEvent.setup();
      const {
        name = 'Anna Weber',
        username = 'anna',
        email = 'anna@example.com',
        password = 'a-good-password',
      } = details;
      await user.type(screen.getByLabelText('Your name'), name);
      await user.type(screen.getByLabelText('Username'), username);
      await user.type(screen.getByLabelText('Email'), email);
      await user.type(screen.getByLabelText('Password'), password);
      await fireEvent(ageSwitch(), 'valueChange', true);
      await user.press(button('Create account'));
    }

    it.each([
      ['a zero-width space', '\u200B', NOTHING_TO_SEE],
      ['a Hangul filler', '\u3164', NOTHING_TO_SEE],
      ['a right-to-left override in it', 'ab\u202Edetpecca', NOT_PLAIN],
    ])('refuses a name of %s at the name, and sends nothing', async (_, name, said) => {
      await renderScreen(<SignUpScreen />);

      await fillWith({ name });

      expect(mockSignUp).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Your name')).toHaveProp('accessibilityHint', said);
    });

    /** The database counts characters, and 30 emoji are 30 of them, not 60. */
    it('takes a name of 30 emoji', async () => {
      mockSignUp.mockResolvedValue({ needsEmailConfirmation: false });
      await renderScreen(<SignUpScreen />);

      await fillWith({ name: '🦇'.repeat(30) });

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: '🦇'.repeat(30) }),
      );
    });

    /** The app writes usernames with an @, and people share them that way. */
    it('takes a username typed with its @', async () => {
      mockSignUp.mockResolvedValue({ needsEmailConfirmation: false });
      await renderScreen(<SignUpScreen />);

      await fillWith({ username: '@anna' });

      expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({ username: '@anna' }));
    });

    it('refuses a password longer than the auth server takes, and says why', async () => {
      await renderScreen(<SignUpScreen />);

      await fillWith({ password: 'ä'.repeat(40) });

      expect(mockSignUp).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Password').props.accessibilityHint).toMatch(
        /at most 72 characters long\. Letters such as ä or é count as two/,
      );
    });

    it('refuses an address the auth server does not take, in the words it gets for it', async () => {
      await renderScreen(<SignUpScreen />);

      await fillWith({ email: 'jürgen@example.de' });

      expect(mockSignUp).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Email')).toHaveProp(
        'accessibilityHint',
        'That email address was not accepted. Check it for mistakes - letters such as ä or é ' +
          'cannot be used.',
      );
    });
  });

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
     * focus on, so each field had to be tapped into by hand.
     */
    it('goes from each field to the next with the keyboard’s key, keeping the keyboard up', async () => {
      const user = userEvent.setup();
      await renderScreen(<SignUpScreen />);

      for (const label of ['Your name', 'Username', 'Email']) {
        const field = screen.getByLabelText(label);
        expect(field).toHaveProp('returnKeyType', 'next');
        // Letting go of the focus first would close the keyboard, and the next
        // field would open it again.
        expect(field).toHaveProp('submitBehavior', 'submit');
      }

      await user.type(screen.getByLabelText('Your name'), 'Anna Weber', { submitEditing: true });
      expect(focused()).toEqual(['Username']);

      await user.type(screen.getByLabelText('Username'), 'anna', { submitEditing: true });
      expect(focused()).toEqual(['Username', 'Email']);

      await user.type(screen.getByLabelText('Email'), 'anna@example.com', { submitEditing: true });
      expect(focused()).toEqual(['Username', 'Email', 'Password']);
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('creates the account from the password’s key', async () => {
      mockSignUp.mockResolvedValue({ needsEmailConfirmation: false });
      const user = userEvent.setup();
      await renderScreen(<SignUpScreen />);
      await user.type(screen.getByLabelText('Your name'), 'Anna Weber');
      await user.type(screen.getByLabelText('Username'), 'anna');
      await user.type(screen.getByLabelText('Email'), 'anna@example.com');
      await fireEvent(ageSwitch(), 'valueChange', true);

      await user.type(screen.getByLabelText('Password'), 'a-good-password', {
        submitEditing: true,
      });

      expect(screen.getByLabelText('Password')).toHaveProp('returnKeyType', 'go');
      expect(mockSignUp).toHaveBeenCalledWith({
        displayName: 'Anna Weber',
        username: 'anna',
        email: 'anna@example.com',
        password: 'a-good-password',
      });
    });
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
