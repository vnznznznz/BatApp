import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Alert, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import FriendsScreen from '@/app/(app)/friends';
import {
  acceptFriend,
  fetchFriendships,
  removeFriend,
  requestFriend,
  withdrawRequest,
  type Friendship,
  type RequestOutcome,
} from '@/features/friends/friends';
import type { Profile } from '@/features/profile/use-profile';
import { formatTimestamp } from '@/lib/format';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

const mockPush = jest.fn();
/** The focus effects of the screen as it is now, to run again as it comes back into view. */
const mockFocusEffects = new Set<() => void | (() => void)>();

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => {
        mockFocusEffects.add(effect);
        const cleanup = effect();
        return () => {
          mockFocusEffects.delete(effect);
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]),
  };
});

// The screen is under test, not the network. The calls that reach Supabase are
// replaced; the pure helpers that sort, name and describe friends are kept, so
// what the screen says is what it would say for real.
jest.mock('@/features/friends/friends', () => ({
  ...jest.requireActual('@/features/friends/friends'),
  fetchFriendships: jest.fn(),
  requestFriend: jest.fn(),
  acceptFriend: jest.fn(),
  removeFriend: jest.fn(),
  withdrawRequest: jest.fn(),
}));

/** The courier's profile as the database has it now, and how often it was read. */
const mockProfileState: { profile: Profile | null; reads: number } = { profile: null, reads: 0 };

// As the real hook does, it holds what it read last, and reads again each time
// the screen comes into view - the first time included - and when asked to.
jest.mock('@/features/profile/use-profile', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { useFocusEffect } = jest.requireMock<typeof import('expo-router')>('expo-router');
  return {
    useProfile: () => {
      const [profile, setProfile] = React.useState(() => mockProfileState.profile);
      const reload = React.useCallback(async () => {
        mockProfileState.reads += 1;
        setProfile(mockProfileState.profile);
      }, []);
      useFocusEffect(React.useCallback(() => void reload(), [reload]));
      return { profile, isLoading: false, error: null, reload };
    },
  };
});

const mockedFetchFriendships = jest.mocked(fetchFriendships);
const mockedRequestFriend = jest.mocked(requestFriend);
const mockedAcceptFriend = jest.mocked(acceptFriend);
const mockedRemoveFriend = jest.mocked(removeFriend);
const mockedWithdrawRequest = jest.mocked(withdrawRequest);

/** A fixed moment, so "asked ..." reads the same on every run. */
const NOW = new Date('2026-10-31T21:00:00Z').getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const courier: Profile = {
  id: 'user-mara',
  username: 'mara',
  displayName: 'Mara Lind',
  avatarUrl: null,
  move: null,
  city: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
};

/** A friend in Munich, with the route the server worked out for a bat. */
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

/** A friend who has not chosen a city, so there is no route to them. */
const ben: Friendship = {
  id: 'friendship-ben',
  status: 'accepted',
  direction: 'incoming',
  friend: { id: 'user-ben', username: 'ben', displayName: 'Ben Okafor', city: null },
  route: null,
  requestedAt: new Date(NOW - 5 * DAY),
  acceptedAt: new Date(NOW - 4 * DAY),
};

/** Someone who asked. Asking shares your name, but not yet your city. */
const carla: Friendship = {
  id: 'friendship-carla',
  status: 'pending',
  direction: 'incoming',
  friend: { id: 'user-carla', username: 'carla', displayName: 'Carla Ruiz', city: null },
  route: null,
  requestedAt: new Date(NOW - 2 * HOUR),
  acceptedAt: null,
};

/** Someone the courier asked. Until they accept, the server withholds their name and city. */
const dora: Friendship = {
  id: 'friendship-dora',
  status: 'pending',
  direction: 'outgoing',
  friend: { id: 'user-dora', username: 'dora', displayName: null, city: null },
  route: null,
  requestedAt: new Date(NOW - 3 * DAY),
  acceptedAt: null,
};

/** What `list_friends()` answers from now on. */
const serve = (list: () => Friendship[]) =>
  mockedFetchFriendships.mockImplementation(async () => list());

/** A promise the test settles by hand, to look at the screen while a call is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

const NO_CITY_OF_YOUR_OWN =
  'You have not chosen your city yet, so your bats cannot carry a letter anywhere. ' +
  'Choose it here, or in your profile.';

/** Resolves once the list has loaded. The section is there even when it is empty. */
const listLoaded = () => screen.findByRole('header', { name: 'Your friends' });

