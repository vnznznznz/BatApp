import { act } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';

import AppLayout from '@/app/(app)/_layout';
import RootLayout from '@/app/_layout';
import WelcomeScreen from '@/app/index';

/**
 * Who gets in, and where they are sent, on expo-router's own router.
 *
 * The root layout sends anyone with a session to the roost, from wherever the
 * session appears; the (app) layout sends anyone without one back to the
 * start; and the welcome screen shows its pitch only to someone signed out.
 * Each has tests of its own part with the router mocked away. Here the three
 * are put together on the real router, with the real layouts and the real
 * welcome screen, and what is checked is where the courier ends up - the
 * route, and what is on it.
 *
 * Only the session is made up: the auth stack is tested in its own files.
 */

/** No code from an email holds the way in here: the hold has tests of its own. */
const SIGNED_OUT = {
  session: null as object | null,
  isRestoring: false,
  isSettingPassword: false,
  unfinished: null,
};

const mockAuth = {
  state: { ...SIGNED_OUT },
  listeners: new Set<() => void>(),
};

/** The session changing, as the auth provider would announce it. */
async function authBecomes(next: Partial<typeof mockAuth.state>) {
  await act(async () => {
    mockAuth.state = { ...mockAuth.state, ...next };
    mockAuth.listeners.forEach((listener) => listener());
  });
}

jest.mock('@/features/auth/auth-context', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const subscribe = (listener: () => void) => {
    mockAuth.listeners.add(listener);
    return () => {
      mockAuth.listeners.delete(listener);
    };
  };
  return {
    AuthProvider: ({ children }: { children: import('react').ReactNode }) => children,
    useAuth: () => React.useSyncExternalStore(subscribe, () => mockAuth.state),
  };
});

// The splash screen is native; the root layout holds it at import and lets it
// go once the stored session has been read.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

// The root layout's own SafeAreaProvider draws nothing until a device reports
// its insets, which none does here. The library's mock reports some.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default,
);

const mockedHideSplash = jest.mocked(SplashScreen.hideAsync);

/** A courier's session, as far as the layouts look at one. */
const SESSION = { user: { id: 'user-mara' } };

/** The screens of the app, with stand-ins for those whose insides are not the point here. */
const APP = {
  _layout: RootLayout,
  index: WelcomeScreen,
  'sign-in': () => <Text>The sign-in form</Text>,
  '(app)/_layout': AppLayout,
  '(app)/home': () => <Text>The roost</Text>,
  '(app)/letters/index': () => <Text>The letters</Text>,
};

/** Opens the app at `url`, and returns a way to ask which route it is on. */
async function openTheAppAt(url: string) {
  const app = renderRouter(APP, { initialUrl: url });
  await app;
  return { route: () => app.getPathname() };
}

const theWelcomeScreen = () => screen.queryByText('Messages that take their time.');
const theRoost = () => screen.queryByText('The roost');

beforeEach(() => {
  mockAuth.state = { ...SIGNED_OUT };
  mockedHideSplash.mockClear();
});

afterEach(() => {
  // renderRouter turns fake timers on for the router's sake.
  jest.useRealTimers();
});

describe('the way into the app', () => {
  it('sends someone without a session who opens a screen of the app to the start', async () => {
    const app = await openTheAppAt('/letters');

    expect(app.route()).toBe('/');
    expect(theWelcomeScreen()).toBeOnTheScreen();
    expect(screen.queryByText('The letters')).toBeNull();
  });

  it('sends a courier out to the start as soon as their session ends', async () => {
    mockAuth.state.session = SESSION;
    const app = await openTheAppAt('/home');
    expect(theRoost()).toBeOnTheScreen();

    await authBecomes({ session: null });

    expect(app.route()).toBe('/');
    expect(theWelcomeScreen()).toBeOnTheScreen();
    expect(theRoost()).toBeNull();
  });

  /**
   * The welcome screen draws nothing for someone signed in: it is the root
   * layout that takes them on, and to the roost.
   */
  it('sends an already signed-in courier from the welcome screen to the roost', async () => {
    mockAuth.state.session = SESSION;

    const app = await openTheAppAt('/');

    expect(app.route()).toBe('/home');
    expect(theRoost()).toBeOnTheScreen();
    expect(theWelcomeScreen()).toBeNull();
  });

  it('takes a courier who has just signed in from the form to the roost', async () => {
    const app = await openTheAppAt('/sign-in');
    expect(screen.getByText('The sign-in form')).toBeOnTheScreen();

    await authBecomes({ session: SESSION });

    expect(app.route()).toBe('/home');
    expect(theRoost()).toBeOnTheScreen();
  });
});

/**
 * Whether anyone is signed in is read from the keychain at launch, which takes
 * a moment. Until it is known, the splash screen stays and nothing is drawn or
 * decided under it; then it goes, once.
 */
describe('while the stored session is being read', () => {
  beforeEach(() => {
    mockAuth.state.isRestoring = true;
  });

  it.each([
    ['someone signed out', null],
    ['a courier with a session', SESSION],
  ])(
    'draws nothing under the splash screen for %s, and sends nobody anywhere',
    async (_, session) => {
      mockAuth.state.session = session;

      const app = await openTheAppAt('/');

      expect(theWelcomeScreen()).toBeNull();
      expect(theRoost()).toBeNull();
      expect(app.route()).toBe('/');
      expect(mockedHideSplash).not.toHaveBeenCalled();
    },
  );

  it('lets the splash screen go once it is known, and takes a restored courier to the roost', async () => {
    mockAuth.state.session = SESSION;
    const app = await openTheAppAt('/');

    await authBecomes({ isRestoring: false });

    expect(mockedHideSplash).toHaveBeenCalledTimes(1);
    expect(app.route()).toBe('/home');
    expect(theRoost()).toBeOnTheScreen();
  });

  it('lets the splash screen go once it is known, and shows the start to someone signed out', async () => {
    const app = await openTheAppAt('/');

    await authBecomes({ isRestoring: false });

    expect(mockedHideSplash).toHaveBeenCalledTimes(1);
    expect(app.route()).toBe('/');
    expect(theWelcomeScreen()).toBeOnTheScreen();
  });

  it('lets the splash screen go only once, whatever happens to the session afterwards', async () => {
    await openTheAppAt('/');
    await authBecomes({ isRestoring: false });

    await authBecomes({ session: SESSION });
    await authBecomes({ session: null });

    expect(mockedHideSplash).toHaveBeenCalledTimes(1);
  });
});
