import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import CourierScreen from '@/app/(app)/courier/[id]';
import {
  acceptFriend,
  fetchFriendships,
  removeFriend,
  withdrawRequest,
  type Friendship,
} from '@/features/friends/friends';
import type { Profile } from '@/features/profile/use-profile';
import { blockCourier, type BlockOutcome } from '@/features/safety/safety';
import * as renewal from '@/lib/renewal';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work that would otherwise
// count against whichever test runs first.
jest.setTimeout(20_000);

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
/** The route's search params: whose page this is. */
const mockParams = { id: 'user-anna' };
/** Whether the page is still in front when an answer comes back. */
const mockFocus = { focused: true };
/** The focus effects of the page as it is now, to run again as it comes back into view. */
const mockFocusEffects = new Set<() => void | (() => void)>();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      replace: jest.fn(),
      dismissTo: mockDismissTo,
    }),
    useLocalSearchParams: () => mockParams,
    useNavigation: () => ({ isFocused: () => mockFocus.focused }),
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
// replaced; the pure helpers that name a courier and describe where the two
// stand are kept, so what the page says is what it would say for real.
jest.mock('@/features/friends/friends', () => ({
  ...jest.requireActual('@/features/friends/friends'),
  fetchFriendships: jest.fn(),
  acceptFriend: jest.fn(),
  removeFriend: jest.fn(),
  withdrawRequest: jest.fn(),
}));

// Blocking is the one call the page makes into the safety module.
jest.mock('@/features/safety/safety', () => ({
  ...jest.requireActual('@/features/safety/safety'),
  blockCourier: jest.fn(),
}));

/** The courier's profile as the database has it now, and how often it was read. */
const mockProfileState: { profile: Profile | null; reads: number } = { profile: null, reads: 0 };

// As the real hook does, it holds what it read last, and reads again each time
// the page comes into view - the first time included - and when asked to.
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

/** The courier whose app this is: in Berlin, unless a test says otherwise. */
const courier: Profile = {
  id: 'user-mara',
  username: 'mara',
  displayName: 'Mara Lind',
  avatarUrl: null,
  move: null,
  city: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
};

const NO_CITY_OF_YOUR_OWN =
  'You have not chosen your city yet, so your bats cannot carry a letter anywhere. ' +
  'Choose it here, or in your profile.';

const mockedFetchFriendships = jest.mocked(fetchFriendships);
const mockedAcceptFriend = jest.mocked(acceptFriend);
const mockedRemoveFriend = jest.mocked(removeFriend);
const mockedWithdrawRequest = jest.mocked(withdrawRequest);
const mockedBlockCourier = jest.mocked(blockCourier);

/**
 * A fixed moment, in the reader's local time rather than UTC: "today" and
 * "yesterday" are the reader's days, and an instant given in UTC would fall on
 * a different one depending on where the tests run. Every date below is local
 * for the same reason, so the standing line can be written out as it reads.
 */
const NOW = new Date(2026, 9, 31, 21, 0).getTime();

/** Days the standing line names, seen from NOW. */
const EARLIER_TODAY = new Date(2026, 9, 31, 0, 20);
const YESTERDAY = new Date(2026, 9, 30, 23, 50);
const OCT_2 = new Date(2026, 9, 2, 17, 45);
const LAST_YEAR = new Date(2025, 11, 24, 18, 0);
/** Before all of those: when someone who became a friend on one of them was asked. */
const ASKED_LONG_AGO = new Date(2025, 10, 30, 9, 0);

/**
 * A friend in Munich, with the route the server worked out for a bat. The
 * courier asked her on 21 Oct, and she said yes twenty minutes ago.
 */
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
  requestedAt: new Date(2026, 9, 21, 18, 30),
  acceptedAt: new Date(2026, 9, 31, 20, 40),
};

