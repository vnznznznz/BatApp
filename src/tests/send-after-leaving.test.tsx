import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AppState, View, type AppStateStatus } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import ComposeScreen from '@/app/(app)/compose';
import HomeScreen from '@/app/(app)/home';
import { fetchFriendships, type Friendship } from '@/features/friends/friends';
import { forgetAllDrafts } from '@/features/messages/drafts';
import {
  fetchBadges,
  fetchSentLetter,
  sendMessage,
  type Dispatch,
} from '@/features/messages/messages';
import type { Profile } from '@/features/profile/use-profile';
import { fetchRoost, type Bat } from '@/features/roost/roost';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

/** The route's params, as the compose screen reads them. */
const mockParams: { to?: string } = { to: 'user-anna' };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      dismissTo: jest.fn(),
      setParams: jest.fn(),
    }),
    useLocalSearchParams: () => mockParams,
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
  };
});

// Two screens are under test, and what one learns of the other's letter - not
// the network. Every call that reaches Supabase is replaced; the hook that
// fetches for a screen, and decides when to fetch again, is the real one.
jest.mock('@/features/roost/roost', () => ({
  ...jest.requireActual('@/features/roost/roost'),
  fetchRoost: jest.fn(),
}));

jest.mock('@/features/messages/messages', () => ({
  ...jest.requireActual('@/features/messages/messages'),
  fetchBadges: jest.fn(),
  sendMessage: jest.fn(),
  fetchSentLetter: jest.fn(),
}));

jest.mock('@/features/friends/friends', () => ({
  ...jest.requireActual('@/features/friends/friends'),
  fetchFriendships: jest.fn(),
}));

const mockCourier: Profile = {
  id: 'user-mara',
  username: 'mara',
  displayName: 'Mara Lind',
  avatarUrl: null,
  move: null,
  city: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
};
// Stable, as the real hook's is: the roost reloads the profile on focus.
const mockReloadProfile = jest.fn(() => Promise.resolve());

jest.mock('@/features/profile/use-profile', () => ({
  useProfile: () => ({
    profile: mockCourier,
    isLoading: false,
    error: null,
    reload: mockReloadProfile,
  }),
}));

const mockSession = { user: { id: 'user-mara' } };

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockedFetchRoost = jest.mocked(fetchRoost);
const mockedFetchBadges = jest.mocked(fetchBadges);
const mockedSendMessage = jest.mocked(sendMessage);
const mockedFetchSentLetter = jest.mocked(fetchSentLetter);

const NOW = new Date('2026-10-31T21:00:00Z').getTime();
const SECOND = 1000;
const HOUR = 3600 * SECOND;
const DAY = 24 * HOUR;

const anna: Friendship = {
  id: 'friendship-anna',
  status: 'accepted',
  direction: 'outgoing',
  friend: {
    id: 'user-anna',
    username: 'anna',
    displayName: 'Anna Weber',
    city: { name: 'Munich', countryCode: 'DE' },
  },
  route: { distanceKm: 504.6, flightSeconds: 22_707 },
  requestedAt: new Date(NOW - 10 * DAY),
  acceptedAt: new Date(NOW - 9 * DAY),
};

const dispatchToAnna = (): Dispatch => ({
  id: 'letter-to-anna',
  deliverAt: new Date(NOW + 6 * HOUR),
  distanceKm: 504.6,
});

const batAtHome = (slot: number): Bat => ({
  id: `bat-${slot}`,
  slot,
  status: 'available',
  flight: null,
});

const everyBatHome = () => [batAtHome(1), batAtHome(2), batAtHome(3)];

/** The roost as the server has it once the letter to Anna is stored. */
const letterInTheAir = (): Bat[] => [
  {
    id: 'bat-1',
    slot: 1,
    status: 'flying',
    flight: {
      messageId: 'letter-to-anna',
      recipient: { id: 'user-anna', username: 'anna', displayName: 'Anna Weber' },
      sentAt: new Date(NOW),
      deliverAt: new Date(NOW + 6 * HOUR),
      distanceKm: 504.6,
    },
  },
  batAtHome(2),
  batAtHome(3),
];

/** What the server would answer if asked for the roost now. */
let serverRoost: () => Bat[];

/** A request that ended without the server saying anything. */
const noAnswer = () => new RpcError('No connection. Check your network and try again.', null);

/** A promise the test settles by hand, to look at the screens while a call is out. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Fixed insets so the screens render deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * The navigator in miniature: the roost stays underneath, and the letter is on
 * top of it only while it is open. Going back removes the letter's screen
 * altogether.
 */
