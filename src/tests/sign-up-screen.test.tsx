import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import SignUpScreen from '@/app/sign-up';
import { openLink } from '@/lib/links';

const mockSignUp = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
}));

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ signUp: mockSignUp }),
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

async function fillForm() {
  await fireEvent.changeText(screen.getByLabelText('Your name'), 'Anna Weber');
  await fireEvent.changeText(screen.getByLabelText('Username'), 'AnnaWeber');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'anna@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'a-good-password');
}

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
  mockSignUp.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  mockLinks.privacyPolicy = null;
  mockedOpenLink.mockReset().mockResolvedValue(undefined);
});

describe('SignUpScreen', () => {
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
