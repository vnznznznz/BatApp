import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import ComposeScreen from '@/app/(app)/compose';
import { MESSAGE_MAX_LENGTH } from '@/constants/config';
import { Colors } from '@/constants/theme';
import { fetchFriendships, type Friendship } from '@/features/friends/friends';
import { sendMessage, type Dispatch } from '@/features/messages/messages';
import type { Profile } from '@/features/profile/use-profile';
import { fetchRoost, type Bat } from '@/features/roost/roost';
import { formatTimestamp } from '@/lib/format';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockSetParams = jest.fn();
/** The route's search params, as the screen reads them. */
const mockParams: { to?: string } = {};

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: jest.fn(),
      replace: mockReplace,
      dismissTo: mockDismissTo,
      setParams: mockSetParams,
    }),
    useLocalSearchParams: () => mockParams,
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
  };
});

// The screen is under test, not the network. Every call that reaches Supabase
// is replaced; the pure helpers are kept, so the friends offered, the bats
// counted and the checks a letter must pass are the real ones.
jest.mock('@/features/friends/friends', () => ({
  ...jest.requireActual('@/features/friends/friends'),
  fetchFriendships: jest.fn(),
  requestFriend: jest.fn(),
  acceptFriend: jest.fn(),
  removeFriend: jest.fn(),
}));

jest.mock('@/features/messages/messages', () => ({
  ...jest.requireActual('@/features/messages/messages'),
  sendMessage: jest.fn(),
}));

jest.mock('@/features/roost/roost', () => ({
  ...jest.requireActual('@/features/roost/roost'),
  fetchRoost: jest.fn(),
}));

const mockProfileState: { profile: Profile | null; isLoading: boolean; error: string | null } = {
  profile: null,
  isLoading: false,
  error: null,
};

jest.mock('@/features/profile/use-profile', () => ({
  useProfile: () => ({ ...mockProfileState }),
}));

const mockedFetchFriendships = jest.mocked(fetchFriendships);
const mockedFetchRoost = jest.mocked(fetchRoost);
const mockedSendMessage = jest.mocked(sendMessage);

/** A fixed moment, so every countdown on screen is exact. */
const NOW = new Date('2026-10-31T21:00:00Z').getTime();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const courier: Profile = {
  id: 'user-mara',
  username: 'mara',
  displayName: 'Mara Lind',
  avatarUrl: null,
  move: null,
  city: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
};

/** A friend in Munich. The server puts her 505 km away: about 6h 18m by bat. */
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

/** A friend who has not chosen a city, so no bat can find him. */
const ben: Friendship = {
  id: 'friendship-ben',
  status: 'accepted',
  direction: 'incoming',
  friend: { id: 'user-ben', username: 'ben', displayName: 'Ben Okafor', city: null },
  route: null,
  requestedAt: new Date(NOW - 5 * DAY),
  acceptedAt: new Date(NOW - 4 * DAY),
};

/** Asked the courier, who has not answered: not a friend yet. */
const carla: Friendship = {
  id: 'friendship-carla',
  status: 'pending',
  direction: 'incoming',
  friend: { id: 'user-carla', username: 'carla', displayName: 'Carla Ruiz', city: null },
  route: null,
  requestedAt: new Date(NOW - 2 * HOUR),
  acceptedAt: null,
};

/** Asked by the courier, and has not answered: not a friend yet. */
const dora: Friendship = {
  id: 'friendship-dora',
  status: 'pending',
  direction: 'outgoing',
  friend: { id: 'user-dora', username: 'dora', displayName: null, city: null },
  route: null,
  requestedAt: new Date(NOW - 3 * DAY),
  acceptedAt: null,
};

function batAtHome(slot: number): Bat {
  return { id: `bat-${slot}`, slot, status: 'available', flight: null };
}

/** A bat carrying a letter to Anna, landing `landsIn` ms after the fixed now. */
function batInFlight(slot: number, landsIn: number): Bat {
  return {
    id: `bat-${slot}`,
    slot,
    status: 'flying',
    flight: {
      messageId: `letter-${slot}`,
      recipient: { id: 'user-anna', username: 'anna', displayName: 'Anna Weber' },
      sentAt: new Date(NOW - HOUR),
      deliverAt: new Date(NOW + landsIn),
      distanceKm: 504.6,
    },
  };
}

