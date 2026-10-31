import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import HomeScreen from '@/app/(app)/home';
import { BATS_PER_USER } from '@/constants/config';
import { fetchBadges } from '@/features/messages/messages';
import type { Profile } from '@/features/profile/use-profile';
import { fetchRoost, type Bat, type Person } from '@/features/roost/roost';

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
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

const mockProfileState: { profile: Profile | null; isLoading: boolean; error: string | null } = {
  profile: null,
  isLoading: false,
  error: null,
};
// Stable, as the real hook's is: the screen reloads the profile on focus, and a
// new function on every render would read as a new focus on every render.
const mockReloadProfile = jest.fn(() => Promise.resolve());

jest.mock('@/features/profile/use-profile', () => ({
  useProfile: () => ({ ...mockProfileState, reload: mockReloadProfile }),
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
  mockReloadProfile.mockClear();
  mockProfileState.profile = courier;
  mockProfileState.isLoading = false;
  mockProfileState.error = null;
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

  describe('staying current', () => {
    // The profile screen and the city picker both change what the roost shows,
    // and the courier comes back here from each of them.
    it('reloads the profile when the roost comes into view', async () => {
      await renderScreen(<HomeScreen />);
      await roostLoaded();

      expect(mockReloadProfile).toHaveBeenCalled();
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
