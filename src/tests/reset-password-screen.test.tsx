import { act, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { DeviceEventEmitter, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import ResetPasswordScreen from '@/app/reset-password';

const mockSendPasswordReset = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ sendPasswordReset: mockSendPasswordReset }),
}));

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

beforeEach(() => {
  mockSendPasswordReset.mockReset();
  mockKeyboardAvoidingViews.length = 0;
});

afterEach(async () => {
  await keyboard('keyboardDidHide', 0);
  Platform.OS = DEFAULT_OS;
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