const everyBatHome = () => [batAtHome(1), batAtHome(2), batAtHome(3)];

/** Every bat out; the first one home lands in a little over 45 minutes. */
const everyBatOut = () => [
  batInFlight(1, 3 * HOUR),
  batInFlight(2, 45 * MINUTE + 30 * SECOND),
  batInFlight(3, 2 * HOUR),
];

/** What the server answers from now on: fresh objects on every call, as the real fetchers return. */
const serveFriends = (list: () => Friendship[]) =>
  mockedFetchFriendships.mockImplementation(async () => list());
const serveRoost = (roost: () => Bat[]) => mockedFetchRoost.mockImplementation(async () => roost());

/**
 * The server's answer to a letter for Anna. It lands 6h 20m from now - not the
 * 6h 18m estimate shown before sending - so a screen that worked the arrival
 * out for itself would be caught showing the wrong one.
 */
const dispatchToAnna = (): Dispatch => ({
  id: 'letter-to-anna',
  deliverAt: new Date(NOW + 6 * HOUR + 20 * MINUTE + 30 * SECOND),
  distanceKm: 504.6,
});

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

const letterField = () => screen.getByLabelText('Your letter');
const sendButton = () => screen.getByRole('button', { name: 'Send by bat' });

/** Opens the screen with a letter addressed to `friendId`, once the bats are counted. */
async function openLetterTo(friendId: string) {
  mockParams.to = friendId;
  await renderScreen(<ComposeScreen />);
  await screen.findByText(/^(\d+ of \d+ bats at home|All your bats are out)\./);
}

