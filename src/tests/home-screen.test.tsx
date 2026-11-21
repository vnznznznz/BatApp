import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import HomeScreen from '@/app/(app)/home';
import { BATS_PER_USER } from '@/constants/config';
import { fetchBadges } from '@/features/messages/messages';
import type { Profile } from '@/features/profile/use-profile';
import { fetchRoost, roostChanged, type Bat, type Person } from '@/features/roost/roost';
import { formatTimestamp } from '@/lib/format';
import { RpcError } from '@/lib/rpc-error';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work, measured at over five
// on four cores, that would otherwise count against whichever test runs first.
jest.setTimeout(20_000);

const mockPush = jest.fn();

/**
 * Stands in for navigation focus. There is no navigator here, so mounting is
 * the first focus, and `comeBackToRoost()` is the roost coming into view again
 * from another screen - which is when `useFocusEffect` runs its effect again.
 */
const mockFocus = { returns: new Set<() => void>() };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
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

// The screen is under test, not the network. The fetchers are replaced; the
// pure helpers that read a roost are kept, so the counts on screen are real.
jest.mock('@/features/roost/roost', () => ({
  ...jest.requireActual('@/features/roost/roost'),
  fetchRoost: jest.fn(),
}));

jest.mock('@/features/messages/messages', () => ({
  ...jest.requireActual('@/features/messages/messages'),
  fetchBadges: jest.fn(),
}));

const mockProfileState: {
  profile: Profile | null;
  isLoading: boolean;
  isGone: boolean;
  error: string | null;
} = {
  profile: null,
  isLoading: false,
  isGone: false,
  error: null,
};
// Stable, as the real hook's is: a new function on every render would read as
// a new focus on every render.
const mockReloadProfile = jest.fn(() => Promise.resolve());
const mockReloadProfileOnFocus = () => void mockReloadProfile();

// As the real hook does, it reads the profile each time the screen comes into
// view, the first time included.
jest.mock('@/features/profile/use-profile', () => {
  const { useFocusEffect } = jest.requireMock<typeof import('expo-router')>('expo-router');
  return {
    useProfile: () => {
      useFocusEffect(mockReloadProfileOnFocus);
      return { ...mockProfileState, reload: mockReloadProfile };
    },
  };
});

const mockSignOut = jest.fn(() => Promise.resolve());

// Signing out is the one thing the roost asks of the session: for an account
// that is gone, it is all there is left to do.
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

const mockedFetchRoost = jest.mocked(fetchRoost);
const mockedFetchBadges = jest.mocked(fetchBadges);

/** A fixed moment, so every countdown on screen is exact. */
const NOW = new Date('2026-10-31T21:00:00Z').getTime();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const courier: Profile = {
  id: 'user-mara',
  username: 'mara',
  displayName: 'Mara Lind',
  avatarUrl: null,
  move: null,
  city: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
};

const anna: Person = { id: 'user-anna', username: 'anna', displayName: 'Anna Weber' };

function batAtHome(slot: number): Bat {
  return { id: `bat-${slot}`, slot, status: 'available', flight: null };
}

/** A bat carrying a letter to Anna, landing `landsIn` ms after the fixed now. */
function batInFlight(slot: number, landsIn: number, messageId = `letter-${slot}`): Bat {
  return {
    id: `bat-${slot}`,
    slot,
    status: 'flying',
    flight: {
      messageId,
      recipient: anna,
      sentAt: new Date(NOW - HOUR),
      deliverAt: new Date(NOW + landsIn),
      distanceKm: 312,
    },
  };
}

/** Fresh objects on every call, as the real fetcher returns. */
const serve = (roost: () => Bat[]) => mockedFetchRoost.mockImplementation(async () => roost());

const everyBatHome = () => [batAtHome(1), batAtHome(2), batAtHome(3)];

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

/** Resolves once the roost has loaded and its count is on screen. */
const roostLoaded = () => screen.findByText(/^\d+ of \d+ at home$/);

const writeButton = () => screen.getByRole('button', { name: 'Write a letter' });

const tryAgainButton = () => screen.getByRole('button', { name: 'Try again' });

/** What every request ends with while there is no connection: no answer, and no refusal. */
const NO_CONNECTION = 'No connection. Check your network and try again.';
const noConnection = () => new RpcError(NO_CONNECTION, null);

