import { render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import RootLayout from '@/app/_layout';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work that would otherwise
// count against whichever test runs first.
jest.setTimeout(20_000);

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

const mockAuth: { session: object | null; isRestoring: boolean } = {
  session: null,
  isRestoring: false,
};

// The guard is under test, not the auth stack. Mocking the context keeps this
// from becoming an integration test of Supabase's client.
jest.mock('@/features/auth/auth-context', () => ({
  AuthProvider: ({ children }: { children: import('react').ReactNode }) => children,
  useAuth: () => mockAuth,
}));

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

/**
 * Renders the app's root, with expo-router reporting the courier on
 * `segments`, and makes sure the navigator - and the guard in it - ran: a guard
 * that never ran would let anyone stay anywhere.
 */
async function openTheAppOn(...segments: string[]) {
  mockSegments.current = segments;
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RootLayout />
    </SafeAreaProvider>,
  );
  expect(mockStack.drawn).toBeGreaterThan(0);
}

beforeEach(() => {
  mockNavigation.length = 0;
  mockStack.canDismiss = true;
  mockStack.drawn = 0;
  mockSegments.current = [];
  mockAuth.session = SESSION;
  mockAuth.isRestoring = false;
});

describe('the root guard', () => {
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

  describe('without a session', () => {
    it.each([
      ['the house rules', 'rules'],
      ['the sign-in form', 'sign-in'],
    ])('leaves someone signed out on %s', async (_, segment) => {
      mockAuth.session = null;

      await openTheAppOn(segment);

      expect(mockNavigation).toEqual([]);
    });
  });
});
