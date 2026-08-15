import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import SignUpScreen from '@/app/sign-up';

const mockSignUp = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
}));

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ signUp: mockSignUp }),
}));

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

beforeEach(() => {
  mockSignUp.mockReset();
  mockReplace.mockReset();
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
});