const PROFILE_NOT_LOADED = 'Your profile could not be loaded. Check your connection.';
const ACCOUNT_GONE =
  'This account no longer exists: it has been deleted or removed. ' +
  'All that is left to do is to sign out.';

/** A promise the test settles by hand, to look at the screen while a call is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/**
 * Lets time pass as it does on a phone: a second at a time, with the screen
 * rendering in between. One long act() would hold every update until its end,
 * so a timer that only a re-render arms would never get the chance to fire.
 */
async function letTimePass(ms: number) {
  for (let left = ms; left > 0; left -= SECOND) {
    await act(() => jest.advanceTimersByTimeAsync(Math.min(SECOND, left)));
  }
}

async function comeBackToRoost() {
  await act(async () => mockFocus.returns.forEach((comeBack) => comeBack()));
}

/**
 * The refresh control has no role or label to find it by, so it is picked out
 * by its native type and sent the event the native view sends on a pull.
 */
async function pullToRefresh() {
  const [control] = screen.container.queryAll((node) => node.type === 'RCTRefreshControl');
  if (!control) throw new Error('The roost has no refresh control.');
  await fireEvent(control, 'refresh');
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockPush.mockClear();
  mockReloadProfile.mockReset();
  mockReloadProfile.mockImplementation(() => Promise.resolve());
  mockProfileState.profile = courier;
  mockProfileState.isLoading = false;
  mockProfileState.isGone = false;
  mockProfileState.error = null;
  mockSignOut.mockClear();
  mockedFetchRoost.mockReset();
  serve(everyBatHome);
  mockedFetchBadges.mockReset();
  mockedFetchBadges.mockResolvedValue({ unreadLetters: 0, friendRequests: 0 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('HomeScreen', () => {
  describe('the courier', () => {
    it("shows the courier's name, username and city", async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.getByText('Mara Lind')).toBeOnTheScreen();
      expect(screen.getByText('@mara · Berlin, DE')).toBeOnTheScreen();
    });

    it('shows only the username until a city is chosen', async () => {
      mockProfileState.profile = { ...courier, city: null };
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.getByText('@mara')).toBeOnTheScreen();
    });

    /**
     * A new city takes a day to count. Until then the header named the new
     * city and said nothing of the old one, which the bats still leave from;
     * the profile and the compose screen both say it. (Found in review.)
     */
    it('says, while a move settles, that the bats still leave from the old city', async () => {
      const settlesAt = new Date(NOW + 20 * HOUR);
      mockProfileState.profile = {
        ...courier,
        city: { id: 2911298, name: 'Hamburg', countryCode: 'DE' },
        move: { from: { id: 2950159, name: 'Berlin', countryCode: 'DE' }, settlesAt },
      };
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.getByText('@mara · Hamburg, DE')).toBeOnTheScreen();
      expect(
        screen.getByText(
          `Your bats still leave from Berlin, DE until ${formatTimestamp(settlesAt, new Date(NOW))}, when your move settles.`,
        ),
      ).toBeOnTheScreen();
    });

    it('says nothing of a move when none is settling', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.queryByText(/still leave from/)).toBeNull();
    });

    /**
     * The roost stays open under every other screen, for hours. A move that
     * has settled must not go on being announced until the profile happens to
     * be read again.
     */
    it('stops saying so the moment the move has settled', async () => {
      mockProfileState.profile = {
        ...courier,
        city: { id: 2911298, name: 'Hamburg', countryCode: 'DE' },
        move: {
          from: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
          settlesAt: new Date(NOW + 2 * MINUTE),
        },
      };
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      await letTimePass(2 * MINUTE - SECOND);
      expect(screen.getByText(/^Your bats still leave from Berlin, DE until /)).toBeOnTheScreen();

      await letTimePass(SECOND);
      expect(screen.queryByText(/still leave from/)).toBeNull();
      expect(screen.getByText('@mara · Hamburg, DE')).toBeOnTheScreen();
    });

    it('does not show a placeholder name while the profile is loading', async () => {
      mockProfileState.profile = null;
      mockProfileState.isLoading = true;
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.queryByText('Courier')).toBeNull();
      expect(screen.queryByText(/^@/)).toBeNull();
    });

    // Found by this test: the header treated "not loading" as "loaded", so a
    // profile that failed to load - no connection at launch - showed the
    // placeholder "Courier" over a bare "@", and the hook's error went unread.
    it('says why the profile is missing instead of showing an empty username', async () => {
      mockProfileState.profile = null;
      mockProfileState.isLoading = false;
      mockProfileState.error = 'Your profile could not be loaded. Check your connection.';
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.queryByText('@')).toBeNull();
      expect(
        screen.getByText('Your profile could not be loaded. Check your connection.'),
      ).toBeOnTheScreen();
    });
  });

  describe('the roost', () => {
    it('shows each of the three bats', async () => {
      await renderScreen(<HomeScreen />);

      expect(await screen.findAllByRole('button', { name: /^Bat \d, / })).toHaveLength(
        BATS_PER_USER,
      );
      expect(screen.getByRole('button', { name: 'Bat 1, at home' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Bat 2, at home' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Bat 3, at home' })).toBeOnTheScreen();
    });

    it('shows who a flying bat is carrying a letter to, and how long until it lands', async () => {
      serve(() => [
        batAtHome(1),
        batInFlight(2, 2 * HOUR + 30 * MINUTE + 30 * SECOND),
        batAtHome(3),
      ]);
      await renderScreen(<HomeScreen />);

      const tile = await screen.findByRole('button', {
        name: 'Bat 2, flying to Anna Weber, lands in 2h 30m',
      });
      expect(within(tile).getByText('In flight')).toBeOnTheScreen();
      expect(within(tile).getByText('to Anna Weber')).toBeOnTheScreen();
      expect(within(tile).getByText('2h 30m')).toBeOnTheScreen();
    });

    /**
     * The client never decides when a letter lands. Each countdown runs toward
     * the arrival time the server set when the letter left; the clock on the
     * phone only moves it along.
     */
    it('counts each flight down to the arrival time the server set', async () => {
      serve(() => [
        batInFlight(1, 12 * MINUTE + 30 * SECOND),
        batInFlight(2, 7 * HOUR + 42 * MINUTE + 30 * SECOND),
        batAtHome(3),
      ]);
      await renderScreen(<HomeScreen />);

      expect(await screen.findByText('12m')).toBeOnTheScreen();
      expect(screen.getByText('7h 42m')).toBeOnTheScreen();

      await letTimePass(MINUTE);

      expect(screen.getByText('11m')).toBeOnTheScreen();
      expect(screen.getByText('7h 41m')).toBeOnTheScreen();
    });

    it('counts how many bats are at home', async () => {
      serve(() => [batAtHome(1), batInFlight(2, HOUR), batAtHome(3)]);
      await renderScreen(<HomeScreen />);

      expect(await screen.findByText('2 of 3 at home')).toBeOnTheScreen();
    });

    /**
     * Every figure on the roost is the server's. Were the server ever to
     * disagree with the constant, the screen shows the bats that exist rather
     * than the number it was promised.
     */
    it('counts the bats the server returned rather than assuming three', async () => {
      serve(() => [batAtHome(1), batInFlight(2, HOUR)]);
      await renderScreen(<HomeScreen />);

      expect(await screen.findByText('1 of 2 at home')).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: /^Bat \d, / })).toHaveLength(2);
    });

    it('opens the letter a flying bat is carrying', async () => {
      serve(() => [batAtHome(1), batInFlight(2, HOUR, 'letter-to-anna'), batAtHome(3)]);
      await renderScreen(<HomeScreen />);

      await fireEvent.press(
        await screen.findByRole('button', { name: /^Bat 2, flying to Anna Weber/ }),
      );

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/letters/[id]',
        params: { id: 'letter-to-anna' },
      });
    });

    it('starts a letter from a bat that is home', async () => {
      await renderScreen(<HomeScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Bat 1, at home' }));

      expect(mockPush).toHaveBeenCalledWith('/compose');
    });

    it('says so when the roost cannot be loaded', async () => {
      mockedFetchRoost.mockRejectedValue(
        new Error('Your roost could not be loaded. Check your connection.'),
      );
      await renderScreen(<HomeScreen />);

      expect(
        await screen.findByText('Your roost could not be loaded. Check your connection.'),
      ).toBeOnTheScreen();
      expect(screen.queryAllByRole('button', { name: /^Bat \d, / })).toHaveLength(0);
      expect(writeButton()).toBeDisabled();
    });
  });

  describe('writing a letter', () => {
    it('can start a letter while at least one bat is home', async () => {
      serve(() => [batInFlight(1, HOUR), batAtHome(2), batInFlight(3, 2 * HOUR)]);
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(writeButton()).toBeEnabled();
      await fireEvent.press(writeButton());

      expect(mockPush).toHaveBeenCalledWith('/compose');
    });

    it('cannot start a letter when every bat is out, and says when the next one is home', async () => {
      serve(() => [
        batInFlight(1, 3 * HOUR),
        batInFlight(2, 45 * MINUTE + 30 * SECOND),
        batInFlight(3, 2 * HOUR),
      ]);
      await renderScreen(<HomeScreen />);

      expect(await screen.findByText('0 of 3 at home')).toBeOnTheScreen();
      expect(writeButton()).toBeDisabled();
      expect(
        screen.getByText(`All ${BATS_PER_USER} bats are out. The next one is home in 45m.`),
      ).toBeOnTheScreen();

      await fireEvent.press(writeButton());

      expect(mockPush).not.toHaveBeenCalled();
    });

    it('keeps the hint counting down to the next homecoming', async () => {
      serve(() => [
        batInFlight(1, 45 * MINUTE + 30 * SECOND),
        batInFlight(2, 2 * HOUR),
        batInFlight(3, 3 * HOUR),
      ]);
      await renderScreen(<HomeScreen />);
      expect(await screen.findByText(/The next one is home in 45m\.$/)).toBeOnTheScreen();

      await letTimePass(MINUTE);

      expect(screen.getByText(/The next one is home in 44m\.$/)).toBeOnTheScreen();
    });

    // Found by this test: the hint spliced formatDuration's "any moment now"
    // into "home in ...", so once the next bat was due it read "The next one
    // is home in any moment now."
    it('does not say the next bat is home "in any moment now" once it is due', async () => {
      serve(() => [batInFlight(1, 10 * SECOND), batInFlight(2, HOUR), batInFlight(3, 2 * HOUR)]);
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      await letTimePass(10 * SECOND);

      expect(
        screen.getByText(new RegExp(`^All ${BATS_PER_USER} bats are out\\.`)),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/home in any moment now/)).toBeNull();
    });

    /**
     * Three bats, never more. A courier with every bat out waits for one to
     * come home; nothing on the screen offers a way to pay instead.
     */
    it('never offers a way to buy more bats, even with every bat out', async () => {
      serve(() => [batInFlight(1, HOUR), batInFlight(2, 2 * HOUR), batInFlight(3, 3 * HOUR)]);
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(
        screen.queryAllByText(/buy|purchase|upgrade|premium|subscri|unlock|more bats|extra bat/i),
      ).toHaveLength(0);
    });

    it('asks for a city before any letter can be sent', async () => {
      mockProfileState.profile = { ...courier, city: null };
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(
        screen.getByText('Your bats have nowhere to fly from until they know where home is.'),
      ).toBeOnTheScreen();
      expect(screen.getByText('Choose your city before sending a letter.')).toBeOnTheScreen();
      expect(writeButton()).toBeDisabled();
      // A bat at home cannot start one either.
      expect(screen.getByRole('button', { name: 'Bat 1, at home' })).toBeDisabled();

      await fireEvent.press(screen.getByRole('button', { name: 'Choose your city' }));

      expect(mockPush).toHaveBeenCalledWith('/city-picker');
    });

    it('does not ask for a city once one is chosen', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.queryByText('Choose your city')).toBeNull();
      expect(screen.queryByText('Choose your city before sending a letter.')).toBeNull();
    });

    it('does not offer to write until it knows a bat is home', async () => {
      mockedFetchRoost.mockReturnValue(new Promise<Bat[]>(() => {}));
      await renderScreen(<HomeScreen />);

      expect(writeButton()).toBeDisabled();
      expect(screen.queryByText(/at home$/)).toBeNull();
    });
  });

  describe('everything else', () => {
    it('shows how many letters are unread and how many friends are waiting for an answer', async () => {
      mockedFetchBadges.mockResolvedValue({ unreadLetters: 3, friendRequests: 2 });
      await renderScreen(<HomeScreen />);

      expect(await screen.findByLabelText('3 unread letters')).toBeOnTheScreen();
      expect(screen.getByText('3 new')).toBeOnTheScreen();
      expect(screen.getByLabelText('2 friend requests')).toBeOnTheScreen();
      expect(screen.getByText('2 waiting for your answer')).toBeOnTheScreen();
    });

    it('shows no counts when nothing is waiting', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.getByText('Received and sent')).toBeOnTheScreen();
      expect(screen.getByText('Add friends by their username')).toBeOnTheScreen();
      expect(screen.queryByLabelText(/unread letters$/)).toBeNull();
      expect(screen.queryByLabelText(/friend requests$/)).toBeNull();
    });

    it('leads to letters, friends and the profile', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      await fireEvent.press(screen.getByText('Letters'));
      expect(mockPush).toHaveBeenLastCalledWith('/letters');

      await fireEvent.press(screen.getByText('Friends'));
      expect(mockPush).toHaveBeenLastCalledWith('/friends');

      await fireEvent.press(screen.getByText('Your profile'));
      expect(mockPush).toHaveBeenLastCalledWith('/profile');
    });

    // Signing out and deleting the account moved to the profile screen.
    it('keeps signing out and deleting the account off the roost', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.queryByText('Sign out')).toBeNull();
      expect(screen.queryAllByText(/delete/i)).toHaveLength(0);
    });
  });

  /**
   * Opened with no signal, the roost used to say "try again" with nothing on
   * screen to try it with, and stayed that way until the courier thought to
   * pull down, which nothing said to do. (Found in review.)
   */
  describe('when something could not be loaded', () => {
    it('offers to try again when the roost cannot be loaded, and then loads the roost, the counts and the profile', async () => {
      mockedFetchRoost.mockRejectedValueOnce(noConnection());
      mockedFetchBadges.mockRejectedValueOnce(noConnection());
      await renderScreen(<HomeScreen />);
      expect(await screen.findByText(NO_CONNECTION)).toBeOnTheScreen();
      mockReloadProfile.mockClear();

      // The connection is back.
      mockedFetchBadges.mockResolvedValue({ unreadLetters: 2, friendRequests: 0 });
      await fireEvent.press(tryAgainButton());

      expect(await screen.findByText('3 of 3 at home')).toBeOnTheScreen();
      expect(screen.getByText('2 new')).toBeOnTheScreen();
      expect(mockReloadProfile).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(NO_CONNECTION)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('shows that it is trying again, and offers it once more if that fails too', async () => {
      mockedFetchRoost.mockRejectedValueOnce(noConnection());
      await renderScreen(<HomeScreen />);
      await screen.findByText(NO_CONNECTION);

      const secondTry = deferred<Bat[]>();
      mockedFetchRoost.mockReturnValueOnce(secondTry.promise);
      await fireEvent.press(tryAgainButton());

      expect(tryAgainButton()).toBeBusy();
      expect(tryAgainButton()).toBeDisabled();

      await act(async () => secondTry.reject(noConnection()));

      expect(tryAgainButton()).not.toBeBusy();
      expect(tryAgainButton()).toBeEnabled();
      expect(screen.getByText(NO_CONNECTION)).toBeOnTheScreen();
    });

    it('offers to try again when only the profile could not be loaded', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = PROFILE_NOT_LOADED;
      await renderScreen(<HomeScreen />);
      await roostLoaded();
      expect(screen.getByText(PROFILE_NOT_LOADED)).toBeOnTheScreen();

      // The connection is back: the next load of the profile succeeds.
      mockReloadProfile.mockClear();
      mockReloadProfile.mockImplementation(async () => {
        mockProfileState.profile = courier;
        mockProfileState.error = null;
      });
      await fireEvent.press(tryAgainButton());

      expect(await screen.findByText('Mara Lind')).toBeOnTheScreen();
      expect(mockReloadProfile).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(PROFILE_NOT_LOADED)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    /**
     * An account that is gone has nothing to try again and nothing to write
     * with. The roost offered both, under "All that is left to do is to sign
     * out". (Found in the merged tree.)
     */
    it('offers only the way out when the account is gone', async () => {
      mockProfileState.profile = null;
      mockProfileState.isGone = true;
      mockProfileState.error = ACCOUNT_GONE;
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.getByText(ACCOUNT_GONE)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(writeButton()).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Bat 1, at home' })).toBeDisabled();

      await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('offers no try again for the bats either when the account is gone', async () => {
      mockProfileState.profile = null;
      mockProfileState.isGone = true;
      mockProfileState.error = ACCOUNT_GONE;
      mockedFetchRoost.mockRejectedValue(noConnection());
      await renderScreen(<HomeScreen />);

      expect(await screen.findByText(NO_CONNECTION)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
    });

    /**
     * Without a network, an hour after the app was last used, the first loads
     * wait about half a minute behind the session's renewal before they fail,
     * and the roost showed spinners and nothing else. (Found in the browser.)
     */
    it('says that it is still trying when the bats take long to load', async () => {
      mockedFetchRoost.mockReturnValue(new Promise<Bat[]>(() => {}));
      await renderScreen(<HomeScreen />);
      await letTimePass(4 * SECOND);
      expect(screen.queryByText('Still trying to reach Night Courier…')).toBeNull();

      await letTimePass(SECOND);

      expect(screen.getByText('Still trying to reach Night Courier…')).toBeOnTheScreen();
    });

    it('says nothing of trying once the bats are in', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      await letTimePass(10 * SECOND);

      expect(screen.queryByText('Still trying to reach Night Courier…')).toBeNull();
    });

    // Without a connection all of it fails at once. One way out is enough.
    it('offers it once when neither the roost nor the profile could be loaded', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = PROFILE_NOT_LOADED;
      mockedFetchRoost.mockRejectedValue(noConnection());
      mockedFetchBadges.mockRejectedValue(noConnection());
      await renderScreen(<HomeScreen />);

      expect(await screen.findByText(NO_CONNECTION)).toBeOnTheScreen();
      expect(screen.getByText(PROFILE_NOT_LOADED)).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
    });

    it('offers nothing to try again while everything is there', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('offers nothing to try again while the roost is still loading for the first time', async () => {
      mockedFetchRoost.mockReturnValue(new Promise<Bat[]>(() => {}));
      await renderScreen(<HomeScreen />);

      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    /**
     * A roost that is on screen stays there when a later fetch fails; the
     * failure is said beneath it, and the screen asks again by itself. The
     * button is for when there is nothing to show.
     */
    it('keeps the bats it has, without the button, when a later fetch fails', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      mockedFetchRoost.mockRejectedValue(noConnection());
      await pullToRefresh();

      expect(await screen.findByText(NO_CONNECTION)).toBeOnTheScreen();
      expect(screen.getByText('3 of 3 at home')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    /**
     * "Received and sent" and "Add friends by their username" are what the two
     * rows say when nothing is waiting. Said when nobody could check, they
     * would be read as "nothing new". (Found in review.)
     */
    it('does not say that nothing is new when the counts could not be checked', async () => {
      mockedFetchBadges.mockRejectedValue(new RpcError('Could not check for new letters.', null));
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(await screen.findByText('Could not check for new letters')).toBeOnTheScreen();
      expect(screen.getByText('Could not check for friend requests')).toBeOnTheScreen();
      expect(screen.queryByText('Received and sent')).toBeNull();
      expect(screen.queryByText('Add friends by their username')).toBeNull();
      // The rows still lead where they lead.
      await fireEvent.press(screen.getByText('Letters'));
      expect(mockPush).toHaveBeenLastCalledWith('/letters');
    });

    it('says what is waiting again once the counts can be checked', async () => {
      mockedFetchBadges.mockRejectedValueOnce(noConnection());
      await renderScreen(<HomeScreen />);
      await roostLoaded();
      expect(await screen.findByText('Could not check for new letters')).toBeOnTheScreen();

      mockedFetchBadges.mockResolvedValue({ unreadLetters: 0, friendRequests: 1 });
      await pullToRefresh();

      expect(await screen.findByText('1 waiting for your answer')).toBeOnTheScreen();
      expect(screen.getByText('Received and sent')).toBeOnTheScreen();
      expect(screen.queryByText(/^Could not check/)).toBeNull();
    });

    // The last counts known are better than none, as with the bats above.
    it('keeps the counts it had when a later check fails', async () => {
      mockedFetchBadges.mockResolvedValue({ unreadLetters: 3, friendRequests: 0 });
      await renderScreen(<HomeScreen />);
      expect(await screen.findByText('3 new')).toBeOnTheScreen();

      mockedFetchBadges.mockRejectedValue(noConnection());
      await pullToRefresh();
      await roostLoaded();

      expect(screen.getByText('3 new')).toBeOnTheScreen();
      expect(screen.getByText('Add friends by their username')).toBeOnTheScreen();
      expect(screen.queryByText(/^Could not check/)).toBeNull();
    });

    /**
     * Only a courier known to have no city is kept from writing. One whose
     * profile could not be loaded is not: the server knows where home is, and
     * refuses a sender without a city itself.
     */
    it('can start a letter although the profile could not be loaded', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = PROFILE_NOT_LOADED;
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(writeButton()).toBeEnabled();
      await fireEvent.press(writeButton());
      expect(mockPush).toHaveBeenLastCalledWith('/compose');

      mockPush.mockClear();
      await fireEvent.press(screen.getByRole('button', { name: 'Bat 1, at home' }));
      expect(mockPush).toHaveBeenLastCalledWith('/compose');
    });

    it('still waits for a profile that is on its way before offering to write', async () => {
      mockProfileState.profile = null;
      mockProfileState.isLoading = true;
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(writeButton()).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Bat 1, at home' })).toBeDisabled();
    });

    it('cannot start a letter with no bat at home, whatever became of the profile', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = PROFILE_NOT_LOADED;
      serve(() => [batInFlight(1, HOUR), batInFlight(2, 2 * HOUR), batInFlight(3, 3 * HOUR)]);
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(writeButton()).toBeDisabled();
    });
  });

  describe('staying current', () => {
    // The profile screen and the city picker both change what the roost shows,
    // and the courier comes back here from each of them. The hook reads the
    // profile again by itself; the screen asking as well made two requests for
    // the row at every return. (Found in the merged tree; home-profile.test.tsx
    // counts the requests with the real hook.)
    it('reloads the profile, the roost and the counts when the roost comes back into view', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      await comeBackToRoost();

      expect(mockReloadProfile).toHaveBeenCalledTimes(2);
      expect(mockedFetchRoost).toHaveBeenCalledTimes(2);
      expect(mockedFetchBadges).toHaveBeenCalledTimes(2);

      await comeBackToRoost();

      expect(mockReloadProfile).toHaveBeenCalledTimes(3);
    });

    /**
     * The hook that reads the profile asks for it itself when the screen
     * opens. Asking here as well made two requests for the same row at every
     * start. (Found in review.)
     */
    it('does not ask for the profile a second time as it opens', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(mockReloadProfile).toHaveBeenCalledTimes(1);
    });

    /**
     * Fetching is what lands a letter: the server delivers whatever is due
     * before it answers. So the screen asks again once the next bat is due,
     * and the bat comes home without anyone pulling to refresh.
     */
    it('fetches the roost again once the next bat is due, and shows it home', async () => {
      serve(() => [batInFlight(1, 2 * MINUTE), batAtHome(2), batAtHome(3)]);
      await renderScreen(<HomeScreen />);
      expect(await screen.findByText('2 of 3 at home')).toBeOnTheScreen();

      // The server has landed the letter by the time it is next asked.
      serve(everyBatHome);
      await letTimePass(MINUTE);
      expect(mockedFetchRoost).toHaveBeenCalledTimes(1);

      await letTimePass(MINUTE + 2 * SECOND);

      expect(mockedFetchRoost).toHaveBeenCalledTimes(2);
      expect(await screen.findByText('3 of 3 at home')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Bat 1, at home' })).toBeOnTheScreen();
    });

    /**
     * The roost is where the courier waits. Whenever it asks the server for
     * the bats it asks for the counts as well, so a letter that has landed here
     * in the meantime, or a friend who has asked, is not left unannounced
     * until the courier leaves the screen and comes back.
     */
    it('fetches the counts again too once the next bat is due', async () => {
      serve(() => [batInFlight(1, 2 * MINUTE), batAtHome(2), batAtHome(3)]);
      await renderScreen(<HomeScreen />);
      expect(await screen.findByText('2 of 3 at home')).toBeOnTheScreen();
      expect(screen.getByText('Received and sent')).toBeOnTheScreen();

      // Meanwhile a letter has landed for the courier, and a friend has asked.
      serve(everyBatHome);
      mockedFetchBadges.mockResolvedValue({ unreadLetters: 1, friendRequests: 1 });
      await letTimePass(MINUTE);
      expect(mockedFetchBadges).toHaveBeenCalledTimes(1);

      await letTimePass(MINUTE + 2 * SECOND);

      expect(mockedFetchBadges).toHaveBeenCalledTimes(2);
      expect(screen.getByText('1 new')).toBeOnTheScreen();
      expect(screen.getByText('1 waiting for your answer')).toBeOnTheScreen();
    });

    /**
     * The server lands a letter only once its own clock says it is due. A phone
     * running a few seconds fast asks too early and is told the bat is still
     * out; the screen has to ask again rather than leave it at "any moment now"
     * until the courier thinks to pull to refresh.
     */
    it('keeps asking until the server has landed an overdue bat', async () => {
      const oneInTheAir = () => [batInFlight(1, MINUTE), batAtHome(2), batAtHome(3)];
      mockedFetchRoost
        .mockImplementationOnce(async () => oneInTheAir())
        .mockImplementationOnce(async () => oneInTheAir())
        .mockImplementation(async () => everyBatHome());
      await renderScreen(<HomeScreen />);
      expect(await screen.findByText('2 of 3 at home')).toBeOnTheScreen();

      await letTimePass(2 * MINUTE);

      expect(screen.getByText('3 of 3 at home')).toBeOnTheScreen();
      // On opening, once too early for the server, and once more.
      expect(mockedFetchRoost).toHaveBeenCalledTimes(3);
    });

    it('asks again after a failed fetch while a bat is overdue', async () => {
      serve(() => [batInFlight(1, MINUTE), batAtHome(2), batAtHome(3)]);
      await renderScreen(<HomeScreen />);
      expect(await screen.findByText('2 of 3 at home')).toBeOnTheScreen();

      mockedFetchRoost
        .mockRejectedValueOnce(new Error('No connection. Check your network and try again.'))
        .mockImplementation(async () => everyBatHome());
      await letTimePass(2 * MINUTE);

      expect(screen.getByText('3 of 3 at home')).toBeOnTheScreen();
      expect(screen.queryByText('No connection. Check your network and try again.')).toBeNull();
    });

    it('does not keep asking while no bat is in the air', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      await letTimePass(5 * MINUTE);

      expect(mockedFetchRoost).toHaveBeenCalledTimes(1);
    });

    /**
     * A letter can leave after the screen that sent it has gone, when this one
     * is in front again and has already asked. Told that the roost has changed,
     * it asks once more. (Found in review.)
     */
    it('fetches the roost and the counts again when told that the roost has changed', async () => {
      await renderScreen(<HomeScreen />);
      expect(await screen.findByText('3 of 3 at home')).toBeOnTheScreen();

      serve(() => [batInFlight(1, HOUR), batAtHome(2), batAtHome(3)]);
      mockedFetchBadges.mockResolvedValue({ unreadLetters: 1, friendRequests: 0 });
      await act(async () => roostChanged());

      expect(await screen.findByText('2 of 3 at home')).toBeOnTheScreen();
      expect(screen.getByText('1 new')).toBeOnTheScreen();
      expect(mockedFetchRoost).toHaveBeenCalledTimes(2);
    });

    it('no longer asks once it is gone', async () => {
      const view = await renderScreen(<HomeScreen />);
      await roostLoaded();
      await view.unmount();

      roostChanged();

      expect(mockedFetchRoost).toHaveBeenCalledTimes(1);
    });

    it('fetches the roost, the counts and the profile again when pulled down', async () => {
      await renderScreen(<HomeScreen />);
      expect(await screen.findByText('3 of 3 at home')).toBeOnTheScreen();
      mockReloadProfile.mockClear();

      // Meanwhile a letter left from another phone, and one arrived.
      serve(() => [batInFlight(1, HOUR), batAtHome(2), batAtHome(3)]);
      mockedFetchBadges.mockResolvedValue({ unreadLetters: 1, friendRequests: 0 });
      await pullToRefresh();

      expect(await screen.findByText('2 of 3 at home')).toBeOnTheScreen();
      expect(screen.getByText('1 new')).toBeOnTheScreen();
      expect(mockReloadProfile).toHaveBeenCalledTimes(1);
    });
  });
});
