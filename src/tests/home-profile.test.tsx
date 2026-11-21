import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import HomeScreen from '@/app/(app)/home';
import { fetchBadges } from '@/features/messages/messages';
import { fetchRoost } from '@/features/roost/roost';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work, measured at over five
// on four cores, that would otherwise count against whichever test runs first.
jest.setTimeout(20_000);

/**
 * Stands in for navigation focus. There is no navigator here, so mounting is
 * the first focus, and `comeBack()` is the roost coming into view again from
 * the profile screen or the city picker - which is when `useFocusEffect` runs
 * its effect again.
 */
const mockFocus = { returns: new Set<() => void>() };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      const [visit, setVisit] = React.useState(0);
      React.useEffect(() => {
        const comeBack = () => setVisit((count) => count + 1);
        mockFocus.returns.add(comeBack);
        return () => {
          mockFocus.returns.delete(comeBack);
        };
      }, []);
      React.useEffect(() => effect(), [effect, visit]);
    },
  };
});

jest.mock('@/features/roost/roost', () => ({
  ...jest.requireActual('@/features/roost/roost'),
  fetchRoost: jest.fn(),
}));

jest.mock('@/features/messages/messages', () => ({
  ...jest.requireActual('@/features/messages/messages'),
  fetchBadges: jest.fn(),
}));

const mockSession = { user: { id: 'user-mara' } };

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: mockSession }),
}));

/** The table each query was made of, in order: one call for each request. */
const mockQueried = jest.fn<void, [table: string]>();

// The screen is under test together with the hook that reads the profile: that
// hook is the real one, and only Supabase's client is replaced. Whatever the
// hook builds on a query, awaiting it answers with the courier's row.
jest.mock('@/lib/supabase', () => {
  const answer = {
    data: {
      id: 'user-mara',
      username: 'mara',
      display_name: 'Mara Lind',
      avatar_url: null,
      city_changed_at: null,
      cities: { id: 2950159, name: 'Berlin', country_code: 'DE' },
      settled: null,
    },
    error: null,
  };
  const query: object = new Proxy(
    {},
    {
      get: (_target, step) =>
        step === 'then' ? (settle: (value: unknown) => unknown) => settle(answer) : () => query,
    },
  );
  return {
    supabase: {
      from: (table: string) => {
        mockQueried(table);
        return query;
      },
    },
  };
});

const NOW = new Date('2026-10-31T21:00:00Z').getTime();

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderRoost = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <HomeScreen />
    </SafeAreaProvider>,
  );

/** How often the profile has been asked for so far. */
const profileRequests = () =>
  mockQueried.mock.calls.filter(([table]) => table === 'profiles').length;

async function comeBack() {
  await act(async () => mockFocus.returns.forEach((again) => again()));
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockQueried.mockClear();
  jest
    .mocked(fetchRoost)
    .mockReset()
    .mockResolvedValue([
      { id: 'bat-1', slot: 1, status: 'available', flight: null },
      { id: 'bat-2', slot: 2, status: 'available', flight: null },
      { id: 'bat-3', slot: 3, status: 'available', flight: null },
    ]);
  jest.mocked(fetchBadges).mockReset().mockResolvedValue({ unreadLetters: 0, friendRequests: 0 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the roost and the profile it shows', () => {
  /**
   * The hook asks for the profile when the screen opens. The roost also asked,
   * because it reads the profile again whenever it comes into view, and opening
   * is the first time it does: two requests for the same row at every start.
   * (Found in review.)
   */
  it('asks for the profile once as it opens', async () => {
    await renderRoost();

    expect(await screen.findByText('Mara Lind')).toBeOnTheScreen();
    expect(screen.getByText('@mara · Berlin, DE')).toBeOnTheScreen();
    await screen.findByText('3 of 3 at home');
    expect(profileRequests()).toBe(1);
  });

  // The profile screen and the city picker both change what the roost shows,
  // and the courier comes back here from each of them. Once each time: the hook
  // reads the profile again as the screen comes into view, and the roost did as
  // well, which made two requests for the row at every return. (Found in the
  // merged tree.)
  it('asks for it again, once, each time the roost comes back into view', async () => {
    await renderRoost();
    await screen.findByText('Mara Lind');
    expect(profileRequests()).toBe(1);

    await comeBack();
    expect(profileRequests()).toBe(2);

    await comeBack();
    expect(profileRequests()).toBe(3);
  });
});