/** A friend who has not chosen a city, so there is no route to them. */
const ben: Friendship = {
  id: 'friendship-ben',
  status: 'accepted',
  direction: 'incoming',
  friend: { id: 'user-ben', username: 'ben', displayName: 'Ben Okafor', city: null },
  route: null,
  requestedAt: new Date(2026, 9, 26, 12, 0),
  acceptedAt: new Date(2026, 9, 27, 9, 15),
};

/** Someone who asked two hours ago. Asking shares your name, but not yet your city. */
const carla: Friendship = {
  id: 'friendship-carla',
  status: 'pending',
  direction: 'incoming',
  friend: { id: 'user-carla', username: 'carla', displayName: 'Carla Ruiz', city: null },
  route: null,
  requestedAt: new Date(2026, 9, 31, 19, 0),
  acceptedAt: null,
};

/** Someone the courier asked on 28 Oct. Until they accept, the server withholds their name and city. */
const dora: Friendship = {
  id: 'friendship-dora',
  status: 'pending',
  direction: 'outgoing',
  friend: { id: 'user-dora', username: 'dora', displayName: null, city: null },
  route: null,
  requestedAt: new Date(2026, 9, 28, 21, 0),
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

/**
 * Waits for the page to take the courier to the friends list, and checks it
 * went once, and by name. Never one step back: by the time an answer comes the
 * courier may have gone on to another screen, and a step back would leave that
 * one instead.
 */
async function expectWentToFriends() {
  await waitFor(() => expect(mockDismissTo).toHaveBeenCalledTimes(1));
  expect(mockDismissTo).toHaveBeenCalledWith('/friends');
  expect(mockBack).not.toHaveBeenCalled();
}

/** The page has taken the courier nowhere. */
function expectStayed() {
  expect(mockDismissTo).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
}

/** Comes back to the page, as when the picker on top of it is popped. */
const comeBack = () =>
  act(async () => {
    for (const effect of [...mockFocusEffects]) effect();
  });

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
  mockDismissTo.mockClear();
  mockParams.id = 'user-anna';
  mockFocus.focused = true;
  mockFocusEffects.clear();
  mockProfileState.profile = courier;
  mockProfileState.reads = 0;
  mockedFetchFriendships.mockReset();
  serve(() => [anna, ben, carla, dora]);
  mockedAcceptFriend.mockReset().mockResolvedValue(undefined);
  mockedRemoveFriend.mockReset().mockResolvedValue(undefined);
  mockedWithdrawRequest.mockReset().mockResolvedValue(undefined);
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
      expect(screen.queryByText(/21 Oct/)).toBeNull();
    });

    /**
     * "Since" takes the day as it is, where "asked" takes an "on": "Friends
     * since 2 Oct", but "You asked on 2 Oct". The page once said "Friends
     * since on 2 Oct".
     */
    it('says since which day they have been friends, with no "on" before the date', async () => {
      const friendship: Friendship = { ...anna, requestedAt: ASKED_LONG_AGO, acceptedAt: OCT_2 };
      serve(() => [friendship]);
      await openPageOf(friendship);

      expect(screen.getByText('Friends since 2 Oct')).toBeOnTheScreen();
      expect(screen.queryByText(/since on/)).toBeNull();
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

    /**
     * Without a city of their own, no bat can leave: Write a letter is off,
     * beside the friend's city, which looks like a reason but is not. The page
     * says the real one, and where to put it right.
     */
    it('says why no letter can be written while the courier has no city, and offers to choose one', async () => {
      mockProfileState.profile = { ...courier, city: null };
      const friendship: Friendship = { ...anna, route: null };
      serve(() => [friendship]);
      await openPageOf(friendship);

      expect(button('Write a letter')).toBeDisabled();
      expect(screen.getByText(NO_CITY_OF_YOUR_OWN)).toBeOnTheScreen();

      await fireEvent.press(button('Choose your city'));

      expect(mockPush).toHaveBeenCalledWith('/city-picker');
    });

    /**
     * The hook reads the profile again as the page comes into view. The page
     * asked as well, and made two requests for the same row at every focus.
     * (Found in the merged tree.)
     */
    it('reads the profile once each time the page comes into view', async () => {
      await openPageOf(ben);
      expect(mockProfileState.reads).toBe(1);

      await comeBack();

      expect(mockProfileState.reads).toBe(2);
    });

    /**
     * The picker saves the city itself and pops back. Ben has no city, so no
     * route appears to tell of it: the page has to read the profile again as
     * it comes back. (Found in review: it went on saying "You have not chosen
     * your city yet" until it was opened anew.)
     */
    it('lets go of it once the city is chosen, though the friend has none', async () => {
      mockProfileState.profile = { ...courier, city: null };
      serve(() => [ben]);
      await openPageOf(ben);
      expect(screen.getByText(NO_CITY_OF_YOUR_OWN)).toBeOnTheScreen();
      await fireEvent.press(button('Choose your city'));

      mockProfileState.profile = courier;
      await comeBack();

      expect(screen.queryByText(NO_CITY_OF_YOUR_OWN)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Choose your city' })).toBeNull();
      expect(screen.getByText('Has not chosen a city yet')).toBeOnTheScreen();
    });

    it('keeps Choose your city off while an action is on its way', async () => {
      mockProfileState.profile = { ...courier, city: null };
      const removing = deferred<void>();
      mockedRemoveFriend.mockReturnValue(removing.promise);
      serve(() => [ben]);
      await openPageOf(ben);
      await fireEvent.press(button('Remove friend'));
      await chooseInAlert('Remove');

      expect(button('Choose your city')).toBeDisabled();
      await fireEvent.press(button('Choose your city'));
      expect(mockPush).not.toHaveBeenCalled();

      await act(async () => removing.resolve());
    });

    it.each<[string, Profile | null, Friendship]>([
      ['the courier has a city', courier, anna],
      ['only the friend has none', courier, ben],
      // The list and the profile are read side by side as the page comes back;
      // a route means a city, whichever answered first.
      ['the list shows a route, the city chosen in the meantime', { ...courier, city: null }, anna],
      ['the profile is not known', null, ben],
      // No letter is offered to someone who has not said yes, so there is no
      // Write to explain.
      ['it is a request, not a friendship', { ...courier, city: null }, dora],
      ['someone is asking, not a friend', { ...courier, city: null }, carla],
    ])('says nothing of a city of their own when %s', async (_, profile, friendship) => {
      mockProfileState.profile = profile;
      serve(() => [friendship]);
      await openPageOf(friendship);

      expect(screen.queryByText(NO_CITY_OF_YOUR_OWN)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Choose your city' })).toBeNull();
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
      expectStayed();
      expect(announced()).toEqual([]);
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(button('Remove friend')).toBeEnabled();
    });

    it('removes a friend once the courier confirms, says so, and goes to the friends list', async () => {
      await openPageOf(anna);
      await fireEvent.press(button('Remove friend'));

      await chooseInAlert('Remove');

      expect(mockedRemoveFriend).toHaveBeenCalledTimes(1);
      expect(mockedRemoveFriend).toHaveBeenCalledWith('friendship-anna');
      await expectWentToFriends();
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
      expect(screen.getByText('Asked to be friends today')).toBeOnTheScreen();
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
      expectStayed();
      expect(screen.getByText('Seville, ES · about 21h 47m by bat')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
      expect(button('Write a letter')).toBeEnabled();
      expect(button('Remove friend')).toBeEnabled();
    });

    // As on the friends list: a request declined can be made again.
    it('declines without asking first, says so, and goes to the friends list', async () => {
      await openPageOf(carla);

      await fireEvent.press(button('Decline'));

      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockedRemoveFriend).toHaveBeenCalledTimes(1);
      expect(mockedRemoveFriend).toHaveBeenCalledWith('friendship-carla');
      expect(mockedAcceptFriend).not.toHaveBeenCalled();
      await expectWentToFriends();
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
      expect(screen.getByText('You asked on 28 Oct')).toBeOnTheScreen();
      expect(screen.queryByText('Has not chosen a city yet')).toBeNull();
      expect(button('Withdraw request')).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Write a letter' })).toBeNull();
    });

    it('withdraws the request without asking first, says so, and goes to the friends list', async () => {
      await openPageOf(dora);

      await fireEvent.press(button('Withdraw request'));

      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockedWithdrawRequest).toHaveBeenCalledTimes(1);
      expect(mockedWithdrawRequest).toHaveBeenCalledWith('friendship-dora', 'dora');
      // Never the call that ends whatever the row has become by now.
      expect(mockedRemoveFriend).not.toHaveBeenCalled();
      await expectWentToFriends();
      expect(announced()).toEqual(['Withdrew your request to @dora.']);
    });

    /**
     * Dora said yes while the page still showed the request. The withdrawal is
     * refused rather than ending the new friendship: the page says so, stays,
     * and now shows her as a friend - ending that goes through the usual question.
     */
    it('says so when they accepted in the meantime, stays, and keeps the friendship', async () => {
      const acceptedMeanwhile =
        '@dora accepted your request in the meantime, so you are friends now.';
      const accepted: Friendship = {
        ...dora,
        status: 'accepted',
        acceptedAt: new Date(NOW),
        friend: { ...dora.friend, displayName: 'Dora Lind' },
      };
      mockedWithdrawRequest.mockImplementation(async () => {
        serve(() => [anna, ben, carla, accepted]);
        throw new RpcError(acceptedMeanwhile, 'request_not_found');
      });
      await openPageOf(dora);

      await fireEvent.press(button('Withdraw request'));

      expect(await screen.findByText(acceptedMeanwhile)).toBeOnTheScreen();
      expect(announced()).toEqual([acceptedMeanwhile]);
      expect(await screen.findByText('Dora Lind')).toBeOnTheScreen();
      expectStayed();
      expect(mockedRemoveFriend).not.toHaveBeenCalled();

      await fireEvent.press(button('Remove friend'));

      expect(lastAlert().title).toBe('Stop being friends with Dora Lind?');
      expect(mockedRemoveFriend).not.toHaveBeenCalled();
    });
  });

  describe('when they became friends, or asked', () => {
    /**
     * The day in words while it is today or yesterday, as a date before that,
     * with the year once it was in another one - and "on" before a date only
     * where a verb comes before it.
     */
    it.each<[string, Friendship, string]>([
      [
        'a friend since yesterday',
        { ...anna, requestedAt: ASKED_LONG_AGO, acceptedAt: YESTERDAY },
        'Friends since yesterday',
      ],
      [
        'a friend since last year',
        { ...anna, requestedAt: ASKED_LONG_AGO, acceptedAt: LAST_YEAR },
        'Friends since 24 Dec 2025',
      ],
      [
        'someone who asked yesterday',
        { ...carla, requestedAt: YESTERDAY },
        'Asked to be friends yesterday',
      ],
      [
        'someone who asked earlier this year',
        { ...carla, requestedAt: OCT_2 },
        'Asked to be friends on 2 Oct',
      ],
      [
        'someone the courier asked earlier today',
        { ...dora, requestedAt: EARLIER_TODAY },
        'You asked today',
      ],
      [
        'someone the courier asked yesterday',
        { ...dora, requestedAt: YESTERDAY },
        'You asked yesterday',
      ],
      [
        'someone the courier asked last year',
        { ...dora, requestedAt: LAST_YEAR },
        'You asked on 24 Dec 2025',
      ],
    ])('words the standing line for %s', async (_, friendship, standing) => {
      serve(() => [friendship]);
      await openPageOf(friendship);

      expect(screen.getByText(standing)).toBeOnTheScreen();
    });
  });

  describe('safety', () => {
    it('sets blocking and reporting apart, and promises about a report only what the report form and the house rules promise', async () => {
      await openPageOf(anna);

      expect(screen.getByRole('header', { name: 'Safety' })).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Blocking ends any friendship or request between you, hides their letters from you ' +
            'and stops them asking again; @anna is not told. Reporting tells the person who ' +
            'runs Night Courier, who does not tell @anna who reported them, unless the law ' +
            'requires it.',
        ),
      ).toBeOnTheScreen();
      expect(button('Block @anna')).toBeEnabled();
      expect(button('Report @anna')).toBeEnabled();
    });

    it('asks before blocking, and says what a block does and what it does not', async () => {
      await openPageOf(anna);

      await fireEvent.press(button('Block @anna'));

      expect(mockedBlockCourier).not.toHaveBeenCalled();
      expect(lastAlert()).toEqual({
        title: 'Block @anna?',
        message:
          'Any friendship or request between you ends, and they cannot ask again. Their ' +
          'letters, already here or still in the air, are hidden from you; yours stay with ' +
          'them. They are not told, though they may notice. Blocking alone tells no one: to ' +
          'tell the person who runs Night Courier, report them instead - a report can block ' +
          'them as well.',
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
      'blocks %s once the courier confirms, says so, and goes to the friends list',
      async (_, friendship) => {
        const handle = `@${friendship.friend.username}`;
        await openPageOf(friendship);
        await fireEvent.press(button(`Block ${handle}`));
        expect(lastAlert().title).toBe(`Block ${handle}?`);

        await chooseInAlert('Block');

        expect(mockedBlockCourier).toHaveBeenCalledTimes(1);
        expect(mockedBlockCourier).toHaveBeenCalledWith(friendship.friend.id);
        await expectWentToFriends();
        expect(announced()).toEqual([`${handle} is blocked.`]);
        expect(mockedRemoveFriend).not.toHaveBeenCalled();
      },
    );

    it('blocks no one if the courier thinks better of it', async () => {
      await openPageOf(anna);
      await fireEvent.press(button('Block @anna'));

      await chooseInAlert('Cancel');

      expect(mockedBlockCourier).not.toHaveBeenCalled();
      expectStayed();
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
      expectStayed();
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
      await expectWentToFriends();
      expect(mockedBlockCourier).toHaveBeenCalledTimes(2);
      expect(announced()).toEqual([offline, '@anna is blocked.']);
    });

    // The courier deleted their account between the list and the block.
    it('says the courier is gone when a block finds them gone, and offers the way to the friends list', async () => {
      mockedBlockCourier.mockImplementation(async () => {
        serve(() => [ben, carla, dora]);
        throw new RpcError(REFUSALS.courier_not_found, 'courier_not_found');
      });
      await openPageOf(anna);
      await fireEvent.press(button('Block @anna'));

      await chooseInAlert('Block');

      expect(await screen.findByText(GONE)).toBeOnTheScreen();
      expect(announced()).toEqual([REFUSALS.courier_not_found]);
      expectStayed();
      expect(button('Back to friends')).toBeEnabled();

      await fireEvent.press(button('Back to friends'));

      await expectWentToFriends();
    });

    /**
     * Without `blocked`: they are not blocked yet, so the form offers to
     * block them as well, and whether to is asked there, not here.
     */
    it.each(STANDINGS)('opens the report form about %s', async (_, friendship) => {
      await openPageOf(friendship);

      await fireEvent.press(button(`Report @${friendship.friend.username}`));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/report',
        params: { courier: friendship.friend.id, username: friendship.friend.username },
      });
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockedBlockCourier).not.toHaveBeenCalled();
    });
  });

  describe('while an answer is on its way', () => {
    it('takes nothing else while a block is on its way, and goes to the friends list once it is made', async () => {
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
      // Not before the answer: until it comes, the block may yet fail.
      expectStayed();

      await act(async () => blocking.resolve('blocked'));

      await expectWentToFriends();
      expect(mockedBlockCourier).toHaveBeenCalledTimes(1);
      expect(mockedRemoveFriend).not.toHaveBeenCalled();
    });

    /**
     * The header's back button still works while a block is on its way. If the
     * courier has gone back - to the roost, even, where the friends list is no
     * longer in the stack - arriving at the friends list when the answer comes
     * would yank them away from wherever they are. (Found in review.)
     */
    it('stays where the courier has gone if they left before the block was made', async () => {
      const blocking = deferred<BlockOutcome>();
      mockedBlockCourier.mockReturnValue(blocking.promise);
      await openPageOf(anna);
      await fireEvent.press(button('Block @anna'));
      await chooseInAlert('Block');

      mockFocus.focused = false;
      await act(async () => blocking.resolve('blocked'));

      expect(mockedBlockCourier).toHaveBeenCalledTimes(1);
      expect(announced()).toContain('@anna is blocked.');
      expectStayed();
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
     * One answer, sent once. A second Decline let through while the first was
     * on its way would ask the server again - to be told there is no request
     * left - and that refusal would be said aloud after the decline.
     */
    it('declines once, and goes to the friends list once, however often Decline is pressed', async () => {
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

      await expectWentToFriends();
      expect(mockedRemoveFriend).toHaveBeenCalledTimes(1);
      expect(mockedAcceptFriend).not.toHaveBeenCalled();
      expect(announced()).toEqual(['Declined @carla.']);
    });
  });

  describe('a courier no longer listed', () => {
    /**
     * Between the list and this page, Carla withdrew her request. The way
     * back goes to the friends list by name, as its label says, whatever lies
     * under this page - the roost, when it was opened from a link.
     */
    it('says the courier is no longer among friends or requests, and goes to the friends list', async () => {
      serve(() => [anna, ben, dora]);
      mockParams.id = carla.friend.id;
      await renderScreen(<CourierScreen />);

      expect(await screen.findByText(GONE)).toBeOnTheScreen();
      expect(spinners()).toHaveLength(0);
      expect(screen.queryByText('Carla Ruiz')).toBeNull();
      // Nothing about them is left to act on: the way back is the only button.
      expect(screen.getAllByRole('button')).toHaveLength(1);

      await fireEvent.press(button('Back to friends'));

      await expectWentToFriends();
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
      const renewing = jest.spyOn(renewal, 'renewOnNextRequest');
      mockedFetchFriendships.mockRejectedValueOnce(new RpcError(failure, null));
      await renderScreen(<CourierScreen />);
      expect(await screen.findByText(failure)).toBeOnTheScreen();
      expect(screen.queryByText(GONE)).toBeNull();
      expect(spinners()).toHaveLength(0);

      expect(renewing).not.toHaveBeenCalled();
      await fireEvent.press(button('Try again'));

      expect(await screen.findByText('Anna Weber')).toBeOnTheScreen();
      expect(screen.queryByText(failure)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
      // A press: the session is renewed first if that failed a moment ago.
      expect(renewing).toHaveBeenCalledTimes(1);
      renewing.mockRestore();
    });
  });
});

/** The one thing left to do for an account that is suspended, besides writing to Night Courier. */
const mockSignOut = jest.fn(() => Promise.resolve());

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

describe('CourierScreen for a suspended account', () => {
  /** As on every page: "Try again" under the suspension would only be refused again. (Found in the browser.) */
  it('offers the way out, not Try again', async () => {
    mockSignOut.mockClear();
    mockedFetchFriendships.mockRejectedValue(
      new RpcError(REFUSALS.account_suspended, 'account_suspended'),
    );
    await renderScreen(<CourierScreen />);

    expect(await screen.findByText(REFUSALS.account_suspended)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await fireEvent.press(button('Sign out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
