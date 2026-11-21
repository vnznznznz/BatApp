import { act, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { DeviceEventEmitter, FlatList, Platform, StyleSheet, TextInput } from 'react-native';
import { SafeAreaProvider, type Edge, type Metrics } from 'react-native-safe-area-context';

import { Screen } from '@/components/screen';

/**
 * A 412 x 915 Android phone with gesture navigation: a 24dp bar at the bottom,
 * which the safe area reports as the bottom inset.
 */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 40, left: 0, right: 0, bottom: 24 },
};

const KEYBOARD = 300;

const DEFAULT_OS = Platform.OS;

function onPlatform(os: typeof Platform.OS) {
  Platform.OS = os;
}

/**
 * The keyboard opening, as React Native announces it. On Android the height is
 * the keyboard's inset less the navigation bar's (ReactRootView's
 * checkForKeyboardEvents: imeInsets.bottom - barInsets.bottom), so it is the
 * part of the keyboard above the navigation bar. It is sent again, with the new
 * height, whenever the height changes while the keyboard is up.
 */
const keyboardShows = (height: number) =>
  act(async () => {
    DeviceEventEmitter.emit('keyboardDidShow', {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 915 - 24 - height, width: 412, height },
    });
  });

const keyboardHides = () =>
  act(async () => {
    DeviceEventEmitter.emit('keyboardDidHide', {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 915, width: 412, height: 0 },
    });
  });

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

type HostNode = {
  type: unknown;
  parent: HostNode | null;
  props: Record<string, unknown> & { style?: unknown };
};

/** The screen's own safe-area view: the view that holds everything else. */
function safeArea(): HostNode {
  const views = screen.container.queryAll(
    (node) => (node as unknown as HostNode).type === 'RNCSafeAreaView',
  ) as unknown as HostNode[];
  const [view, ...others] = views;
  if (!view || others.length > 0) {
    throw new Error(`Expected one safe-area view, found ${views.length}.`);
  }
  return view;
}

/**
 * What the safe-area view adds below its content besides the insets it pads
 * itself: the padding of its style. For an edge in `edges`, the native view
 * adds that edge's inset to this ("additive": RNCSafeAreaViewShadowNode.cpp,
 * getEdgeValue); for an edge left out, this is all there is.
 */
const paddingBelow = () =>
  (StyleSheet.flatten(safeArea().props.style as never) as { paddingBottom?: number })
    .paddingBottom ?? 0;

const padsBottomInset = () => (safeArea().props.edges as { bottom: string }).bottom !== 'off';

/** Whether `node` lies inside the screen's safe-area view, and so ends where it ends. */
function insideSafeArea(node: HostNode): boolean {
  const view = safeArea();
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent === view) return true;
  }
  return false;
}

beforeEach(() => {
  onPlatform('android');
});

afterEach(async () => {
  // The keyboard module remembers the last keyboard it was told of; a test
  // that left it open would open the next test's screens onto it.
  await keyboardHides();
  onPlatform(DEFAULT_OS);
});

