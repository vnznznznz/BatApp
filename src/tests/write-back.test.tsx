import { fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import ComposeScreen from '@/app/(app)/compose';
import LetterScreen from '@/app/(app)/letters/[id]';
import { fetchFriendships, type Friendship } from '@/features/friends/friends';
import { forgetAllDrafts } from '@/features/messages/drafts';
import { readMessage, type Letter } from '@/features/messages/messages';
import type { Profile } from '@/features/profile/use-profile';
import { fetchRoost } from '@/features/roost/roost';

const mockPush = jest.fn();
/** The route's params: the letter's id, and who a reply on top of it is for. */
const mockParams: { id: string; to?: string } = { id: 'letter-from-anna' };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn(),
      dismissTo: jest.fn(),
      setParams: jest.fn(),
    }),
    useNavigation: () => ({ isFocused: () => true }),
    useLocalSearchParams: () => mockParams,
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
  };
});

// Two screens are under test, and how a letter's words pass between them - not
// the network. Every call that reaches Supabase is replaced.
jest.mock('@/features/messages/messages', () => ({
  ...jest.requireActual('@/features/messages/messages'),
  readMessage: jest.fn(),
  sendMessage: jest.fn(),
}));

jest.mock('@/features/friends/friends', () => ({
  ...jest.requireActual('@/features/friends/friends'),
  fetchFriendships: jest.fn(),
}));

jest.mock('@/features/roost/roost', () => ({
  ...jest.requireActual('@/features/roost/roost'),
  fetchRoost: jest.fn(),
}));

const mockCourier: Profile = {
  id: 'user-mara',
  username: 'mara',
  displayName: 'Mara Lind',
  avatarUrl: null,
  move: null,
  city: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
};

jest.mock('@/features/profile/use-profile', () => ({
  useProfile: () => ({ profile: mockCourier, isLoading: false, error: null }),
}));

const mockSession = { user: { id: 'user-mara' } };

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const NOW = new Date('2026-10-31T21:00:00Z').getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** From Anna in Hamburg, landed two hours ago. */
const fromAnna: Letter = {
  id: 'letter-from-anna',
  direction: 'received',
  other: { id: 'user-anna', username: 'anna', displayName: 'Anna Weber' },
  origin: { name: 'Hamburg', countryCode: 'DE' },
  destination: { name: 'Berlin', countryCode: 'DE' },
  distanceKm: 255.3,
  sentAt: new Date(NOW - 5 * HOUR),
  deliverAt: new Date(NOW - 2 * HOUR),
  delivered: true,
  openedAt: new Date(NOW),
  body: 'Dear Mara,\n\nThe harbour was loud tonight.\n\nAnna',
};

const anna: Friendship = {
  id: 'friendship-anna',
  status: 'accepted',
  direction: 'outgoing',
  friend: {
    id: 'user-anna',
    username: 'anna',
    displayName: 'Anna Weber',
    city: { name: 'Hamburg', countryCode: 'DE' },
  },
  route: { distanceKm: 255.3, flightSeconds: 11_489 },
  requestedAt: new Date(NOW - 10 * DAY),
  acceptedAt: new Date(NOW - 9 * DAY),
};

/** Fixed insets so the screens render deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * The navigator in miniature: the letter stays underneath, and the reply is on
 * top of it only while it is open. Going back removes the reply altogether, and
 * writing back again makes a new one.
 */
function Stack({ replyOpen }: { replyOpen: boolean }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <View testID="letter">
        <LetterScreen />
      </View>
      {replyOpen ? (
        <View testID="reply">
          <ComposeScreen />
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}

type Rendered = Awaited<ReturnType<typeof render>>;

/** Presses "Write back" and opens what the letter asked the router for. */
async function writeBack(view: Rendered) {
  mockPush.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: 'Write back' }));

  const [route] = mockPush.mock.lastCall as [{ pathname: string; params: { to: string } }];
  expect(route.pathname).toBe('/compose');
  mockParams.to = route.params.to;
  await view.rerender(<Stack replyOpen />);
  return screen.findByLabelText('Your letter');
}

/** The header's arrow, a swipe from the edge, Android's back button. */
async function goBack(view: Rendered) {
  delete mockParams.to;
  await view.rerender(<Stack replyOpen={false} />);
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockPush.mockReset();
  delete mockParams.to;
  forgetAllDrafts();
  jest.mocked(readMessage).mockReset().mockResolvedValue(fromAnna);
  jest.mocked(fetchFriendships).mockReset().mockResolvedValue([anna]);
  jest
    .mocked(fetchRoost)
    .mockReset()
    .mockResolvedValue([
      { id: 'bat-1', slot: 1, status: 'available', flight: null },
      { id: 'bat-2', slot: 2, status: 'available', flight: null },
      { id: 'bat-3', slot: 3, status: 'available', flight: null },
    ]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('writing back to a letter', () => {
  /**
   * The everyday way to lose a letter, before the words were kept outside the
   * screen: half-way through a reply, go back to read what was asked - and find
   * the reply empty on returning. (Found in review.)
   */
  it('still has the reply after going back to read the letter once more', async () => {
    const view = await render(<Stack replyOpen={false} />);
    await screen.findByText(/The harbour was loud tonight/);

    await fireEvent.changeText(await writeBack(view), 'Dear Anna,\n\nWhich ship was it?');
    await goBack(view);

    expect(screen.queryByLabelText('Your letter')).toBeNull();
    expect(screen.getByText(/The harbour was loud tonight/)).toBeOnTheScreen();

    expect(await writeBack(view)).toHaveDisplayValue('Dear Anna,\n\nWhich ship was it?');
  });
});
