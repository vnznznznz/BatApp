import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import CourierScreen from '@/app/(app)/courier/[id]';
import {
  acceptFriend,
  fetchFriendships,
  removeFriend,
  type Friendship,
} from '@/features/friends/friends';
import { blockCourier, type BlockOutcome } from '@/features/safety/safety';
import { formatDay } from '@/lib/format';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work that would otherwise
// count against whichever test runs first.
jest.setTimeout(20_000);

const mockPush = jest.fn();
const mockBack = jest.fn();
/** The route's search params: whose page this is. */
const mockParams = { id: 'user-anna' };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
    useLocalSearchParams: () => mockParams,
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
  };
});

// The screen is under test, not the network. The calls that reach Supabase are
// replaced; the pure helpers that name a courier and describe where the two
// stand are kept, so what the page says is what it would say for real.
jest.mock('@/features/friends/friends', () => ({
  ...jest.requireActual('@/features/friends/friends'),
  fetchFriendships: jest.fn(),
  acceptFriend: jest.fn(),
  removeFriend: jest.fn(),
}));

// Blocking is the one call the page makes into the safety module.
jest.mock('@/features/safety/safety', () => ({
  ...jest.requireActual('@/features/safety/safety'),
  blockCourier: jest.fn(),
}));

const mockedFetchFriendships = jest.mocked(fetchFriendships);
const mockedAcceptFriend = jest.mocked(acceptFriend);
const mockedRemoveFriend = jest.mocked(removeFriend);
const mockedBlockCourier = jest.mocked(blockCourier);

/** A fixed moment, so "Friends since ..." and "You asked ..." read the same on every run. */
const NOW = new Date('2026-10-31T21:00:00Z').getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * The courier asked Anna ten days ago, and she has just said yes - which is
 * "today" in every time zone, so the standing line can be written out as read.
 */
const ANNA_ASKED = new Date(NOW - 10 * DAY);
const ANNA_ACCEPTED = new Date(NOW);
const CARLA_ASKED = new Date(NOW - 2 * HOUR);
const DORA_ASKED = new Date(NOW - 3 * DAY);

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
  requestedAt: ANNA_ASKED,
  acceptedAt: ANNA_ACCEPTED,
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
  requestedAt: CARLA_ASKED,
  acceptedAt: null,
};

/** Someone the courier asked. Until they accept, the server withholds their name and city. */
const dora: Friendship = {
  id: 'friendship-dora',
  status: 'pending',
  direction: 'outgoing',
  friend: { id: 'user-dora', username: 'dora', displayName: null, city: null },
  route: null,
  requestedAt: DORA_ASKED,
  acceptedAt: null,
};

/** Each standing a courier can have, as the page is opened from the friends list. */
const STANDINGS: [string, Friendship][] = [
  ['a friend', anna],
  ['someone asking', carla],
  ['someone the courier asked', dora],
];

const GONE = 'This courier is no longer among your friends or requests.';

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

/**
 * Opens the page of whoever is on the other side of `friendship`, as tapping
 * their name in Friends does, and resolves once it has loaded. The Safety
 * section is on the page whatever the two are to each other.
 */
async function openPageOf(friendship: Friendship) {
  mockParams.id = friendship.friend.id;
  await renderScreen(<CourierScreen />);
  await screen.findByRole('header', { name: 'Safety' });
}

const button = (name: string) => screen.getByRole('button', { name });
const spinners = () => screen.container.queryAll((node) => node.type === 'ActivityIndicator');

let alertSpy: jest.SpiedFunction<typeof Alert.alert>;

/** The alert the screen raised most recently: its title, its message and its buttons. */
function lastAlert() {
  const call = alertSpy.mock.lastCall;
  if (!call) throw new Error('No alert was shown.');
  const [title, message, buttons = []] = call;
  return {
    title,
    message,
    buttons: buttons.map((choice) => choice.text),
    /** Drawn in red on iOS: the choice that cannot be taken back. */
    destructive: buttons
      .filter((choice) => choice.style === 'destructive')
      .map((choice) => choice.text),
  };
}

/** Taps a button on the alert the screen raised most recently. */
async function chooseInAlert(label: string) {
  const choice = alertSpy.mock.lastCall?.[2]?.find((candidate) => candidate.text === label);
  if (!choice) throw new Error(`The alert has no "${label}" button.`);
  await act(async () => choice.onPress?.());
}

let announceSpy: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;