const usernameField = () => screen.getByLabelText('Their username');
const sendRequestButton = () => screen.getByRole('button', { name: 'Send request' });

async function ask(username: string) {
  await fireEvent.changeText(usernameField(), username);
  await fireEvent.press(sendRequestButton());
}

/**
 * The views that lay `element` out in a row with whatever stands beside it:
 * every ancestor whose children run side by side.
 */
function rowsAround(element: ReturnType<typeof screen.getByText>) {
  const rows = [];
  for (let node = element.parent; node; node = node.parent) {
    if (StyleSheet.flatten(node.props.style)?.flexDirection === 'row') rows.push(node);
  }
  return rows;
}

/** Comes back to the screen, as when the picker on top of it is popped. */
const comeBack = () =>
  act(async () => {
    for (const effect of [...mockFocusEffects]) effect();
  });

let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
let announceSpy: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;

/** Everything said aloud to a screen reader so far, in order. */
const announced = () => announceSpy.mock.calls.map(([message]) => message);

/** The alert the screen raised most recently: its title, its message and its buttons. */
function lastAlert() {
  const call = alertSpy.mock.lastCall;
  if (!call) throw new Error('No alert was shown.');
  const [title, message, buttons = []] = call;
  return { title, message, buttons: buttons.map((button) => button.text) };
}

/** Taps a button on the alert the screen raised most recently. */
async function chooseInAlert(label: string) {
  const button = alertSpy.mock.lastCall?.[2]?.find((candidate) => candidate.text === label);
  if (!button) throw new Error(`The alert has no "${label}" button.`);
  await act(async () => button.onPress?.());
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockPush.mockClear();
  mockFocusEffects.clear();
  mockProfileState.profile = courier;
  mockProfileState.reads = 0;
  mockedFetchFriendships.mockReset();
  serve(() => [anna, ben, carla, dora]);
  mockedRequestFriend.mockReset();
  mockedAcceptFriend.mockReset().mockResolvedValue(undefined);
  mockedRemoveFriend.mockReset().mockResolvedValue(undefined);
  mockedWithdrawRequest.mockReset().mockResolvedValue(undefined);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  alertSpy.mockRestore();
  announceSpy.mockRestore();
  jest.useRealTimers();
});