describe('Screen and the keyboard', () => {
  describe('on Android', () => {
    /**
     * Android draws this app edge to edge, and there the window is not made
     * smaller for the keyboard: a scroll view went on behind it, and what was
     * typed at the bottom of a long letter could not be seen.
     */
    it('ends a scrolling screen at the top of the keyboard, and lets go once it closes', async () => {
      await renderScreen(
        <Screen scroll avoidKeyboard edges={['bottom']}>
          <TextInput accessibilityLabel="Your letter" multiline />
        </Screen>,
      );
      const scrollView = screen.getByLabelText('Your letter').parent?.parent as unknown as HostNode;
      expect(scrollView.type).toBe('RCTScrollView');
      expect(insideSafeArea(scrollView)).toBe(true);
      expect(paddingBelow()).toBe(0);

      await keyboardShows(KEYBOARD);

      // The navigation bar's 24dp the safe area pads already; the keyboard's
      // height comes on top of it: 324dp from the bottom of the window, which
      // is where the keyboard begins.
      expect(padsBottomInset()).toBe(true);
      expect(paddingBelow()).toBe(KEYBOARD);

      await keyboardHides();

      expect(paddingBelow()).toBe(0);
    });

    it('makes the same room for a list in a screen that does not scroll', async () => {
      await renderScreen(
        <Screen edges={['bottom']}>
          <TextInput accessibilityLabel="City" />
          <FlatList
            testID="results"
            data={['Berlin', 'Bergen', 'Bern']}
            keyExtractor={(city) => city}
            renderItem={() => null}
          />
        </Screen>,
      );

      await keyboardShows(KEYBOARD);

      expect(insideSafeArea(screen.getByTestId('results') as unknown as HostNode)).toBe(true);
      expect(paddingBelow()).toBe(KEYBOARD);
    });

    /**
     * Without the bottom edge nothing pads the navigation bar, so the screen
     * reaches the bottom of the window and the keyboard covers that much more.
     */
    it('counts the navigation bar itself when the screen leaves the bottom edge out', async () => {
      await renderScreen(
        <Screen scroll edges={['top']}>
          <TextInput accessibilityLabel="Email" />
        </Screen>,
      );
      expect(paddingBelow()).toBe(0);

      await keyboardShows(KEYBOARD);

      expect(padsBottomInset()).toBe(false);
      expect(paddingBelow()).toBe(KEYBOARD + metrics.insets.bottom);

      await keyboardHides();

      expect(paddingBelow()).toBe(0);
    });

    it('follows the keyboard when it changes height while it is up', async () => {
      await renderScreen(
        <Screen scroll>
          <TextInput accessibilityLabel="Email" />
        </Screen>,
      );
      await keyboardShows(KEYBOARD);

      // The emoji panel, say, which is taller than the letters.
      await keyboardShows(KEYBOARD + 60);

      expect(paddingBelow()).toBe(KEYBOARD + 60);
    });

    it('makes room at once on a screen that opens while the keyboard is up', async () => {
      await keyboardShows(KEYBOARD);

      await renderScreen(
        <Screen scroll>
          <TextInput accessibilityLabel="Email" />
        </Screen>,
      );

      expect(paddingBelow()).toBe(KEYBOARD);
    });

    /**
     * A floating keyboard covers no edge: Android reports no inset for it, and
     * so a height of less than nothing.
     */
    it.each<[string, Edge[]]>([
      ['pads the bottom edge', ['bottom']],
      ['leaves the bottom edge out', ['top']],
    ])(
      'makes no room for a keyboard that covers nothing at the bottom, on a screen that %s',
      async (_, edges) => {
        await renderScreen(
          <Screen scroll edges={edges}>
            <TextInput accessibilityLabel="Email" />
          </Screen>,
        );

        await keyboardShows(-metrics.insets.bottom);

        expect(paddingBelow()).toBe(0);
      },
    );

    it('stops listening once the screen has gone', async () => {
      const before = DeviceEventEmitter.listenerCount('keyboardDidShow');
      await renderScreen(
        <Screen scroll>
          <TextInput accessibilityLabel="Email" />
        </Screen>,
      );
      expect(DeviceEventEmitter.listenerCount('keyboardDidShow')).toBe(before + 1);

      await screen.unmount();

      expect(DeviceEventEmitter.listenerCount('keyboardDidShow')).toBe(before);
      expect(DeviceEventEmitter.listenerCount('keyboardDidHide')).toBeLessThanOrEqual(before);
    });
  });

  describe('on iOS', () => {
    beforeEach(() => {
      onPlatform('ios');
    });

    /**
     * There the scroll view's insets follow the keyboard by themselves. Padding
     * as well would count the keyboard twice.
     */
    it('leaves the keyboard to the scroll view, and pads nothing', async () => {
      await renderScreen(
        <Screen scroll avoidKeyboard>
          <TextInput accessibilityLabel="Email" />
        </Screen>,
      );
      const scrollView = screen.getByLabelText('Email').parent?.parent as unknown as HostNode;

      await keyboardShows(KEYBOARD);

      expect(paddingBelow()).toBe(0);
      expect(scrollView.props.automaticallyAdjustKeyboardInsets).toBe(true);
      expect(scrollView.props.keyboardDismissMode).toBe('interactive');
    });

    it('pads nothing on a screen that opens while the keyboard is up', async () => {
      await keyboardShows(KEYBOARD);

      await renderScreen(
        <Screen scroll avoidKeyboard>
          <TextInput accessibilityLabel="Email" />
        </Screen>,
      );

      expect(paddingBelow()).toBe(0);
    });

    it('does not listen for the keyboard at all', async () => {
      const before = DeviceEventEmitter.listenerCount('keyboardDidShow');

      await renderScreen(
        <Screen scroll avoidKeyboard>
          <TextInput accessibilityLabel="Email" />
        </Screen>,
      );

      expect(DeviceEventEmitter.listenerCount('keyboardDidShow')).toBe(before);
    });
  });
});
