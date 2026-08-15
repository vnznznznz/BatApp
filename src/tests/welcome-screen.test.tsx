import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import WelcomeScreen from '@/app/index';
import { BATS_PER_USER } from '@/constants/config';

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

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
});
