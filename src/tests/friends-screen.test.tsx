import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import FriendsScreen from '@/app/(app)/friends';
import {
  acceptFriend,
  fetchFriendships,
  removeFriend,
  requestFriend,
  type Friendship,
  type RequestOutcome,
} from '@/features/friends/friends';
import type { Profile } from '@/features/profile/use-profile';
import { formatTimestamp } from '@/lib/format';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

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

// The screen is under test, not the network. The calls that reach Supabase are
// replaced; the pure helpers that sort, name and describe friends are kept, so
// what the screen says is what it would say for real.
jest.mock('@/features/friends/friends', () => ({
  ...jest.requireActual('@/features/friends/friends'),
  fetchFriendships: jest.fn(),
  requestFriend: jest.fn(),
  acceptFriend: jest.fn(),
  removeFriend: jest.fn(),
}));

const mockProfileState: { profile: Profile | null } = { profile: null };

jest.mock('@/features/profile/use-profile', () => ({
  useProfile: () => ({ profile: mockProfileState.profile, isLoading: false, error: null }),
}));

const mockedFetchFriendships = jest.mocked(fetchFriendships);
const mockedRequestFriend = jest.mocked(requestFriend);
const mockedAcceptFriend = jest.mocked(acceptFriend);
const mockedRemoveFriend = jest.mocked(removeFriend);

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

/** Resolves once the list has loaded. The section is there even when it is empty. */
const listLoaded = () => screen.findByRole('header', { name: 'Your friends' });

const usernameField = () => screen.getByLabelText('Their username');
const sendRequestButton = () => screen.getByRole('button', { name: 'Send request' });

async function ask(username: string) {
  await fireEvent.changeText(usernameField(), username);
  await fireEvent.press(sendRequestButton());
}

let alertSpy: jest.SpiedFunction<typeof Alert.alert>;

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
  mockProfileState.profile = courier;
  mockedFetchFriendships.mockReset();
  serve(() => [anna, ben, carla, dora]);
  mockedRequestFriend.mockReset();
  mockedAcceptFriend.mockReset().mockResolvedValue(undefined);
  mockedRemoveFriend.mockReset().mockResolvedValue(undefined);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
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
      expect(
        screen.getByText(`@carla · asked ${formatTimestamp(carla.requestedAt)}`),
      ).toBeOnTheScreen();
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
      await waitFor(() => expect(screen.queryByText('Carla Ruiz')).toBeNull());
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
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
     * inside one can never be focused. Each action is its own button instead.
     */
    it('keeps each action a button of its own, reachable by a screen reader', async () => {
      serve(() => [anna]);
      await renderScreen(<FriendsScreen />);
      await screen.findByText('Anna Weber');

      expect(screen.queryByRole('button', { name: /^Anna Weber/ })).toBeNull();
      expect(screen.getByRole('button', { name: 'Write to Anna Weber' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Remove Anna Weber' })).toBeEnabled();
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
      mockedRemoveFriend.mockImplementation(async () => {
        serve(() => []);
      });
      await renderScreen(<FriendsScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Withdraw' }));

      expect(mockedRemoveFriend).toHaveBeenCalledWith('friendship-dora');
      await waitFor(() => expect(screen.queryByText('@dora')).toBeNull());
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
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