describe('FriendsScreen', () => {
  describe('asking someone', () => {
    it('shows the courier their own username to share', async () => {
      await renderScreen(<FriendsScreen />);
      await listLoaded();

      expect(screen.getByText('Yours is @mara. Share it with friends.')).toBeOnTheScreen();
    });

    it.each([
      ['ab', 'Usernames need at least 3 characters.'],
      ['ben k', 'Usernames can use lowercase letters, numbers and underscores only.'],
    ])('checks "%s" itself rather than asking the server', async (typed, complaint) => {
      await renderScreen(<FriendsScreen />);
      await listLoaded();

      await ask(typed);

      expect(screen.getByText(complaint)).toBeOnTheScreen();
      expect(mockedRequestFriend).not.toHaveBeenCalled();
    });

    it.each<[RequestOutcome, string]>([
      ['requested', 'Request sent. Once @anna accepts, you can write to each other.'],
      ['already_requested', 'You have already asked @anna. Their answer is up to them.'],
      ['accepted', '@anna had already asked you, so you are now friends.'],
      ['already_friends', 'You and @anna are already friends.'],
    ])(
      'says what happened when the server answers "%s", and clears the field',
      async (outcome, says) => {
        mockedRequestFriend.mockResolvedValue(outcome);
        await renderScreen(<FriendsScreen />);
        await listLoaded();

        await ask('Anna');

        expect(mockedRequestFriend).toHaveBeenCalledWith('Anna');
        expect(await screen.findByText(says)).toBeOnTheScreen();
        expect(usernameField()).toHaveDisplayValue('');
        // Whatever the answer, the lists below may have changed with it.
        expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
      },
    );

    it('lists someone who had already asked among friends straight away', async () => {
      serve(() => []);
      mockedRequestFriend.mockImplementation(async () => {
        // Asking someone who had asked first makes the two of you friends.
        serve(() => [anna]);
        return 'accepted';
      });
      await renderScreen(<FriendsScreen />);
      expect(
        await screen.findByText('No friends yet. Ask someone by their username above.'),
      ).toBeOnTheScreen();

      await ask('anna');

      expect(await screen.findByText('Anna Weber')).toBeOnTheScreen();
      expect(screen.getByText('@anna')).toBeOnTheScreen();
      expect(screen.getByText('Munich, DE · about 6h 18m by bat')).toBeOnTheScreen();
      expect(screen.queryByText('No friends yet. Ask someone by their username above.')).toBeNull();
    });

    it('shows why the server refused under the field, and keeps what was typed', async () => {
      mockedRequestFriend.mockRejectedValue(
        new RpcError(REFUSALS.unknown_username, 'unknown_username'),
      );
      await renderScreen(<FriendsScreen />);
      await listLoaded();

      await ask('anan');

      expect(await screen.findByText(REFUSALS.unknown_username)).toBeOnTheScreen();
      expect(usernameField()).toHaveDisplayValue('anan');
      // The refusal takes the hint's place, beneath the field it is about.
      expect(screen.queryByText('Yours is @mara. Share it with friends.')).toBeNull();
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(1);
    });

    it('lets go of a refusal once the username is changed', async () => {
      mockedRequestFriend.mockRejectedValue(
        new RpcError(REFUSALS.unknown_username, 'unknown_username'),
      );
      await renderScreen(<FriendsScreen />);
      await listLoaded();
      await ask('anan');
      expect(await screen.findByText(REFUSALS.unknown_username)).toBeOnTheScreen();

      await fireEvent.changeText(usernameField(), 'anna');

      expect(screen.queryByText(REFUSALS.unknown_username)).toBeNull();
      expect(screen.getByText('Yours is @mara. Share it with friends.')).toBeOnTheScreen();
    });
  });

  describe('requests waiting for the courier', () => {
    it('lists someone who asked, by name, with when they asked', async () => {
      serve(() => [carla]);
      await renderScreen(<FriendsScreen />);

      expect(await screen.findByRole('header', { name: 'Asking you' })).toBeOnTheScreen();
      expect(screen.getByText('Carla Ruiz')).toBeOnTheScreen();
      expect(screen.getByText('@carla')).toBeOnTheScreen();
      expect(screen.getByText(`Asked ${formatTimestamp(carla.requestedAt)}`)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled();
    });

    /**
     * Beside Accept and Decline, a 20-character username was cut to about 11
     * on a 360dp phone, and when they asked fell off the line altogether - and
     * the username is how the courier knows who this is. The answers sit
     * under the name instead, so the name has the row's whole width.
     */
    it('gives the name of someone asking the whole width, with the answers beneath it', async () => {
      const longName = 'carla_from_the_coast';
      // At the text size most people read at: from 1.2 up, every row puts its
      // buttons under its text anyway.
      jest
        .spyOn(Dimensions, 'get')
        .mockReturnValue({ width: 360, height: 740, scale: 3, fontScale: 1 });
      serve(() => [{ ...carla, friend: { ...carla.friend, username: longName } }]);
      await renderScreen(<FriendsScreen />);

      const username = await screen.findByText(new RegExp(`^@${longName}`));
      const rows = rowsAround(username);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(within(row).queryByRole('button', { name: 'Accept' })).toBeNull();
        expect(within(row).queryByRole('button', { name: 'Decline' })).toBeNull();
      }
      expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled();
    });

    it('accepts a request, and then lists them among friends', async () => {
      serve(() => [carla]);
      mockedAcceptFriend.mockImplementation(async () => {
        serve(() => [{ ...carla, status: 'accepted', acceptedAt: new Date(NOW) }]);
      });
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));

      expect(mockedAcceptFriend).toHaveBeenCalledWith('friendship-carla');
      await waitFor(() => expect(screen.queryByRole('header', { name: 'Asking you' })).toBeNull());
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Carla Ruiz')).toBeOnTheScreen();
      expect(screen.getByText('Has not chosen a city yet')).toBeOnTheScreen();
    });

    it('declines a request, and then drops it from the list', async () => {
      serve(() => [carla]);
      mockedRemoveFriend.mockImplementation(async () => {
        serve(() => []);
      });
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Decline' }));

      expect(mockedRemoveFriend).toHaveBeenCalledWith('friendship-carla');
      expect(mockedAcceptFriend).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByText('Carla Ruiz')).toBeNull());
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
    });

    it('takes no other answer while one is on its way', async () => {
      serve(() => [carla]);
      const accepting = deferred<void>();
      mockedAcceptFriend.mockReturnValue(accepting.promise);
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));

      expect(screen.getByRole('button', { name: 'Accept' })).toBeBusy();
      expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
      await fireEvent.press(screen.getByRole('button', { name: 'Decline' }));
      expect(mockedRemoveFriend).not.toHaveBeenCalled();

      await act(async () => accepting.resolve());
      expect(mockedAcceptFriend).toHaveBeenCalledTimes(1);
    });

    // Found by this test: the Accept button's spinner was keyed on the
    // friendship alone and Decline had none, so declining made Accept spin - and
    // report itself busy to a screen reader - as if the request were accepted.
    it('shows the decline, not an accept, as the answer on its way', async () => {
      serve(() => [carla]);
      const declining = deferred<void>();
      mockedRemoveFriend.mockReturnValue(declining.promise);
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Decline' }));

      expect(screen.getByRole('button', { name: 'Decline' })).toBeBusy();
      expect(screen.getByRole('button', { name: 'Accept' })).not.toBeBusy();
      expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();

      await act(async () => declining.resolve());
    });

    it('says so when a request is no longer waiting, and shows the list as it is now', async () => {
      serve(() => [carla]);
      mockedAcceptFriend.mockImplementation(async () => {
        // Carla withdrew while the courier was deciding.
        serve(() => []);
        throw new RpcError(REFUSALS.request_not_found, 'request_not_found');
      });
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));

      expect(await screen.findByText(REFUSALS.request_not_found)).toBeOnTheScreen();
      // Heard as well: focus stays on the button, far from the words.
      expect(announced()).toEqual([REFUSALS.request_not_found]);
      await waitFor(() => expect(screen.queryByText('Carla Ruiz')).toBeNull());
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
    });
  });

  describe('one answer at a time', () => {
    /**
     * What the screen says belongs to what was done last. A refusal on a row
     * left on screen through a later request reads as that request's answer;
     * a request's "sent" left beside a later refusal reads as if all went well.
     */
    it("lets go of a row's refusal once someone new is asked", async () => {
      serve(() => [carla]);
      mockedAcceptFriend.mockRejectedValue(
        new RpcError(REFUSALS.request_not_found, 'request_not_found'),
      );
      mockedRequestFriend.mockResolvedValue('requested');
      await renderScreen(<FriendsScreen />);
      await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));
      expect(await screen.findByText(REFUSALS.request_not_found)).toBeOnTheScreen();

      await ask('anna');

      expect(
        await screen.findByText('Request sent. Once @anna accepts, you can write to each other.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText(REFUSALS.request_not_found)).toBeNull();
    });

    it('lets go of what a request came to once a row is acted on', async () => {
      serve(() => [carla]);
      mockedRequestFriend.mockResolvedValue('requested');
      mockedAcceptFriend.mockRejectedValue(
        new RpcError(REFUSALS.request_not_found, 'request_not_found'),
      );
      await renderScreen(<FriendsScreen />);
      await listLoaded();
      await ask('anna');
      const sent = 'Request sent. Once @anna accepts, you can write to each other.';
      expect(await screen.findByText(sent)).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Accept' }));

      expect(await screen.findByText(REFUSALS.request_not_found)).toBeOnTheScreen();
      expect(screen.queryByText(sent)).toBeNull();
    });
  });

  describe('friends', () => {
    it('lists each friend with their city and how long a bat takes to reach them', async () => {
      serve(() => [ben, anna]);
      await renderScreen(<FriendsScreen />);
      await listLoaded();

      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(screen.getByText('@anna')).toBeOnTheScreen();
      // On a line of its own, so a narrow screen cannot cut it off.
      expect(screen.getByText('Munich, DE · about 6h 18m by bat')).toBeOnTheScreen();
      expect(screen.getByText('Ben Okafor')).toBeOnTheScreen();
      expect(screen.getByText('Has not chosen a city yet')).toBeOnTheScreen();
    });

    it('leaves out the flight time while there is no route to a friend', async () => {
      // The server works out a route only once both of you have chosen a city.
      mockProfileState.profile = { ...courier, city: null };
      serve(() => [{ ...anna, route: null }]);
      await renderScreen(<FriendsScreen />);
      await listLoaded();

      expect(screen.getByText('Munich, DE')).toBeOnTheScreen();
      expect(screen.queryByText(/by bat$/)).toBeNull();
    });

    /**
     * Without a city of their own, no bat can leave, so Write is off on every
     * row - with only the friend's city beside it, which looks like a reason
     * it is not. The screen says the real one, and where to put it right.
     */
    it('says why no letter can be written while the courier has no city, and offers to choose one', async () => {
      mockProfileState.profile = { ...courier, city: null };
      serve(() => [{ ...anna, route: null }]);
      await renderScreen(<FriendsScreen />);
      await listLoaded();

      expect(screen.getByRole('button', { name: 'Write to Anna Weber' })).toBeDisabled();
      expect(screen.getByText(NO_CITY_OF_YOUR_OWN)).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Choose your city' }));

      expect(mockPush).toHaveBeenCalledWith('/city-picker');
    });

    /**
     * The hook reads the profile again as the screen comes into view, which is
     * what shows a city the picker has just saved. The screen asked as well,
     * and made two requests for the same row at every focus. (Found in the
     * merged tree.)
     */
    it('reads the profile once each time the screen comes into view', async () => {
      await renderScreen(<FriendsScreen />);
      await listLoaded();
      expect(mockProfileState.reads).toBe(1);

      await comeBack();

      expect(mockProfileState.reads).toBe(2);
    });

    // Ben has no city, so there is no route to him whoever has one: only the
    // courier's own city tells that the notice is not theirs.
    it('says nothing of a city of their own once the courier has one, though no friend has', async () => {
      serve(() => [ben]);
      await renderScreen(<FriendsScreen />);
      await listLoaded();

      expect(screen.queryByText(NO_CITY_OF_YOUR_OWN)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Choose your city' })).toBeNull();
    });

    it('says nothing of a city while the profile is not known', async () => {
      mockProfileState.profile = null;
      serve(() => [ben]);
      await renderScreen(<FriendsScreen />);
      await listLoaded();

      expect(screen.queryByText(NO_CITY_OF_YOUR_OWN)).toBeNull();
    });

    /**
     * The picker saves the city itself and pops back. Ben has no city, so no
     * route appears to tell of it: the screen has to read the profile again
     * as it comes back. (Found in review: it went on saying "You have not
     * chosen your city yet" until it was opened anew.)
     */
    it('lets go of it once the city is chosen, though no friend has a city', async () => {
      mockProfileState.profile = { ...courier, city: null };
      serve(() => [ben]);
      await renderScreen(<FriendsScreen />);
      await listLoaded();
      await fireEvent.press(screen.getByRole('button', { name: 'Choose your city' }));
      expect(mockPush).toHaveBeenCalledWith('/city-picker');

      mockProfileState.profile = courier;
      await comeBack();

      expect(screen.queryByText(NO_CITY_OF_YOUR_OWN)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Choose your city' })).toBeNull();
    });

    /**
     * The list and the profile are read side by side as the screen comes back.
     * A route on the list means the courier has a city by now, whichever of
     * the two answered first.
     */
    it('lets go of it once the list shows a route, the city chosen in the meantime', async () => {
      mockProfileState.profile = { ...courier, city: null };
      serve(() => [anna]);
      await renderScreen(<FriendsScreen />);
      await listLoaded();

      expect(screen.queryByText(NO_CITY_OF_YOUR_OWN)).toBeNull();
      expect(screen.getByRole('button', { name: 'Write to Anna Weber' })).toBeEnabled();
    });

    it('says nothing of a city while there is no friend to write to', async () => {
      mockProfileState.profile = { ...courier, city: null };
      serve(() => [carla]);
      await renderScreen(<FriendsScreen />);
      await listLoaded();

      expect(screen.queryByText(NO_CITY_OF_YOUR_OWN)).toBeNull();
    });

    it('says when there are no friends yet', async () => {
      serve(() => [carla, dora]);
      await renderScreen(<FriendsScreen />);

      expect(
        await screen.findByText('No friends yet. Ask someone by their username above.'),
      ).toBeOnTheScreen();
    });

    it('opens a letter to a friend from their row', async () => {
      serve(() => [anna]);
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Write to Anna Weber' }));

      expect(mockPush).toHaveBeenCalledWith({ pathname: '/compose', params: { to: 'user-anna' } });
      expect(alertSpy).not.toHaveBeenCalled();
    });

    /**
     * VoiceOver treats a pressable row as a single element, so a button nested
     * inside one can never be focused. The name, which opens the friend's page,
     * is a button of its own; each action is its own button beside it.
     */
    it('keeps each action a button of its own, reachable by a screen reader', async () => {
      serve(() => [anna]);
      await renderScreen(<FriendsScreen />);
      await screen.findByText('Anna Weber');

      const opener = screen.getByRole('button', { name: /^Anna Weber/ });
      expect(within(opener).queryAllByRole('button')).toHaveLength(0);
      expect(screen.getByRole('button', { name: 'Write to Anna Weber' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Remove Anna Weber' })).toBeEnabled();
    });

    it.each([
      ['a friend', () => anna],
      ['someone asking', () => carla],
      ['someone the courier asked', () => dora],
    ])('opens the page of %s from their name', async (_, who) => {
      const friendship = who();
      serve(() => [friendship]);
      await renderScreen(<FriendsScreen />);

      const name = friendship.friend.displayName ?? `@${friendship.friend.username}`;
      const opener = await screen.findByRole('button', { name: new RegExp(`^${name}`) });
      await fireEvent.press(opener);

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/courier/[id]',
        params: { id: friendship.friend.id },
      });
    });

    it('says where blocking and reporting are', async () => {
      serve(() => [anna]);
      await renderScreen(<FriendsScreen />);

      expect(
        await screen.findByText(
          'Tap a name to see more about someone, or to block or report them.',
        ),
      ).toBeOnTheScreen();
    });

    it('offers no letter to a friend no bat can reach yet', async () => {
      serve(() => [{ ...anna, route: null }]);
      await renderScreen(<FriendsScreen />);

      expect(await screen.findByRole('button', { name: 'Write to Anna Weber' })).toBeDisabled();
    });

    it('asks before removing a friend, and keeps them if the courier thinks better of it', async () => {
      serve(() => [anna]);
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Remove Anna Weber' }));

      expect(mockedRemoveFriend).not.toHaveBeenCalled();
      expect(lastAlert().title).toBe('Stop being friends with Anna Weber?');
      expect(lastAlert().buttons).toEqual(['Keep', 'Remove']);

      await chooseInAlert('Keep');

      expect(mockedRemoveFriend).not.toHaveBeenCalled();
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
    });

    it('removes a friend once the courier confirms', async () => {
      serve(() => [anna]);
      mockedRemoveFriend.mockImplementation(async () => {
        serve(() => []);
      });
      await renderScreen(<FriendsScreen />);
      await fireEvent.press(await screen.findByRole('button', { name: 'Remove Anna Weber' }));

      await chooseInAlert('Remove');

      expect(mockedRemoveFriend).toHaveBeenCalledWith('friendship-anna');
      expect(
        await screen.findByText('No friends yet. Ask someone by their username above.'),
      ).toBeOnTheScreen();
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
    });
  });

  describe('requests the courier sent', () => {
    /**
     * Someone who has been asked has not agreed to share anything yet: a
     * stranger who guesses a username learns only that it exists.
     */
    it('shows someone the courier asked only by their username, with a way to withdraw', async () => {
      serve(() => [dora]);
      await renderScreen(<FriendsScreen />);

      expect(
        await screen.findByRole('header', { name: 'Waiting for an answer' }),
      ).toBeOnTheScreen();
      expect(screen.getByText('@dora')).toBeOnTheScreen();
      expect(screen.getByText(`Asked ${formatTimestamp(dora.requestedAt)}`)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled();
    });

    // The server withholds the name until they accept. The screen does not
    // lean on that alone.
    it('never shows a name for someone who has not accepted, even if one arrives', async () => {
      serve(() => [{ ...dora, friend: { ...dora.friend, displayName: 'Dora Lindqvist' } }]);
      await renderScreen(<FriendsScreen />);

      expect(await screen.findByText('@dora')).toBeOnTheScreen();
      expect(screen.queryByText(/Dora Lindqvist/)).toBeNull();
    });

    it('withdraws a request, and then drops it from the list', async () => {
      serve(() => [dora]);
      mockedWithdrawRequest.mockImplementation(async () => {
        serve(() => []);
      });
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Withdraw' }));

      expect(mockedWithdrawRequest).toHaveBeenCalledWith('friendship-dora', 'dora');
      // Never the call that ends whatever the row has become by now.
      expect(mockedRemoveFriend).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByText('@dora')).toBeNull());
      expect(alertSpy).not.toHaveBeenCalled();
    });

    /**
     * Dora said yes while the list still showed her request. The withdrawal is
     * refused rather than ending the new friendship; the courier is told what
     * happened, and ending it now goes through the usual question.
     *
     * Told in a dialog, not at the top of the screen with a row's other
     * refusals: Withdraw is in the last section, and with a few friends above
     * it the top is out of sight. The request would leave the list as if
     * withdrawn, and the courier would be friends with someone they meant to
     * un-ask without having read a word of it. (Found in review.)
     */
    it('says so when the other person accepted in the meantime, and keeps the friendship', async () => {
      const acceptedMeanwhile =
        '@dora accepted your request in the meantime, so you are friends now.';
      const accepted: Friendship = {
        ...dora,
        status: 'accepted',
        acceptedAt: new Date(NOW),
        friend: { ...dora.friend, displayName: 'Dora Lind' },
      };
      serve(() => [dora]);
      mockedWithdrawRequest.mockImplementation(async () => {
        serve(() => [accepted]);
        throw new RpcError(acceptedMeanwhile, 'request_not_found');
      });
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Withdraw' }));

      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
      expect(lastAlert()).toEqual({
        title: 'Nothing to withdraw',
        message: acceptedMeanwhile,
        buttons: [],
      });
      // The dialog is read out as it opens; said aloud as well, it would be heard twice.
      expect(announced()).toEqual([]);
      expect(mockedRemoveFriend).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.queryByRole('header', { name: 'Waiting for an answer' })).toBeNull(),
      );
      expect(screen.getByText('Dora Lind')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Remove Dora Lind' }));

      expect(lastAlert().title).toBe('Stop being friends with Dora Lind?');
      expect(mockedRemoveFriend).not.toHaveBeenCalled();
    });

    it('says so in a dialog when the request was gone already', async () => {
      const gone = 'Your request to @dora is no longer waiting for an answer.';
      serve(() => [anna, ben, dora]);
      mockedWithdrawRequest.mockImplementation(async () => {
        serve(() => [anna, ben]);
        throw new RpcError(gone, 'request_not_found');
      });
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Withdraw' }));

      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
      expect(lastAlert()).toEqual({ title: 'Nothing to withdraw', message: gone, buttons: [] });
      expect(announced()).toEqual([]);
      await waitFor(() => expect(screen.queryByText('@dora')).toBeNull());
    });

    /** Anything else is a row's refusal like any other, and the request is still listed. */
    it('says why a withdrawal failed otherwise, aloud as well', async () => {
      const failed = 'That request could not be withdrawn. Try again.';
      serve(() => [dora]);
      mockedWithdrawRequest.mockRejectedValue(new RpcError(failed, null));
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Withdraw' }));

      expect(await screen.findByText(failed)).toBeOnTheScreen();
      expect(announced()).toEqual([failed]);
      expect(alertSpy).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled();
    });
  });

  describe('loading', () => {
    it('says so when the list cannot be loaded, rather than claiming there are no friends', async () => {
      mockedFetchFriendships.mockRejectedValue(
        new Error('Your friends could not be loaded. Check your connection.'),
      );
      await renderScreen(<FriendsScreen />);

      expect(
        await screen.findByText('Your friends could not be loaded. Check your connection.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText('No friends yet. Ask someone by their username above.')).toBeNull();
      // Asking someone does not depend on the list.
      expect(sendRequestButton()).toBeEnabled();
    });
  });
});

/** The one thing left to do for an account that is suspended, besides writing to Night Courier. */
const mockSignOut = jest.fn(() => Promise.resolve());

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

describe('FriendsScreen for a suspended account', () => {
  const suspended = () => new RpcError(REFUSALS.account_suspended, 'account_suspended');

  /**
   * "Send request" stayed on under the suspension, with no way out: a request
   * would only have been refused. (Found in the browser.)
   */
  it('offers the way out, and no request to send', async () => {
    mockSignOut.mockClear();
    mockedFetchFriendships.mockRejectedValue(suspended());
    await renderScreen(<FriendsScreen />);

    expect(await screen.findByText(REFUSALS.account_suspended)).toBeOnTheScreen();
    expect(sendRequestButton()).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockedRequestFriend).not.toHaveBeenCalled();
  });

  it('says so, with the way out, when the list shown before is refused', async () => {
    await renderScreen(<FriendsScreen />);
    await screen.findByText('Anna Weber');
    mockedFetchFriendships.mockRejectedValue(suspended());

    await comeBack();

    expect(await screen.findByText(REFUSALS.account_suspended)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
    expect(sendRequestButton()).toBeDisabled();
  });
});
