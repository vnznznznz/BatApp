import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import WelcomeScreen from '@/app/index';
import { BATS_PER_USER } from '@/constants/config';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  Redirect: () => null,
}));

// The screen is under test, not the auth stack. Mocking the context keeps this
// from becoming an integration test of Supabase's client.
const mockAuth = { session: null as unknown };
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => mockAuth,
}));

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

beforeEach(() => {
  mockPush.mockClear();
  mockAuth.session = null;
});

describe('WelcomeScreen', () => {
  it('names the app and its premise', async () => {
    await renderScreen(<WelcomeScreen />);

    expect(screen.getByText('Night Courier')).toBeOnTheScreen();
    expect(screen.getByText('Messages that take their time.')).toBeOnTheScreen();
  });

  /**
   * The bat count on this screen is read from the same constant the rest of the
   * app uses, so the promise shown to a new user cannot drift from the rule the
   * database enforces.
   */
  it('states the bat count from the shared invariant', async () => {
    await renderScreen(<WelcomeScreen />);

    expect(screen.getByText(`${BATS_PER_USER} bats. Never more.`)).toBeOnTheScreen();
  });

  it('states that nothing is for sale', async () => {
    await renderScreen(<WelcomeScreen />);

    expect(screen.getByText('Nothing is for sale.')).toBeOnTheScreen();
    expect(
      screen.getByText(/No purchases, no credits, no subscriptions, no advertising/),
    ).toBeOnTheScreen();
  });

  it('offers a way to create an account and a way to sign in', async () => {
    await renderScreen(<WelcomeScreen />);

    await fireEvent.press(screen.getByText('Create an account'));
    expect(mockPush).toHaveBeenCalledWith('/sign-up');

    await fireEvent.press(screen.getByText('I already have one'));
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
  });

  it('sends an already signed-in user onward instead of showing the pitch', async () => {
    mockAuth.session = { user: { id: 'abc' } };

    await renderScreen(<WelcomeScreen />);

    expect(screen.queryByText('Night Courier')).toBeNull();
  });
});
