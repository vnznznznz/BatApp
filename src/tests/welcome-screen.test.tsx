import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import WelcomeScreen from '@/app/index';
import { BATS_PER_USER } from '@/constants/config';
import { forgetFarewell, noteAccountDeleted, noteAccountSuspended } from '@/lib/farewell';
import { openLink } from '@/lib/links';
import { REFUSALS } from '@/lib/rpc-error';

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

jest.mock('@/lib/links', () => ({
  ...jest.requireActual('@/lib/links'),
  CONTACT_URL: 'https://night-courier.example/help',
  openLink: jest.fn(),
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
  forgetFarewell();
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

  /**
   * A suspended account whose session is over an hour old is signed out at
   * the app's start, and landed here with nothing to say why. (Found in the
   * browser.) Said once, with the way to write to Night Courier.
   */
  it('says once that the account has been suspended, with the way to write', async () => {
    noteAccountSuspended();

    const first = await renderScreen(<WelcomeScreen />);

    expect(screen.getByText(REFUSALS.account_suspended)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Contact' }));
    expect(jest.mocked(openLink)).toHaveBeenCalledWith('https://night-courier.example/help');

    await first.unmount();
    await renderScreen(<WelcomeScreen />);

    expect(screen.queryByText(REFUSALS.account_suspended)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Contact' })).toBeNull();
  });

  /**
   * At the app's start this screen is opened while the stored session is
   * still held, and shows nothing; the auth server's refusal can come before
   * that. Said and forgotten there, the word was gone by the time the screen
   * was shown signed out - only a screen reader heard it. (Found in the
   * browser.)
   */
  it('keeps the word until it is shown to someone signed out', async () => {
    noteAccountSuspended();
    mockAuth.session = { user: { id: 'user-sam' } };
    const first = await renderScreen(<WelcomeScreen />);
    await first.unmount();

    mockAuth.session = null;
    await renderScreen(<WelcomeScreen />);

    expect(screen.getByText(REFUSALS.account_suspended)).toBeOnTheScreen();
  });

  /**
   * Deleting the account lands here, as any sign-out does, and nothing said
   * that the deletion had gone through. (Found in the browser.) It is said
   * once: whoever opens the app next is not told it again.
   */
  it('says once that the account has been deleted', async () => {
    noteAccountDeleted();

    const first = await renderScreen(<WelcomeScreen />);

    expect(screen.getByText('Your account has been deleted.')).toBeOnTheScreen();

    await first.unmount();
    await renderScreen(<WelcomeScreen />);

    expect(screen.queryByText('Your account has been deleted.')).toBeNull();
  });

  it('says nothing of a deletion after an ordinary sign-out', async () => {
    await renderScreen(<WelcomeScreen />);

    expect(screen.queryByText('Your account has been deleted.')).toBeNull();
  });

  it('offers a way to create an account and a way to sign in', async () => {
    await renderScreen(<WelcomeScreen />);

    await fireEvent.press(screen.getByText('Create an account'));
    expect(mockPush).toHaveBeenCalledWith('/sign-up');

    await fireEvent.press(screen.getByText('I already have one'));
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
  });

  /**
   * A signed-in user who lands here is on their way to the roost: the root
   * layout sends them, from wherever a session appears, and app-layout.test.tsx
   * follows them there on the real router. Meanwhile this screen keeps its
   * pitch and its ways in from them, and sends nobody anywhere itself.
   */
  it('shows an already signed-in user nothing, and leaves sending them on to the root layout', async () => {
    mockAuth.session = { user: { id: 'abc' } };

    await renderScreen(<WelcomeScreen />);

    expect(screen.queryByText('Night Courier')).toBeNull();
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