function Stack({ writing }: { writing: boolean }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <View testID="roost">
        <HomeScreen />
      </View>
      {writing ? (
        <View testID="letter">
          <ComposeScreen />
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}

const roost = () => within(screen.getByTestId('roost'));
const letter = () => within(screen.getByTestId('letter'));

/** The app's listeners for coming back to the front, as React Native holds them. */
const appStateListeners = new Set<(state: AppStateStatus) => void>();

type Rendered = Awaited<ReturnType<typeof render>>;

/** Opens the roost with a letter to Anna on top of it, written and ready to send. */
async function writeToAnna(text: string) {
  const view = await render(<Stack writing />);
  await roost().findByText('3 of 3 at home');
  await letter().findByText(/^3 of 3 bats at home/);
  await fireEvent.changeText(letter().getByLabelText('Your letter'), text);
  return view;
}

/**
 * The courier gives up on the spinning button and goes back. The letter's
 * screen is removed, and the roost, in front again, asks at once - as it does
 * whenever it comes back into view. This navigator has no focus to give, so
 * the roost's other reason to ask, the app coming to the front, stands in for
 * it; the only listeners left by then are the roost's own.
 */
async function goBackToTheRoost(view: Rendered) {
  await view.rerender(<Stack writing={false} />);
  await act(async () => appStateListeners.forEach((listener) => listener('active')));
}

/** "Write a letter", and Anna again. */
async function openTheLetterAgain(view: Rendered) {
  await view.rerender(<Stack writing />);
  return letter().findByLabelText('Your letter');
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  forgetAllDrafts();
  appStateListeners.clear();
  jest.mocked(AppState.addEventListener).mockImplementation((_type, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) } as ReturnType<
      typeof AppState.addEventListener
    >;
  });
  serverRoost = everyBatHome;
  mockedFetchRoost.mockReset().mockImplementation(async () => serverRoost());
  mockedFetchBadges.mockReset().mockResolvedValue({ unreadLetters: 0, friendRequests: 0 });
  jest.mocked(fetchFriendships).mockReset().mockResolvedValue([anna]);
  mockedSendMessage.mockReset();
  mockedFetchSentLetter.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * What became of a send used to be heard only by the screen that started it.
 * Left while the button was still spinning, the letter went all the same -
 * and the roost, which had asked a moment too early, went on showing every bat
 * at home. Believing nothing went, the courier wrote it again. (Found in
 * review.)
 */
describe('a send that settles after its screen was left', () => {
  it('shows on the roost the bat that left, once the letter has gone', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValue(sending.promise);
    const view = await writeToAnna('Dear Anna, did this one go?');
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));

    await goBackToTheRoost(view);
    // Asked before the letter was stored, the server still has every bat at home.
    expect(roost().getByText('3 of 3 at home')).toBeOnTheScreen();

    // Only now is the letter stored, and the send answered.
    serverRoost = letterInTheAir;
    await act(async () => sending.resolve(dispatchToAnna()));

    expect(await roost().findByText('2 of 3 at home')).toBeOnTheScreen();
    expect(
      roost().getByRole('button', { name: 'Bat 1, flying to Anna Weber, lands in 6h' }),
    ).toBeOnTheScreen();
  });

  it('asks for the counts of letters and requests again as well', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValue(sending.promise);
    const view = await writeToAnna('Dear Anna, did this one go?');
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));
    await goBackToTheRoost(view);

    mockedFetchBadges.mockResolvedValue({ unreadLetters: 2, friendRequests: 0 });
    await act(async () => sending.resolve(dispatchToAnna()));

    expect(await roost().findByText('2 new')).toBeOnTheScreen();
  });

  it('counts the bats again when the send was refused, too', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValue(sending.promise);
    const view = await writeToAnna('Dear Anna, did this one go?');
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));
    await goBackToTheRoost(view);

    // The last bat left from another phone meanwhile: that is why it was refused.
    serverRoost = letterInTheAir;
    await act(async () =>
      sending.reject(new RpcError(REFUSALS.no_available_bat, 'no_available_bat')),
    );

    expect(await roost().findByText('2 of 3 at home')).toBeOnTheScreen();
  });

  it('counts the bats again when no answer came: the letter may have gone', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValue(sending.promise);
    mockedFetchSentLetter.mockRejectedValue(noAnswer());
    const view = await writeToAnna('Dear Anna, did this one go?');
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));
    await goBackToTheRoost(view);

    serverRoost = letterInTheAir;
    await act(async () => sending.reject(noAnswer()));

    expect(await roost().findByText('2 of 3 at home')).toBeOnTheScreen();
  });

  /** A letter that went is no longer unsent: opened again, the screen is for a new one. */
  it('has nothing left to send once the letter has gone', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValue(sending.promise);
    const view = await writeToAnna('Dear Anna, did this one go?');
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));
    await goBackToTheRoost(view);
    serverRoost = letterInTheAir;
    await act(async () => sending.resolve(dispatchToAnna()));

    expect(await openTheLetterAgain(view)).toHaveDisplayValue('');
    expect(letter().queryByText('Your bat is on its way')).toBeNull();
    expect(letter().getByText(/^2 of 3 bats at home/)).toBeOnTheScreen();
  });

  it('still has the letter when the send was refused', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValue(sending.promise);
    const view = await writeToAnna('Dear Anna, did this one go?');
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));
    await goBackToTheRoost(view);
    await act(async () =>
      sending.reject(new RpcError(REFUSALS.no_available_bat, 'no_available_bat')),
    );

    expect(await openTheLetterAgain(view)).toHaveDisplayValue('Dear Anna, did this one go?');
    expect(letter().getByRole('button', { name: 'Send by bat' })).not.toBeBusy();
  });

  /**
   * No answer, and nobody there to be told. The letter is kept, with the
   * reference it may have gone under - so that, opened again, it says what is
   * not known and goes out as the same letter, not as a second one.
   */
  it('still has the letter, and knows it may have gone, when no answer came', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValueOnce(sending.promise);
    mockedFetchSentLetter.mockRejectedValue(noAnswer());
    const view = await writeToAnna('Dear Anna, did this one go?');
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));
    await goBackToTheRoost(view);
    await act(async () => sending.reject(noAnswer()));

    expect(await openTheLetterAgain(view)).toHaveDisplayValue('Dear Anna, did this one go?');
    expect(
      letter().getByText(
        'No answer came back, so your letter may or may not have gone. ' +
          'Night Courier will check again while this letter is on screen, and when you come back to it.',
      ),
    ).toBeOnTheScreen();

    mockedSendMessage.mockResolvedValue(dispatchToAnna());
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));

    expect(await letter().findByText('Your bat is on its way')).toBeOnTheScreen();
    const [first, second] = mockedSendMessage.mock.calls;
    expect(second?.[2]).toBe(first?.[2]);
  });

  /**
   * Opened again while the letter is still on its way out, the screen shows it
   * so: the button goes on spinning and the words hold still. It does not
   * offer to send what is already being sent - and it hears the answer.
   */
  it('shows the letter as still being sent when it is opened again before the answer', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValue(sending.promise);
    const view = await writeToAnna('Dear Anna, did this one go?');
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));
    await goBackToTheRoost(view);

    const field = await openTheLetterAgain(view);

    expect(field).toHaveDisplayValue('Dear Anna, did this one go?');
    expect(letter().getByRole('button', { name: 'Send by bat' })).toBeBusy();
    await fireEvent.changeText(field, 'Dear Anna, never mind.');
    expect(letter().getByLabelText('Your letter')).toHaveDisplayValue(
      'Dear Anna, did this one go?',
    );
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));
    expect(mockedSendMessage).toHaveBeenCalledTimes(1);

    serverRoost = letterInTheAir;
    await act(async () => sending.resolve(dispatchToAnna()));

    expect(await letter().findByText('Your bat is on its way')).toBeOnTheScreen();
    expect(letter().getByText(/^It will reach Anna Weber in Munich in 6h, at /)).toBeOnTheScreen();
    expect(roost().getByText('2 of 3 at home')).toBeOnTheScreen();
  });
});

/**
 * The same holds for a letter the app only later finds to have gone: the roost
 * underneath has been showing a bat at home that is in the air.
 */
describe('a letter that turns out to have gone', () => {
  it('shows on the roost as soon as the app has found that out', async () => {
    mockedSendMessage.mockRejectedValue(noAnswer());
    mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
    await writeToAnna('Dear Anna, did this one go?');
    await fireEvent.press(letter().getByRole('button', { name: 'Send by bat' }));
    await letter().findByText(/may or may not have gone/);
    expect(roost().getByText('3 of 3 at home')).toBeOnTheScreen();

    serverRoost = letterInTheAir;
    mockedFetchSentLetter.mockResolvedValue(dispatchToAnna());
    await act(() => jest.advanceTimersByTimeAsync(3 * SECOND));

    expect(await letter().findByText('Your bat is on its way')).toBeOnTheScreen();
    expect(roost().getByText('2 of 3 at home')).toBeOnTheScreen();
  });
});