/** Everything said aloud to a screen reader so far, in order. */
const announced = () => announceSpy.mock.calls.map(([message]) => message);

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockPush.mockClear();
  mockBack.mockClear();
  mockParams.id = 'user-anna';
  mockedFetchFriendships.mockReset();
  serve(() => [anna, ben, carla, dora]);
  mockedAcceptFriend.mockReset().mockResolvedValue(undefined);
  mockedRemoveFriend.mockReset().mockResolvedValue(undefined);
  mockedBlockCourier.mockReset().mockResolvedValue('blocked');
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
  announceSpy.mockRestore();
  jest.useRealTimers();
});

describe('CourierScreen', () => {
  describe('a friend', () => {
    it('shows a friend by name, with their username', async () => {
      await openPageOf(anna);

      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(screen.getByText('@anna')).toBeOnTheScreen();
    });

    /**
     * A friendship begins with the yes, not the asking. The courier asked
     * Anna ten days before she accepted, so a page that dated the friendship
     * from the request would put it ten days too early.
     */
    it('says since when they have been friends, counted from when the request was accepted', async () => {
      await openPageOf(anna);

      expect(screen.getByText('Friends since today')).toBeOnTheScreen();
      expect(screen.queryByText(new RegExp(formatDay(ANNA_ASKED)))).toBeNull();
    });

    it('says where they are and how long a bat takes to reach them', async () => {
      await openPageOf(anna);

      expect(screen.getByText('Munich, DE · about 6h 18m by bat')).toBeOnTheScreen();
    });

    it('says when a friend has not chosen a city yet', async () => {
      await openPageOf(ben);

      expect(screen.getByText('Ben Okafor')).toBeOnTheScreen();
      expect(screen.getByText('Has not chosen a city yet')).toBeOnTheScreen();
    });

    it('opens a letter to them', async () => {
      await openPageOf(anna);

      await fireEvent.press(button('Write a letter'));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/compose', params: { to: 'user-anna' } });
      expect(alertSpy).not.toHaveBeenCalled();
    });

    /**
     * The server works out a route only once both of them have chosen a city.
     * Without one there is nowhere for a bat to fly, whichever of the two has
     * yet to choose.
     */
    it.each<[string, Friendship, string]>([
      ['the friend has chosen no city', ben, 'Has not chosen a city yet'],
      ['the courier has chosen no city', { ...anna, route: null }, 'Munich, DE'],
    ])('offers no letter while no bat can reach them: %s', async (_, friendship, where) => {
      serve(() => [friendship]);
      await openPageOf(friendship);

      expect(screen.getByText(where)).toBeOnTheScreen();
      expect(screen.queryByText(/by bat$/)).toBeNull();
      expect(button('Write a letter')).toBeDisabled();
      await fireEvent.press(button('Write a letter'));
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('asks before removing a friend, and keeps them if the courier thinks better of it', async () => {
      await openPageOf(anna);

      await fireEvent.press(button('Remove friend'));

      expect(mockedRemoveFriend).not.toHaveBeenCalled();
      expect(lastAlert()).toEqual({
        title: 'Stop being friends with Anna Weber?',
        message:
          'Neither of you will be able to send the other letters. Letters already in the air ' +
          'still arrive, and the letters you have exchanged stay where they are.',
        buttons: ['Keep', 'Remove'],
        destructive: ['Remove'],
      });

      await chooseInAlert('Keep');

      expect(mockedRemoveFriend).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(announced()).toEqual([]);
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(button('Remove friend')).toBeEnabled();
    });

    it('removes a friend once the courier confirms, says so, and goes back', async () => {
      await openPageOf(anna);
      await fireEvent.press(button('Remove friend'));

      await chooseInAlert('Remove');

      expect(mockedRemoveFriend).toHaveBeenCalledTimes(1);
      expect(mockedRemoveFriend).toHaveBeenCalledWith('friendship-anna');
      await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
      expect(announced()).toEqual(['You and Anna Weber are no longer friends.']);
    });
  });

  describe('someone asking', () => {
    /**
     * Whether someone asking has a city is not shared until the two are
     * friends, so the page does not guess: it does not say they have none.
     */
    it('shows someone asking by name, with their username and when they asked', async () => {
      await openPageOf(carla);

      expect(screen.getByText('Carla Ruiz')).toBeOnTheScreen();
      expect(screen.getByText('@carla')).toBeOnTheScreen();
      expect(screen.getByText(`Asked to be friends ${formatDay(CARLA_ASKED)}`)).toBeOnTheScreen();
      expect(screen.queryByText('Has not chosen a city yet')).toBeNull();
      expect(button('Accept')).toBeEnabled();
      expect(button('Decline')).toBeEnabled();
      // Letters travel only between friends.
      expect(screen.queryByRole('button', { name: 'Write a letter' })).toBeNull();
    });

    // The server withholds the city until a request is accepted. The page
    // does not lean on that alone.
    it('never says where someone asking is, even if a city arrives', async () => {
      const withCity: Friendship = {
        ...carla,
        friend: { ...carla.friend, city: { name: 'Seville', countryCode: 'ES' } },
      };
      serve(() => [withCity]);
      await openPageOf(withCity);

      expect(screen.getByText('Carla Ruiz')).toBeOnTheScreen();
      expect(screen.queryByText(/Seville/)).toBeNull();
    });

    it('accepts the request, says so, and then shows them as a friend', async () => {
      const accepted: Friendship = {
        ...carla,
        status: 'accepted',
        acceptedAt: new Date(NOW),
        friend: { ...carla.friend, city: { name: 'Seville', countryCode: 'ES' } },
        route: { distanceKm: 1_743.1, flightSeconds: 78_440 },
      };
      mockedAcceptFriend.mockImplementation(async () => {
        serve(() => [anna, ben, accepted, dora]);
      });
      await openPageOf(carla);

      await fireEvent.press(button('Accept'));

      expect(mockedAcceptFriend).toHaveBeenCalledTimes(1);
      expect(mockedAcceptFriend).toHaveBeenCalledWith('friendship-carla');
      expect(await screen.findByText('Friends since today')).toBeOnTheScreen();
      expect(announced()).toEqual(['You and @carla are now friends.']);
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
      // The page stays: there is more to do with a new friend than with a request.
      expect(mockBack).not.toHaveBeenCalled();
      expect(screen.getByText('Seville, ES · about 21h 47m by bat')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
      expect(button('Write a letter')).toBeEnabled();
      expect(button('Remove friend')).toBeEnabled();
    });

    // As on the friends list: a request declined can be made again.
    it('declines without asking first, says so, and goes back', async () => {
      await openPageOf(carla);

      await fireEvent.press(button('Decline'));

      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockedRemoveFriend).toHaveBeenCalledTimes(1);
      expect(mockedRemoveFriend).toHaveBeenCalledWith('friendship-carla');
      expect(mockedAcceptFriend).not.toHaveBeenCalled();
      await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
      expect(announced()).toEqual(['Declined @carla.']);
    });
  });

  describe('someone the courier asked', () => {
    /**
     * Someone who has been asked has not agreed to share anything yet, and
     * the server sends no name for them: a stranger who guesses a username
     * learns only that it exists. The username is all the page has to call
     * them by, and it says it once, as the title.
     */
    it('shows someone the courier asked only by their username, with when they were asked', async () => {
      await openPageOf(dora);

      expect(screen.getAllByText('@dora')).toHaveLength(1);
      expect(screen.getByText(`You asked ${formatDay(DORA_ASKED)}`)).toBeOnTheScreen();
      expect(screen.queryByText('Has not chosen a city yet')).toBeNull();
      expect(button('Withdraw request')).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Write a letter' })).toBeNull();
    });

    it('withdraws the request without asking first, says so, and goes back', async () => {
      await openPageOf(dora);

      await fireEvent.press(button('Withdraw request'));

      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockedRemoveFriend).toHaveBeenCalledTimes(1);
      expect(mockedRemoveFriend).toHaveBeenCalledWith('friendship-dora');
      await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
      expect(announced()).toEqual(['Withdrew your request to @dora.']);
    });
  });

  describe('safety', () => {
    it('sets blocking and reporting apart, and says the courier is told of neither', async () => {
      await openPageOf(anna);

      expect(screen.getByRole('header', { name: 'Safety' })).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Blocking ends your friendship, hides their letters from you and stops them asking ' +
            'again. Reporting tells the people who run Night Courier. @anna is not told about ' +
            'either.',
        ),
      ).toBeOnTheScreen();
      expect(button('Block @anna')).toBeEnabled();
      expect(button('Report @anna')).toBeEnabled();
    });

    it('asks before blocking, and says what a block does', async () => {
      await openPageOf(anna);

      await fireEvent.press(button('Block @anna'));

      expect(mockedBlockCourier).not.toHaveBeenCalled();
      expect(lastAlert()).toEqual({
        title: 'Block @anna?',
        message:
          'Your friendship ends, they cannot ask to be friends again, and any letters from ' +
          'them - already here or still in the air - are hidden from you. They are not told. ' +
          'You can unblock them later in your profile.',
        buttons: ['Cancel', 'Block'],
        destructive: ['Block'],
      });
    });

    /**
     * A block is of the courier, not of a friendship: it is made by their id,
     * so it outlasts whatever was between the two and stops the next request.
     * Ending that is the server's part of the block, not a removal first.
     */
    it.each(STANDINGS)(
      'blocks %s once the courier confirms, says so, and goes back',
      async (_, friendship) => {
        const handle = `@${friendship.friend.username}`;
        await openPageOf(friendship);
        await fireEvent.press(button(`Block ${handle}`));
        expect(lastAlert().title).toBe(`Block ${handle}?`);

        await chooseInAlert('Block');

        expect(mockedBlockCourier).toHaveBeenCalledTimes(1);
        expect(mockedBlockCourier).toHaveBeenCalledWith(friendship.friend.id);
        await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
        expect(announced()).toEqual([`${handle} is blocked.`]);
        expect(mockedRemoveFriend).not.toHaveBeenCalled();
      },
    );

    it('blocks no one if the courier thinks better of it', async () => {
      await openPageOf(anna);
      await fireEvent.press(button('Block @anna'));

      await chooseInAlert('Cancel');

      expect(mockedBlockCourier).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(announced()).toEqual([]);
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(button('Block @anna')).toBeEnabled();
      expect(button('Block @anna')).not.toBeBusy();
    });

    /**
     * A block that did not go through must not look as if it had: the page
     * stays, says why on screen and aloud, and the courier can try again.
     */
    it('says why a block did not go through, aloud as well, and stays', async () => {
      const offline = 'No connection. Check your network and try again.';
      mockedBlockCourier.mockRejectedValue(new RpcError(offline, null));
      await openPageOf(anna);
      await fireEvent.press(button('Block @anna'));

      await chooseInAlert('Block');

      expect(await screen.findByText(offline)).toBeOnTheScreen();
      expect(announced()).toEqual([offline]);
      // Whatever went wrong, what the two are to each other may have changed with it.
      await waitFor(() => expect(mockedFetchFriendships).toHaveBeenCalledTimes(2));
      expect(mockBack).not.toHaveBeenCalled();
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(button('Block @anna')).toBeEnabled();
      expect(button('Block @anna')).not.toBeBusy();
      expect(button('Remove friend')).toBeEnabled();
    });

    it('tries a block again without leaving the old error up', async () => {
      const offline = 'No connection. Check your network and try again.';
      const retrying = deferred<BlockOutcome>();
      mockedBlockCourier
        .mockRejectedValueOnce(new RpcError(offline, null))
        .mockReturnValueOnce(retrying.promise);
      await openPageOf(anna);
      await fireEvent.press(button('Block @anna'));
      await chooseInAlert('Block');
      expect(await screen.findByText(offline)).toBeOnTheScreen();
      await waitFor(() => expect(button('Block @anna')).toBeEnabled());

      await fireEvent.press(button('Block @anna'));
      await chooseInAlert('Block');

      expect(screen.queryByText(offline)).toBeNull();
      await act(async () => retrying.resolve('blocked'));
      await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
      expect(mockedBlockCourier).toHaveBeenCalledTimes(2);
      expect(announced()).toEqual([offline, '@anna is blocked.']);
    });

    // The courier deleted their account between the list and the block.
    it('says the courier is gone when a block finds them gone', async () => {
      mockedBlockCourier.mockImplementation(async () => {
        serve(() => [ben, carla, dora]);
        throw new RpcError(REFUSALS.courier_not_found, 'courier_not_found');
      });
      await openPageOf(anna);
      await fireEvent.press(button('Block @anna'));

      await chooseInAlert('Block');

      expect(await screen.findByText(GONE)).toBeOnTheScreen();
      expect(announced()).toEqual([REFUSALS.courier_not_found]);
      expect(mockBack).not.toHaveBeenCalled();
      expect(button('Back to friends')).toBeEnabled();
    });

    it.each(STANDINGS)('opens the report form about %s', async (_, friendship) => {
      await openPageOf(friendship);

      await fireEvent.press(button(`Report @${friendship.friend.username}`));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/report',
        params: { courier: friendship.friend.id, username: friendship.friend.username },
      });
      // Whether to block as well is asked on the report form itself.
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockedBlockCourier).not.toHaveBeenCalled();
    });
  });

  describe('while an answer is on its way', () => {
    it('takes nothing else while a block is on its way, and goes back once it is made', async () => {
      const blocking = deferred<BlockOutcome>();
      mockedBlockCourier.mockReturnValue(blocking.promise);
      await openPageOf(anna);
      await fireEvent.press(button('Block @anna'));

      await chooseInAlert('Block');

      expect(button('Block @anna')).toBeBusy();
      expect(button('Block @anna')).toBeDisabled();
      for (const other of ['Write a letter', 'Remove friend', 'Report @anna']) {
        expect(button(other)).toBeDisabled();
        expect(button(other)).not.toBeBusy();
        await fireEvent.press(button(other));
      }
      await fireEvent.press(button('Block @anna'));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();

      await act(async () => blocking.resolve('blocked'));

      await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
      expect(mockedBlockCourier).toHaveBeenCalledTimes(1);
      expect(mockedRemoveFriend).not.toHaveBeenCalled();
    });

    it('shows the accept, not a decline, as the answer on its way, and takes no other', async () => {
      const accepting = deferred<void>();
      mockedAcceptFriend.mockReturnValue(accepting.promise);
      await openPageOf(carla);

      await fireEvent.press(button('Accept'));

      expect(button('Accept')).toBeBusy();
      expect(button('Decline')).toBeDisabled();
      expect(button('Decline')).not.toBeBusy();
      expect(button('Block @carla')).toBeDisabled();
      expect(button('Report @carla')).toBeDisabled();
      await fireEvent.press(button('Accept'));
      await fireEvent.press(button('Decline'));
      await fireEvent.press(button('Block @carla'));
      expect(mockedAcceptFriend).toHaveBeenCalledTimes(1);
      expect(mockedRemoveFriend).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();

      await act(async () => accepting.resolve());

      await waitFor(() => expect(button('Decline')).toBeEnabled());
      expect(mockedAcceptFriend).toHaveBeenCalledTimes(1);
    });

    /**
     * Each answer that gets through goes back once. A second Decline let
     * through while the first was on its way would go back twice - past the
     * friends list as well.
     */
    it('declines once, and goes back once, however often Decline is pressed', async () => {
      const declining = deferred<void>();
      mockedRemoveFriend.mockReturnValue(declining.promise);
      await openPageOf(carla);

      await fireEvent.press(button('Decline'));
      await fireEvent.press(button('Decline'));

      expect(mockedRemoveFriend).toHaveBeenCalledTimes(1);
      expect(button('Decline')).toBeBusy();
      expect(button('Accept')).toBeDisabled();
      expect(button('Accept')).not.toBeBusy();
      expect(button('Block @carla')).toBeDisabled();
      expect(button('Report @carla')).toBeDisabled();

      await act(async () => declining.resolve());

      await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
      expect(mockedRemoveFriend).toHaveBeenCalledTimes(1);
      expect(mockedAcceptFriend).not.toHaveBeenCalled();
    });
  });

  describe('a courier no longer listed', () => {
    // Between the list and this page, Carla withdrew her request.
    it('says the courier is no longer among friends or requests, and goes back to friends', async () => {
      serve(() => [anna, ben, dora]);
      mockParams.id = carla.friend.id;
      await renderScreen(<CourierScreen />);

      expect(await screen.findByText(GONE)).toBeOnTheScreen();
      expect(spinners()).toHaveLength(0);
      expect(screen.queryByText('Carla Ruiz')).toBeNull();
      // Nothing about them is left to act on: the way back is the only button.
      expect(screen.getAllByRole('button')).toHaveLength(1);

      await fireEvent.press(button('Back to friends'));

      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading', () => {
    /**
     * Until the list has loaded, the page cannot tell a courier who has gone
     * from one it has not heard about yet, so it claims neither.
     */
    it('shows a spinner, and nothing about anyone, until the list has loaded', async () => {
      mockedFetchFriendships.mockReturnValue(new Promise<Friendship[]>(() => {}));
      await renderScreen(<CourierScreen />);

      expect(spinners()).toHaveLength(1);
      expect(screen.queryByText(GONE)).toBeNull();
      expect(screen.queryByText('Anna Weber')).toBeNull();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('says why the list could not be loaded, rather than that the courier is gone, and tries again', async () => {
      const failure = 'Your friends could not be loaded. Check your connection.';
      mockedFetchFriendships.mockRejectedValueOnce(new RpcError(failure, null));
      await renderScreen(<CourierScreen />);
      expect(await screen.findByText(failure)).toBeOnTheScreen();
      expect(screen.queryByText(GONE)).toBeNull();
      expect(spinners()).toHaveLength(0);

      await fireEvent.press(button('Try again'));

      expect(await screen.findByText('Anna Weber')).toBeOnTheScreen();
      expect(screen.queryByText(failure)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
    });
  });
});
