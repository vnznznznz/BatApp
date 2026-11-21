import { act, render } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import RootLayout from '@/app/_layout';

/** Everything the guard has asked of the router, in order. */
const mockNavigation: string[] = [];
const mockStack = {
  /** Whether there are screens on the stack that dismissing would take away. */
  canDismiss: true,
  /** How often the root stack has been drawn - by the navigator the guard lives in. */
  drawn: 0,
};
/** Where the app is, as expo-router reports it: the route's segments, outermost first. */
const mockSegments: { current: string[] } = { current: [] };

// Stable, as expo-router's is: the guard runs again whenever the router changes.
const mockRouter = {
  canDismiss: () => mockStack.canDismiss,
  dismissAll: () => {
    mockNavigation.push('dismissAll');
  },
  replace: (href: string) => {
    mockNavigation.push(`replace ${href}`);
  },
};

jest.mock('expo-router', () => ({
  // The layout paints the navigation chrome in its own palette, over this.
  DarkTheme: { dark: true, colors: {} },
  ThemeProvider: ({ children }: { children: import('react').ReactNode }) => children,
  // There is no navigator here: the guard is under test, not the screens it would show.
  Stack: () => {
    mockStack.drawn += 1;
    return null;
  },
  useRouter: () => mockRouter,
  useSegments: () => mockSegments.current,
}));

// The gesture handler's root view installs a native module, and the guard
// makes no gestures.
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: import('react').ReactNode }) => children,
}));

// The splash screen is native. The layout holds it at import, and lets it go
// once the stored session has been read.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

type MockAuth = {
  session: object | null;
  isRestoring: boolean;
  isSettingPassword: boolean;
  /** What the code that holds the way in is for, once it has signed the courier in. */
  unfinished: { flow: 'sign-up' | 'sign-in' | 'reset' } | null;
};

const mockAuth: MockAuth = {
  session: null,
  isRestoring: false,
  isSettingPassword: false,
  unfinished: null,
};

/**
 * Whoever reads the context, and what they were last given: a change is drawn
 * at once, as with the app's own context, and not only when the whole tree
 * happens to be drawn again - which, with the React Compiler, it is not.
 */
const mockReaders = {
  listeners: new Set<() => void>(),
  given: { ...mockAuth },
  current(): MockAuth {
    const { given } = mockReaders;
    const changed = (Object.keys(mockAuth) as (keyof MockAuth)[]).some(
      (key) => given[key] !== mockAuth[key],
    );
    if (changed) mockReaders.given = { ...mockAuth };
    return mockReaders.given;
  },
};

// The guard is under test, not the auth stack. Mocking the context keeps this
// from becoming an integration test of Supabase's client.
jest.mock('@/features/auth/auth-context', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    AuthProvider: ({ children }: { children: import('react').ReactNode }) => children,
    useAuth: () =>
      useSyncExternalStore((listener: () => void) => {
        mockReaders.listeners.add(listener);
        return () => mockReaders.listeners.delete(listener);
      }, mockReaders.current),
  };
});

/** Changes what the auth context says while the app is open. */
const authChanges = (change: Partial<MockAuth>) =>
  act(async () => {
    Object.assign(mockAuth, change);
    mockReaders.listeners.forEach((listener) => listener());
  });

/** A signed-in courier's session, as far as the guard looks at one. */
const SESSION = { user: { id: 'user-mara' } };

/**
 * Fixed insets. The layout's own provider draws nothing until a device reports
 * the insets, which none does here; it takes them from this one instead.
 */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderTheRoot = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RootLayout />
    </SafeAreaProvider>,
  );

/**
 * Renders the app's root, with expo-router reporting the courier on
 * `segments`, and makes sure the navigator - and the guard in it - ran: a guard
 * that never ran would let anyone stay anywhere.
 */
async function openTheAppOn(...segments: string[]) {
  mockSegments.current = segments;
  await renderTheRoot();
  expect(mockStack.drawn).toBeGreaterThan(0);
}

const mockedHideSplash = jest.mocked(SplashScreen.hideAsync);