async function writeAndSend(text: string) {
  await fireEvent.changeText(letterField(), text);
  await fireEvent.press(sendButton());
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

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockPush.mockClear();
  mockReplace.mockClear();
  mockDismissTo.mockClear();
  mockSetParams.mockClear();
  delete mockParams.to;
  mockProfileState.profile = courier;
  mockProfileState.isLoading = false;
  mockProfileState.error = null;
  mockedFetchFriendships.mockReset();
  serveFriends(() => [anna, ben, carla, dora]);
  mockedFetchRoost.mockReset();
  serveRoost(everyBatHome);
  mockedSendMessage.mockReset();
  mockedSendMessage.mockImplementation(async () => dispatchToAnna());
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ComposeScreen', () => {
  describe('choosing who it is for', () => {
    it('asks who the letter is for, and lists each friend with the way there', async () => {
      await renderScreen(<ComposeScreen />);

      expect(await screen.findByText('Who is it for?')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: /^Anna Weber/ })).toBeEnabled();
      expect(screen.getByText('Munich, DE · 505 km · about 6h 18m')).toBeOnTheScreen();
      expect(screen.getByText('@ben has not chosen a city yet')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Your letter')).toBeNull();
    });

    it('offers only friends, not people with a request still open either way', async () => {
      await renderScreen(<ComposeScreen />);
      await screen.findByText('Who is it for?');

      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(screen.getByText('Ben Okafor')).toBeOnTheScreen();
      expect(screen.queryByText('Carla Ruiz')).toBeNull();
      expect(screen.queryByText(/dora/)).toBeNull();
    });

    it('picks a friend by putting them in the route', async () => {
      await renderScreen(<ComposeScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: /^Anna Weber/ }));

      expect(mockSetParams).toHaveBeenCalledWith({ to: 'user-anna' });
    });

    it('cannot pick a friend no bat can find', async () => {
      await renderScreen(<ComposeScreen />);
      const benRow = await screen.findByRole('button', { name: /^Ben Okafor/ });

      expect(benRow).toBeDisabled();
      await fireEvent.press(benRow);

      expect(mockSetParams).not.toHaveBeenCalled();
    });

    it('says letters only go to friends when the one in the route is not one', async () => {
      mockParams.to = 'user-dora';
      await renderScreen(<ComposeScreen />);

      expect(
        await screen.findByText('You can only write to friends. Choose one below.'),
      ).toBeOnTheScreen();
      expect(screen.getByText('Who is it for?')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: /^Anna Weber/ })).toBeOnTheScreen();
      expect(screen.queryByLabelText('Your letter')).toBeNull();
    });

    it('sends someone with nobody to write to off to find friends', async () => {
      serveFriends(() => [carla, dora]);
      await renderScreen(<ComposeScreen />);

      expect(await screen.findByText('You have no friends to write to yet.')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Find friends' }));

      expect(mockReplace).toHaveBeenCalledWith('/friends');
    });

    it('says so when friends cannot be loaded', async () => {
      mockedFetchFriendships.mockRejectedValue(
        new Error('Your friends could not be loaded. Check your connection.'),
      );
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);

      expect(
        await screen.findByText('Your friends could not be loaded. Check your connection.'),
      ).toBeOnTheScreen();
      // Not knowing is not the same as knowing they are not a friend.
      expect(screen.queryByText('You can only write to friends. Choose one below.')).toBeNull();
      expect(screen.queryByText('You have no friends to write to yet.')).toBeNull();
    });
  });

  describe('writing', () => {
    /**
     * The flight time shown before sending is the server's estimate. Nothing
     * on this screen works out how long a bat flies.
     */
    it("shows who the letter is for and the server's estimate of the flight", async () => {
      await openLetterTo('user-anna');

      expect(screen.getByText('To')).toBeOnTheScreen();
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(screen.getByText('Munich, DE · 505 km · about 6h 18m')).toBeOnTheScreen();
      expect(screen.getByPlaceholderText('Dear Anna Weber,')).toBeOnTheScreen();
    });

    it('says how many bats are home, and that the letter takes one of them', async () => {
      serveRoost(() => [batAtHome(1), batInFlight(2, HOUR), batAtHome(3)]);
      await openLetterTo('user-anna');

      expect(
        screen.getByText(
          '2 of 3 bats at home. This letter takes one; it comes back when the letter lands.',
        ),
      ).toBeOnTheScreen();
      expect(sendButton()).toBeEnabled();
    });

    /**
     * Postgres counts characters where JavaScript counts UTF-16 units, and the
     * two disagree on every emoji. The counter has to agree with the server.
     */
    it('counts an emoji as one character, as the server does', async () => {
      await openLetterTo('user-anna');

      await fireEvent.changeText(letterField(), '🦇🦇🦇');

      expect(screen.getByText(`3 / ${MESSAGE_MAX_LENGTH}`)).toBeOnTheScreen();
      expect(screen.getByLabelText(`3 of ${MESSAGE_MAX_LENGTH} characters`)).toBeOnTheScreen();
    });

    it('lets a letter of emoji go up to the limit, though it is twice as long in UTF-16', async () => {
      await openLetterTo('user-anna');
      const letter = '🦇'.repeat(MESSAGE_MAX_LENGTH);

      await writeAndSend(letter);

      expect(mockedSendMessage).toHaveBeenCalledWith('user-anna', letter, expect.any(String));
    });

    it('marks the count once the letter is too long, and does not send it', async () => {
      await openLetterTo('user-anna');

      await fireEvent.changeText(letterField(), 'a'.repeat(MESSAGE_MAX_LENGTH));
      expect(screen.getByText(`${MESSAGE_MAX_LENGTH} / ${MESSAGE_MAX_LENGTH}`)).toHaveStyle({
        color: Colors.textMuted,
      });

      await fireEvent.changeText(letterField(), 'a'.repeat(MESSAGE_MAX_LENGTH + 1));
      expect(screen.getByText(`${MESSAGE_MAX_LENGTH + 1} / ${MESSAGE_MAX_LENGTH}`)).toHaveStyle({
        color: Colors.danger,
      });

      await fireEvent.press(sendButton());

      expect(
        screen.getByText(`A letter can be at most ${MESSAGE_MAX_LENGTH} characters.`),
      ).toBeOnTheScreen();
      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty letter', ''],
      ['a letter of nothing but blank space', '  \n\t  '],
    ])('does not send %s', async (_, text) => {
      await openLetterTo('user-anna');

      await writeAndSend(text);

      expect(screen.getByText('Write something first.')).toBeOnTheScreen();
      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    it('lets go of a complaint once the letter is changed', async () => {
      await openLetterTo('user-anna');
      await writeAndSend('   ');
      expect(screen.getByText('Write something first.')).toBeOnTheScreen();

      await fireEvent.changeText(letterField(), 'Dear Anna,');

      expect(screen.queryByText('Write something first.')).toBeNull();
    });
  });

  describe('sending', () => {
    /**
     * A letter costs one of three bats. A second tap while the first is on its
     * way must not send the letter again and cost a second bat.
     */
    it('sends the letter to the chosen friend exactly once, however often the button is pressed', async () => {
      const sending = deferred<Dispatch>();
      mockedSendMessage.mockReturnValue(sending.promise);
      await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), 'See you at the lake.');

      await fireEvent.press(sendButton());
      expect(sendButton()).toBeBusy();
      await fireEvent.press(sendButton());

      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
      expect(mockedSendMessage).toHaveBeenCalledWith(
        'user-anna',
        'See you at the lake.',
        expect.any(String),
      );

      await act(async () => sending.resolve(dispatchToAnna()));

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    });

    /**
     * The arrival is the server's answer, not the estimate shown beforehand
     * worked forward on the phone.
     */
    it('shows when the bat will land, as the server set it', async () => {
      const { deliverAt } = dispatchToAnna();
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(
        screen.getByText(
          `It will reach Anna Weber in Munich in 6h 20m, at ${formatTimestamp(deliverAt)}.`,
        ),
      ).toBeOnTheScreen();
      expect(screen.getByText('505 km as the bat flies.')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Your letter')).toBeNull();
    });

    it('counts down to the landing', async () => {
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      expect(await screen.findByText(/ in 6h 20m, at /)).toBeOnTheScreen();

      await letTimePass(MINUTE);

      expect(screen.getByText(/ in 6h 19m, at /)).toBeOnTheScreen();
    });

    // formatDuration says "any moment now" once a time has passed, which does
    // not fit after "It will reach Anna in ...".
    it('does not say the bat will reach them "in any moment now" once it is due', async () => {
      mockedSendMessage.mockResolvedValue({
        ...dispatchToAnna(),
        deliverAt: new Date(NOW + 20 * MINUTE + 30 * SECOND),
      });
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      expect(await screen.findByText(/ in 20m, at /)).toBeOnTheScreen();

      // Only the clock moves here, and nothing waits on a re-render, so one
      // long step is enough.
      await act(() => jest.advanceTimersByTimeAsync(21 * MINUTE));

      expect(screen.getByText(/Anna Weber/)).toBeOnTheScreen();
      expect(screen.queryByText(/\bin any moment now/)).toBeNull();
    });

    it('keeps the confirmation on screen if the friend list changes behind it', async () => {
      const listening = jest.mocked(AppState.addEventListener);
      const alreadyListening = listening.mock.calls.length;
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();

      // Anna ends the friendship while the courier is in another app. Coming
      // back fetches the list again, and she is no longer in it.
      serveFriends(() => [ben]);
      await act(async () => {
        for (const [, listener] of listening.mock.calls.slice(alreadyListening)) {
          listener('active');
        }
      });

      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Your bat is on its way')).toBeOnTheScreen();
      expect(
        screen.getByText(/^It will reach Anna Weber in Munich in 6h 20m, at /),
      ).toBeOnTheScreen();
    });

    it('goes back to the roost once the bat is on its way', async () => {
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');

      await fireEvent.press(await screen.findByRole('button', { name: 'Back to the roost' }));

      expect(mockDismissTo).toHaveBeenCalledWith('/home');
    });

    it('says why the server refused, keeps the letter, and counts the bats again', async () => {
      serveRoost(() => [batAtHome(1), batInFlight(2, HOUR), batInFlight(3, 2 * HOUR)]);
      mockedSendMessage.mockImplementation(async () => {
        // The bat that looked free left with a letter sent from another phone.
        serveRoost(() => [
          batInFlight(1, 30 * MINUTE + 30 * SECOND),
          batInFlight(2, HOUR),
          batInFlight(3, 2 * HOUR),
        ]);
        throw new RpcError(REFUSALS.no_available_bat, 'no_available_bat');
      });
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');

      expect(await screen.findByText(REFUSALS.no_available_bat)).toBeOnTheScreen();
      expect(
        await screen.findByText('All your bats are out. The next one is home in 30m.'),
      ).toBeOnTheScreen();
      expect(mockedFetchRoost).toHaveBeenCalledTimes(2);
      expect(sendButton()).toBeDisabled();
      expect(letterField()).toHaveDisplayValue('See you at the lake.');
    });

    it('keeps the letter after a failure, so it can be sent again', async () => {
      mockedSendMessage.mockRejectedValueOnce(
        new RpcError('No connection. Check your network and try again.', null),
      );
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');

      expect(
        await screen.findByText('No connection. Check your network and try again.'),
      ).toBeOnTheScreen();
      expect(letterField()).toHaveDisplayValue('See you at the lake.');

      await fireEvent.press(sendButton());

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledTimes(2);
      expect(mockedSendMessage).toHaveBeenLastCalledWith(
        'user-anna',
        'See you at the lake.',
        expect.any(String),
      );
    });

    /**
     * A failure may have been a lost answer to a send that went. Retrying the
     * same letter under the same ref lets the server answer with that letter
     * instead of sending a copy on a second bat.
     */
    it('says, while a move settles, that letters still leave from the old city', async () => {
      const settlesAt = new Date(Date.now() + 20 * 3_600_000);
      mockProfileState.profile = {
        ...courier,
        move: { from: { id: 2950159, name: 'Berlin', countryCode: 'DE' }, settlesAt },
      };
      await openLetterTo('user-anna');

      expect(
        screen.getByText(
          `Your bats still leave from Berlin, DE until ${formatTimestamp(settlesAt)}, when your move settles.`,
        ),
      ).toBeOnTheScreen();
    });

    it('retries the same letter as the same letter', async () => {
      mockedSendMessage.mockRejectedValueOnce(
        new RpcError('No connection. Check your network and try again.', null),
      );
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');
      await screen.findByText('No connection. Check your network and try again.');
      await fireEvent.press(sendButton());
      await screen.findByText('Your bat is on its way');

      const [first, second] = mockedSendMessage.mock.calls;
      expect(first?.[2]).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
      expect(second?.[2]).toBe(first?.[2]);
    });

    it('treats a letter changed after a failure as a new letter', async () => {
      mockedSendMessage.mockRejectedValueOnce(
        new RpcError('No connection. Check your network and try again.', null),
      );
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');
      await screen.findByText('No connection. Check your network and try again.');
      await fireEvent.changeText(letterField(), 'See you at the lake at six.');
      await fireEvent.press(sendButton());
      await screen.findByText('Your bat is on its way');

      const [first, second] = mockedSendMessage.mock.calls;
      expect(second?.[2]).not.toBe(first?.[2]);
    });
  });

  describe('when a letter cannot go', () => {
    it('cannot send while every bat is out, and says when the next one is home', async () => {
      serveRoost(everyBatOut);
      await openLetterTo('user-anna');

      expect(
        screen.getByText('All your bats are out. The next one is home in 45m.'),
      ).toBeOnTheScreen();
      expect(sendButton()).toBeDisabled();

      await writeAndSend('See you at the lake.');

      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    /** Three bats, never more. With every one of them out, the only way is to wait. */
    it('never offers a way to buy more bats, even with every bat out', async () => {
      serveRoost(everyBatOut);
      await openLetterTo('user-anna');

      expect(
        screen.queryAllByText(/buy|purchase|upgrade|premium|subscri|unlock|more bats|extra bat/i),
      ).toHaveLength(0);
    });

    it('asks for a city before a letter can go', async () => {
      // Until the courier has a city, the server has no route to any friend.
      mockProfileState.profile = { ...courier, city: null };
      serveFriends(() => [{ ...anna, route: null }]);
      await openLetterTo('user-anna');

      expect(
        screen.getByText('Choose your city first. Your bats need to know where home is.'),
      ).toBeOnTheScreen();
      expect(sendButton()).toBeDisabled();
    });

    it('cannot send to a friend who has not chosen a city', async () => {
      await openLetterTo('user-ben');

      expect(screen.getByText('Ben Okafor')).toBeOnTheScreen();
      expect(screen.getByText('@ben has not chosen a city yet')).toBeOnTheScreen();
      expect(sendButton()).toBeDisabled();
    });

    it('does not offer to send until it knows a bat is home', async () => {
      mockedFetchRoost.mockReturnValue(new Promise<Bat[]>(() => {}));
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);

      expect(await screen.findByLabelText('Your letter')).toBeOnTheScreen();
      expect(sendButton()).toBeDisabled();
      expect(screen.queryByText(/bats at home|bats are out/)).toBeNull();
    });

    it('does not offer to send until it knows where home is', async () => {
      mockProfileState.profile = null;
      mockProfileState.isLoading = true;
      await openLetterTo('user-anna');

      expect(sendButton()).toBeDisabled();
      // Nor does it ask for a city it has not yet had the chance to read.
      expect(
        screen.queryByText('Choose your city first. Your bats need to know where home is.'),
      ).toBeNull();
    });

    // With no roost, no bat counts as home and "Send by bat" is disabled. A
    // courier holding a letter that will not go needs to be told why.
    it('says why a letter cannot go when the bats could not be counted', async () => {
      mockedFetchRoost.mockRejectedValue(
        new Error('Your roost could not be loaded. Check your connection.'),
      );
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);
      expect(await screen.findByLabelText('Your letter')).toBeOnTheScreen();

      expect(
        await screen.findByText('Your roost could not be loaded. Check your connection.'),
      ).toBeOnTheScreen();
      expect(sendButton()).toBeDisabled();
    });

    // Without a profile no city is known, so "Send by bat" is disabled, and the
    // city prompt cannot appear either: it needs a profile to know the city is
    // missing. Only the load error can explain the button.
    it('says why a letter cannot go when the profile could not be loaded', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = 'Your profile could not be loaded. Check your connection.';
      await openLetterTo('user-anna');

      expect(
        screen.getByText('Your profile could not be loaded. Check your connection.'),
      ).toBeOnTheScreen();
      expect(sendButton()).toBeDisabled();
    });

    /**
     * Fetching is what lands a letter and brings its bat home: the server
     * delivers whatever is due before it answers. A courier waiting here for
     * the bat this screen says is "home in 1m" must be able to send then,
     * without leaving the screen and losing what they wrote.
     */
    it('lets the letter go once the next bat is home, without leaving the screen', async () => {
      serveRoost(() => [batInFlight(1, MINUTE), batInFlight(2, HOUR), batInFlight(3, 2 * HOUR)]);
      await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), 'See you at the lake.');
      expect(sendButton()).toBeDisabled();

      // The server has landed the letter by the time it is next asked.
      serveRoost(() => [batAtHome(1), batInFlight(2, HOUR), batInFlight(3, 2 * HOUR)]);
      await letTimePass(MINUTE + 2 * SECOND);

      expect(mockedFetchRoost).toHaveBeenCalledTimes(2);
      expect(sendButton()).toBeEnabled();
      expect(letterField()).toHaveDisplayValue('See you at the lake.');
    });

    // formatDuration says "any moment now" once a time has passed, which does
    // not fit after "The next one is home in ...".
    it('does not say the next bat is home "in any moment now" once it is due', async () => {
      serveRoost(() => [
        batInFlight(1, 10 * SECOND),
        batInFlight(2, HOUR),
        batInFlight(3, 2 * HOUR),
      ]);
      await openLetterTo('user-anna');

      await letTimePass(10 * SECOND);

      expect(screen.getByText(/^All your bats are out\./)).toBeOnTheScreen();
      expect(screen.queryByText(/home in any moment now/)).toBeNull();
    });
  });
});