beforeEach(() => {
  mockedHideSplash.mockClear();
  mockNavigation.length = 0;
  mockStack.canDismiss = true;
  mockStack.drawn = 0;
  mockSegments.current = [];
  mockAuth.session = SESSION;
  mockAuth.isRestoring = false;
  mockAuth.isSettingPassword = false;
  mockAuth.unfinished = null;
});

describe('the root guard', () => {
  /**
   * Whether anyone is signed in is read from the keychain, which takes a
   * moment. Until then the splash screen stays and nothing is drawn or decided
   * under it - a welcome screen flashing in front of a signed-in courier is
   * what the splash is held for.
   */
  describe('while the stored session is being read', () => {
    it('draws nothing, sends nobody anywhere, and keeps the splash screen', async () => {
      mockAuth.isRestoring = true;
      mockSegments.current = ['sign-in'];

      await renderTheRoot();

      expect(mockStack.drawn).toBe(0);
      expect(mockNavigation).toEqual([]);
      expect(mockedHideSplash).not.toHaveBeenCalled();
    });

    it('lets the splash screen go once it has been read', async () => {
      mockAuth.session = null;
      mockAuth.isRestoring = false;

      await openTheAppOn();

      expect(mockedHideSplash).toHaveBeenCalledTimes(1);
    });
  });

  describe('with a session', () => {
    /**
     * The house rules are read from the profile as well as from the sign-up
     * form, which is why they live outside the signed-in group. A guard that
     * sent every signed-in courier outside the group to the roost would take
     * them away from the rules the moment they were opened.
     */
    it('lets a signed-in courier stay on the house rules', async () => {
      await openTheAppOn('rules');

      expect(mockNavigation).toEqual([]);
    });

    /**
     * A link that leads nowhere lands on a page that says so. Sent on to the
     * roost at once, the courier would only have seen it flash past, and not
     * known why they were not where the link pointed; its button takes them
     * to the start, and from there to the roost.
     */
    it('lets a signed-in courier read that a link leads nowhere', async () => {
      await openTheAppOn('+not-found');

      expect(mockNavigation).toEqual([]);
    });

    it('leaves a courier already in the app where they are', async () => {
      await openTheAppOn('(app)', 'letters');

      expect(mockNavigation).toEqual([]);
    });

    /**
     * Signing in succeeds on the sign-in form, and it is the guard that moves
     * the courier on. Dismissing first leaves the roost the only screen in the
     * stack, so Back does not return to a sign-in form for an account that is
     * signed in.
     */
    it('takes a courier who has just signed in to the roost, with nothing behind it', async () => {
      await openTheAppOn('sign-in');

      expect(mockNavigation).toEqual(['dismissAll', 'replace /home']);
    });

    it('goes straight to the roost when there is nothing to dismiss', async () => {
      mockStack.canDismiss = false;

      await openTheAppOn('sign-in');

      expect(mockNavigation).toEqual(['replace /home']);
    });
  });

  /**
   * The code from a reset email signs the courier in, and the new password is
   * saved with that session a moment later - or not, and they try another.
   * Sent to the roost in between, they would be signed in with a password
   * they do not know, and the screen asking for it gone.
   */
  describe('while a password reset is being finished', () => {
    beforeEach(() => {
      mockAuth.isSettingPassword = true;
    });

    it('leaves the courier on the reset screen until the new password is saved', async () => {
      await openTheAppOn('reset-password');

      expect(mockNavigation).toEqual([]);
    });

    it('takes them to the roost once it is saved', async () => {
      await openTheAppOn('reset-password');
      expect(mockNavigation).toEqual([]);

      await authChanges({ isSettingPassword: false });

      expect(mockNavigation).toEqual(['dismissAll', 'replace /home']);
    });

    /**
     * Gone back from the reset screen - in a browser, say - they were signed
     * in, and taken into the app, with the password not saved. (Found in
     * review.) Held wherever they are, they are taken back to it, as they are
     * when the app opens after it was closed.
     */
    it.each([
      ['the sign-in form', ['sign-in']],
      ['the welcome screen, as the app opens', []],
      ['the house rules', ['rules']],
      ['the app itself', ['(app)', 'home']],
    ])('takes a courier back to the reset screen from %s', async (_, segments) => {
      mockAuth.unfinished = { flow: 'reset' };

      await openTheAppOn(...segments);

      expect(mockNavigation).toEqual(['replace /reset-password']);
    });

    /** Until the code has signed the courier in, what it is for is not known: nowhere to go. */
    it('sends nobody anywhere while the code is still being checked', async () => {
      await openTheAppOn('sign-in');

      expect(mockNavigation).toEqual([]);
    });
  });

  /**
   * The code that confirms a new account signs the courier in, and the
   * password they typed at sign-up is set with that session a moment later -
   * whoever signed up for the address first, their password is gone then.
   * Sent to the roost in between, they could be signed in to an account
   * someone else still has the password of. (Found in review.)
   */
  describe('while the account a sign-up’s code confirmed is being set up', () => {
    beforeEach(() => {
      mockAuth.isSettingPassword = true;
    });

    it('leaves the courier on the sign-up screen until it is done', async () => {
      await openTheAppOn('sign-up');

      expect(mockNavigation).toEqual([]);
    });

    it('takes them to the roost once it is done', async () => {
      await openTheAppOn('sign-up');

      await authChanges({ isSettingPassword: false });

      expect(mockNavigation).toEqual(['dismissAll', 'replace /home']);
    });

    /**
     * Gone from the sign-up screen while the code was checked - "Sign in
     * instead", or a browser's back - the code then signed the courier in on
     * a screen that did not hold them, and the root layout took them into the
     * app before the account was theirs. And the app, closed then, opened in
     * it. (Found in review.)
     */
    it.each([
      ['the sign-in form', ['sign-in']],
      ['the welcome screen, as the app opens', []],
      ['the page for a link that leads nowhere', ['+not-found']],
      ['the app itself', ['(app)', 'letters']],
    ])('takes a courier back to the sign-up screen from %s', async (_, segments) => {
      mockAuth.unfinished = { flow: 'sign-up' };

      await openTheAppOn(...segments);

      expect(mockNavigation).toEqual(['replace /sign-up']);
    });

    it('leaves a courier on the sign-up screen there', async () => {
      mockAuth.unfinished = { flow: 'sign-up' };

      await openTheAppOn('sign-up');

      expect(mockNavigation).toEqual([]);
    });
  });

  /**
   * Confirming an address takes the account's password away, and the code
   * from signing in signs the courier in: the password they signed in with is
   * set again a moment later. Sent to the roost in between, the account would
   * be left with no password at all.
   */
  describe('while the password signed in with is being set again', () => {
    beforeEach(() => {
      mockAuth.isSettingPassword = true;
    });

    it.each([
      ['the welcome screen, as the app opens', []],
      ['the sign-up form', ['sign-up']],
      ['the app itself', ['(app)', 'home']],
    ])('takes a courier back to the sign-in screen from %s', async (_, segments) => {
      mockAuth.unfinished = { flow: 'sign-in' };

      await openTheAppOn(...segments);

      expect(mockNavigation).toEqual(['replace /sign-in']);
    });

    it('leaves a courier on the sign-in screen there, and takes them in once it is set', async () => {
      mockAuth.unfinished = { flow: 'sign-in' };
      await openTheAppOn('sign-in');
      expect(mockNavigation).toEqual([]);

      await authChanges({ isSettingPassword: false, unfinished: null });

      expect(mockNavigation).toEqual(['dismissAll', 'replace /home']);
    });
  });

  it('sends a signed-in courier on from the reset screen when no reset is being finished', async () => {
    await openTheAppOn('reset-password');

    expect(mockNavigation).toEqual(['dismissAll', 'replace /home']);
  });

  describe('without a session', () => {
    it.each([
      ['the house rules', 'rules'],
      ['the sign-in form', 'sign-in'],
      ['the page for a link that leads nowhere', '+not-found'],
    ])('leaves someone signed out on %s', async (_, segment) => {
      mockAuth.session = null;

      await openTheAppOn(segment);

      expect(mockNavigation).toEqual([]);
    });
  });
});
