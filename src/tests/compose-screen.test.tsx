import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import ComposeScreen from '@/app/(app)/compose';
import { MESSAGE_MAX_LENGTH } from '@/constants/config';
import { Colors } from '@/constants/theme';
import { fetchFriendships, type Friendship } from '@/features/friends/friends';
import { forgetAllDrafts } from '@/features/messages/drafts';
import { fetchSentLetter, sendMessage, type Dispatch } from '@/features/messages/messages';
import type { Profile } from '@/features/profile/use-profile';
import { fetchRoost, roostChanged, type Bat } from '@/features/roost/roost';
import { formatTimestamp } from '@/lib/format';
import { REFUSALS, RpcError } from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work, measured at over five
// on four cores, that would otherwise count against whichever test runs first.
jest.setTimeout(20_000);

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
  fetchSentLetter: jest.fn(),
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

// Stable, as the real hook's is.
const mockReloadProfile = jest.fn(() => Promise.resolve());

jest.mock('@/features/profile/use-profile', () => ({
  useProfile: () => ({ ...mockProfileState, reload: mockReloadProfile }),
}));

/** Who is signed in on this phone. */
const mockSession = { user: { id: 'user-mara' } };

// Only the id of whoever is signed in is read from the session: an unsent
// letter is kept under it, apart from any other account's.
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockedFetchFriendships = jest.mocked(fetchFriendships);
const mockedFetchRoost = jest.mocked(fetchRoost);
const mockedSendMessage = jest.mocked(sendMessage);
const mockedFetchSentLetter = jest.mocked(fetchSentLetter);

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

/** A second friend a bat can reach, in Vienna. */
const eva: Friendship = {
  id: 'friendship-eva',
  status: 'accepted',
  direction: 'outgoing',
  friend: {
    id: 'user-eva',
    username: 'eva',
    displayName: 'Eva Novak',
    city: { name: 'Vienna', countryCode: 'AT' },
  },
  route: { distanceKm: 523.7, flightSeconds: 23_566 },
  requestedAt: new Date(NOW - 8 * DAY),
  acceptedAt: new Date(NOW - 7 * DAY),
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

/**
 * A request that ended without the server saying anything: the connection was
 * lost, or the answer took too long. Not a refusal - so what became of whatever
 * was asked for is not known.
 */
const noAnswer = () => new RpcError('No connection. Check your network and try again.', null);

/**
 * What the screen says while it is not known whether a letter went. It checks
 * only while the letter is on screen, and at once when it is opened again: a
 * letter nobody is looking at is not asked after.
 */
const NOT_KNOWN =
  'No answer came back, so your letter may or may not have gone. ' +
  'Night Courier will check again while this letter is on screen, and when you come back to it.';

/**
 * What the screen says when changed words were not sent, because it is still
 * not known whether the letter went as it was first written.
 */
const HELD_BACK =
  'What you changed has not been sent: Night Courier first needs to know whether ' +
  'your letter went as you first wrote it. ' +
  'It will check again while this letter is on screen, and when you come back to it.';

/**
 * What the screen says when, asked after a send that got no answer, the server
 * has no such letter. It has just answered, so the connection works: what is
 * known is that the letter did not go.
 */
const DID_NOT_GO = 'Your letter did not go. It is still here to send.';

/** What the confirmation adds when the words that went are not the ones now written. */
const AS_FIRST_WRITTEN =
  'It went as you first wrote it. What you changed since has not been sent. ' +
  'It is kept, in case you want to send it as a second letter.';

/** The reference each send so far went out under, in order. */
const refsSent = () => mockedSendMessage.mock.calls.map(([, , ref]) => ref);

/** The reference each question "what became of this letter?" was asked about, in order. */
const refsAskedAfter = () => mockedFetchSentLetter.mock.calls.map(([ref]) => ref);

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

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const inSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>
);

const renderScreen = (ui: ReactElement) => render(inSafeArea(ui));

/** Matches text exactly as rendered; the default matcher collapses whitespace itself. */
const asRendered = (text: string) => text;

const letterField = () => screen.getByLabelText('Your letter');
const sendButton = () => screen.getByRole('button', { name: 'Send by bat' });
const tryAgainButton = () => screen.getByRole('button', { name: 'Try again' });

const ROOST_NOT_LOADED = 'Your roost could not be loaded. Check your connection.';
const PROFILE_NOT_LOADED = 'Your profile could not be loaded. Check your connection.';
const FRIENDS_NOT_LOADED = 'Your friends could not be loaded. Check your connection.';

/**
 * Opens the screen with a letter addressed to `friendId`, once the bats are
 * counted - as "Write back" on a letter and "Write" beside a friend open it.
 */
async function openLetterTo(friendId: string) {
  mockParams.to = friendId;
  const view = await renderScreen(<ComposeScreen />);
  await screen.findByText(/^(\d+ of \d+ bats at home|All your bats are out)\./);
  return view;
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

let announceSpy: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;

/** Everything said aloud to a screen reader so far, in order. */
const announced = () => announceSpy.mock.calls.map(([message]) => message);

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockPush.mockClear();
  mockReplace.mockClear();
  mockDismissTo.mockClear();
  mockSetParams.mockClear();
  delete mockParams.to;
  mockSession.user = { id: 'user-mara' };
  forgetAllDrafts();
  mockProfileState.profile = courier;
  mockProfileState.isLoading = false;
  mockProfileState.error = null;
  mockReloadProfile.mockReset();
  mockReloadProfile.mockImplementation(() => Promise.resolve());
  mockedFetchFriendships.mockReset();
  serveFriends(() => [anna, ben, carla, dora]);
  mockedFetchRoost.mockReset();
  serveRoost(everyBatHome);
  mockedSendMessage.mockReset();
  mockedSendMessage.mockImplementation(async () => dispatchToAnna());
  // Asked what became of a letter, the server knows of none - unless a test says otherwise.
  mockedFetchSentLetter.mockReset();
  mockedFetchSentLetter.mockResolvedValue(null);
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
});

afterEach(() => {
  announceSpy.mockRestore();
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
      mockedFetchFriendships.mockRejectedValue(new Error(FRIENDS_NOT_LOADED));
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);

      expect(await screen.findByText(FRIENDS_NOT_LOADED)).toBeOnTheScreen();
      // Not knowing is not the same as knowing they are not a friend.
      expect(screen.queryByText('You can only write to friends. Choose one below.')).toBeNull();
      expect(screen.queryByText('You have no friends to write to yet.')).toBeNull();
    });

    /**
     * This screen has nothing to pull down, so its errors said "try again" with
     * no way to do it but leaving and coming back. (Found in review.)
     */
    it('offers to try again when friends cannot be loaded, and goes on to the letter when they can', async () => {
      mockedFetchFriendships.mockRejectedValueOnce(new Error(FRIENDS_NOT_LOADED));
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);
      await screen.findByText(FRIENDS_NOT_LOADED);

      await fireEvent.press(tryAgainButton());

      expect(await screen.findByLabelText('Your letter')).toBeOnTheScreen();
      expect(screen.queryByText(FRIENDS_NOT_LOADED)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(mockedFetchFriendships).toHaveBeenCalledTimes(2);
    });

    it('shows that it is asking for the friends again', async () => {
      mockedFetchFriendships.mockRejectedValueOnce(new Error(FRIENDS_NOT_LOADED));
      await renderScreen(<ComposeScreen />);
      await screen.findByText(FRIENDS_NOT_LOADED);

      const secondTry = deferred<Friendship[]>();
      mockedFetchFriendships.mockReturnValueOnce(secondTry.promise);
      await fireEvent.press(tryAgainButton());

      expect(tryAgainButton()).toBeBusy();

      await act(async () => secondTry.reject(new Error(FRIENDS_NOT_LOADED)));

      expect(tryAgainButton()).not.toBeBusy();
      expect(screen.getByText(FRIENDS_NOT_LOADED)).toBeOnTheScreen();
    });

    it('offers nothing to try again once the friends are listed', async () => {
      await renderScreen(<ComposeScreen />);
      await screen.findByText('Who is it for?');

      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
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

    /**
     * The limit is on the letter as it is sent, without the blank space around
     * it. Counted as typed, a letter of exactly the limit that ended in a new
     * line showed a red "2001 / 2000" - and went all the same. (Found in
     * review.)
     */
    it('counts the letter as it will be sent, without the blank space around it', async () => {
      await openLetterTo('user-anna');
      const letter = 'a'.repeat(MESSAGE_MAX_LENGTH);

      await fireEvent.changeText(letterField(), `  ${letter}\n\n`);

      expect(screen.getByText(`${MESSAGE_MAX_LENGTH} / ${MESSAGE_MAX_LENGTH}`)).toHaveStyle({
        color: Colors.textMuted,
      });
      expect(
        screen.getByLabelText(`${MESSAGE_MAX_LENGTH} of ${MESSAGE_MAX_LENGTH} characters`),
      ).toBeOnTheScreen();

      await fireEvent.press(sendButton());

      expect(mockedSendMessage).toHaveBeenCalledWith('user-anna', letter, expect.any(String));
    });

    it('counts the blank space inside a letter, which is sent as written', async () => {
      await openLetterTo('user-anna');

      await fireEvent.changeText(letterField(), ' Dear Anna,\n\nsoon. ');

      expect(screen.getByText(`17 / ${MESSAGE_MAX_LENGTH}`)).toBeOnTheScreen();
    });

    it('counts nothing for a letter of nothing but blank space', async () => {
      await openLetterTo('user-anna');

      await fireEvent.changeText(letterField(), '  \n\t  ');

      expect(screen.getByText(`0 / ${MESSAGE_MAX_LENGTH}`)).toBeOnTheScreen();
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

  /**
   * The words of a letter used to live in this screen alone, and every way out
   * of it - the header's arrow, a swipe from the edge, Android's back button -
   * threw them away without a question. (Found in review.) Leaving is modelled
   * here as the navigator does it: the screen is removed, and a new one is made
   * the next time.
   */
  describe('an unsent letter', () => {
    it('is still there when the screen is left and opened again', async () => {
      const first = await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), 'Dear Anna,\n\nThe chestnuts are out again.');
      await first.unmount();

      await openLetterTo('user-anna');

      expect(letterField()).toHaveDisplayValue('Dear Anna,\n\nThe chestnuts are out again.');
      expect(screen.getByText(`40 / ${MESSAGE_MAX_LENGTH}`)).toBeOnTheScreen();
    });

    it('can be sent after coming back to it', async () => {
      const first = await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), 'See you at the lake.');
      await first.unmount();
      await openLetterTo('user-anna');

      await fireEvent.press(sendButton());

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledWith(
        'user-anna',
        'See you at the lake.',
        expect.any(String),
      );
    });

    it('is kept for each friend apart', async () => {
      serveFriends(() => [anna, eva]);
      const toAnna = await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), 'Dear Anna,');
      await toAnna.unmount();

      const toEva = await openLetterTo('user-eva');
      expect(letterField()).toHaveDisplayValue('');
      await fireEvent.changeText(letterField(), 'Dear Eva,');
      await toEva.unmount();

      await openLetterTo('user-anna');
      expect(letterField()).toHaveDisplayValue('Dear Anna,');
    });

    /**
     * "Write a letter" on the roost opens this screen with nobody chosen. Even
     * with a single letter started, it does not jump into that letter: from
     * there, there would be no way to write to anyone else. It asks who the
     * letter is for as always, and says which friend has one started.
     */
    it('is pointed out in the list of friends, which still asks who the letter is for', async () => {
      serveFriends(() => [anna, eva]);
      const toAnna = await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), 'Dear Anna,\n\nThe chestnuts are out again.');
      await toAnna.unmount();
      delete mockParams.to;

      await renderScreen(<ComposeScreen />);

      expect(await screen.findByText('Who is it for?')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Your letter')).toBeNull();
      const annaRow = screen.getByRole('button', { name: /^Anna Weber/ });
      // Run together into one line, as the lists of letters show an opening.
      expect(
        within(annaRow).getByText('A letter you started: Dear Anna, The chestnuts are out again.', {
          normalizer: asRendered,
        }),
      ).toBeOnTheScreen();
      expect(screen.getAllByText(/^A letter you started/)).toHaveLength(1);

      await fireEvent.press(annaRow);

      expect(mockSetParams).toHaveBeenCalledWith({ to: 'user-anna' });
    });

    /**
     * A letter can be two thousand characters, and a row's text is what a
     * screen reader reads out. The row shows as much as the lists of letters
     * show of one that was sent.
     */
    it('is pointed out by its opening only, however long it is', async () => {
      const toAnna = await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), `Dear Anna, ${'🦇'.repeat(1500)}`);
      await toAnna.unmount();
      delete mockParams.to;

      await renderScreen(<ComposeScreen />);
      await screen.findByText('Who is it for?');

      expect(
        screen.getByText(`A letter you started: Dear Anna, ${'🦇'.repeat(189)}`),
      ).toBeOnTheScreen();
    });

    it('is not pointed out when nothing but blank space was typed', async () => {
      const toAnna = await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), '  \n ');
      await toAnna.unmount();
      delete mockParams.to;

      await renderScreen(<ComposeScreen />);
      await screen.findByText('Who is it for?');

      expect(screen.queryByText(/^A letter you started/)).toBeNull();
    });

    it('is gone once it has been sent', async () => {
      const first = await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText('Your bat is on its way');
      await first.unmount();

      await openLetterTo('user-anna');

      expect(letterField()).toHaveDisplayValue('');
    });

    it('is still there after a send that was refused', async () => {
      mockedSendMessage.mockRejectedValue(
        new RpcError(REFUSALS.no_available_bat, 'no_available_bat'),
      );
      const first = await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(REFUSALS.no_available_bat);
      await first.unmount();

      await openLetterTo('user-anna');

      expect(letterField()).toHaveDisplayValue('See you at the lake.');
    });

    /** Two people can share a phone; one must never be shown what the other wrote. */
    it('is never shown to another account on the same phone', async () => {
      const mara = await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), 'Dear Anna, this is between us.');
      await mara.unmount();

      mockSession.user = { id: 'user-nora' };
      const nora = await openLetterTo('user-anna');
      expect(letterField()).toHaveDisplayValue('');
      await nora.unmount();

      mockSession.user = { id: 'user-mara' };
      await openLetterTo('user-anna');
      expect(letterField()).toHaveDisplayValue('Dear Anna, this is between us.');
    });

    it('is forgotten when the courier signs out', async () => {
      const first = await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), 'Dear Anna, this is between us.');
      await first.unmount();

      // The client's own sign-out. With no session in these tests it makes no request.
      await act(async () => {
        await supabase.auth.signOut({ scope: 'local' });
      });
      await openLetterTo('user-anna');

      expect(letterField()).toHaveDisplayValue('');
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
     * The button shows itself busy only once the screen has drawn again. Two
     * taps can land before that, and the second must not send anything.
     */
    it('sends once when the button is pressed twice in the same moment', async () => {
      const sending = deferred<Dispatch>();
      mockedSendMessage.mockReturnValue(sending.promise);
      await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), 'See you at the lake.');
      // The button's own handler for a press, as the platform calls it. Called
      // twice within one act, nothing is drawn in between - as within one
      // frame - where two fireEvent.press calls would each draw first.
      const press = sendButton().props.onClick as (event: object) => void;

      await act(async () => {
        press({});
        press({});
      });

      expect(sendButton()).toBeBusy();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    });

    /**
     * What became of a letter is told to every screen that shows that letter,
     * and to no other: the courier may have gone on to write to someone else
     * by the time the answer comes.
     */
    it('does not take the answer for another letter as its own', async () => {
      serveFriends(() => [anna, eva]);
      const toAnna = deferred<Dispatch>();
      mockedSendMessage.mockReturnValueOnce(toAnna.promise);
      const first = await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await first.unmount();
      await openLetterTo('user-eva');
      await fireEvent.changeText(letterField(), 'Dear Eva,');

      serveRoost(() => [batInFlight(1, 6 * HOUR), batAtHome(2), batAtHome(3)]);
      await act(async () => toAnna.resolve(dispatchToAnna()));

      expect(screen.queryByText('Your bat is on its way')).toBeNull();
      expect(letterField()).toHaveDisplayValue('Dear Eva,');
      expect(announced()).toEqual([]);
      // What it does take from it: a bat has left, so the bats are counted again.
      expect(await screen.findByText(/^2 of 3 bats at home\./)).toBeOnTheScreen();
    });

    /**
     * Nor the answer for another account's letter. One person signs out while
     * a letter is still on its way out, the next signs in and writes to a
     * friend they have in common: the first one's answer is not theirs to see.
     */
    it('does not take the answer for another account’s letter as its own', async () => {
      const marasLetter = deferred<Dispatch>();
      mockedSendMessage.mockReturnValueOnce(marasLetter.promise);
      const mara = await openLetterTo('user-anna');
      await writeAndSend('Dear Anna, this is between us.');
      await mara.unmount();
      await act(async () => {
        await supabase.auth.signOut({ scope: 'local' });
      });

      mockSession.user = { id: 'user-nora' };
      await openLetterTo('user-anna');
      await fireEvent.changeText(letterField(), 'Dear Anna, Nora here.');
      await act(async () => marasLetter.resolve(dispatchToAnna()));

      expect(screen.queryByText('Your bat is on its way')).toBeNull();
      expect(letterField()).toHaveDisplayValue('Dear Anna, Nora here.');
      expect(sendButton()).not.toBeBusy();
    });

    /**
     * The request carries the words as they were when the button was pressed,
     * and the confirmation then takes the place of the form. Anything typed in
     * between would be neither sent nor kept, so the letter holds still until
     * the send has its answer. (Found in review.)
     */
    it('takes no changes while the letter is being sent', async () => {
      const sending = deferred<Dispatch>();
      mockedSendMessage.mockReturnValue(sending.promise);
      await openLetterTo('user-anna');
      await writeAndSend('See you on Fridya.');
      expect(sendButton()).toBeBusy();

      await fireEvent.changeText(letterField(), 'See you on Friday. PS: bring the book.');

      expect(letterField()).toHaveDisplayValue('See you on Fridya.');
      expect(screen.queryByDisplayValue(/PS: bring the book/)).toBeNull();

      await act(async () => sending.resolve(dispatchToAnna()));

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    });

    it('can be changed again once a send has failed', async () => {
      const sending = deferred<Dispatch>();
      mockedSendMessage.mockReturnValueOnce(sending.promise);
      await openLetterTo('user-anna');
      await writeAndSend('See you on Fridya.');

      await act(async () => sending.reject(new RpcError(REFUSALS.try_again, 'try_again')));
      await screen.findByText(REFUSALS.try_again);
      await fireEvent.changeText(letterField(), 'See you on Friday.');

      expect(letterField()).toHaveDisplayValue('See you on Friday.');
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

    /**
     * A landing on the other side of New Year used to lose its time of day:
     * "It will reach Anna Weber in Munich in 6h 18m, at 1 Jan 2027." (Found in
     * review.) Local times throughout, so this holds in any time zone.
     */
    it('says at what time the bat lands when that is in the new year', async () => {
      jest.setSystemTime(new Date(2026, 11, 31, 22, 0));
      mockedSendMessage.mockImplementation(async () => ({
        id: 'letter-to-anna',
        deliverAt: new Date(2027, 0, 1, 4, 18, 30),
        distanceKm: 504.6,
      }));
      await openLetterTo('user-anna');

      await writeAndSend('Happy New Year.');

      expect(
        await screen.findByText(
          'It will reach Anna Weber in Munich in 6h 18m, at 1 Jan 2027 04:18.',
        ),
      ).toBeOnTheScreen();
    });

    /** The bat takes off from the courier's city for the friend's, as the flight is drawn. */
    it('draws the flight that has just begun, from home to the friend', async () => {
      dispatchToAnna();
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');

      expect(
        await screen.findByRole('image', { name: 'Bat 0% of the way from Berlin to Munich' }),
      ).toBeOnTheScreen();
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

      expect(await screen.findByText(DID_NOT_GO)).toBeOnTheScreen();
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

    it('says until what time letters leave from the old city when the move settles in the new year', async () => {
      jest.setSystemTime(new Date(2026, 11, 31, 22, 0));
      mockProfileState.profile = {
        ...courier,
        city: { id: 2911298, name: 'Hamburg', countryCode: 'DE' },
        move: {
          from: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
          settlesAt: new Date(2027, 0, 1, 9, 30),
        },
      };
      await openLetterTo('user-anna');

      expect(
        screen.getByText(
          'Your bats still leave from Berlin, DE until 1 Jan 2027 09:30, when your move settles.',
        ),
      ).toBeOnTheScreen();
    });

    /**
     * A failure may have been a lost answer to a send that went. Retrying the
     * same letter under the same ref lets the server answer with that letter
     * instead of sending a copy on a second bat.
     */
    it('retries the same letter as the same letter', async () => {
      mockedSendMessage.mockRejectedValueOnce(
        new RpcError('No connection. Check your network and try again.', null),
      );
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');
      await screen.findByText(DID_NOT_GO);
      await fireEvent.press(sendButton());
      await screen.findByText('Your bat is on its way');

      const [first, second] = mockedSendMessage.mock.calls;
      expect(first?.[2]).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
      expect(second?.[2]).toBe(first?.[2]);
    });

    /** Space at the ends is trimmed before sending, so it changes nothing. */
    it('does not count space added at the end as a change to the letter', async () => {
      mockedSendMessage.mockRejectedValueOnce(
        new RpcError('No connection. Check your network and try again.', null),
      );
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');
      await screen.findByText(DID_NOT_GO);
      await fireEvent.changeText(letterField(), 'See you at the lake.  \n');
      await fireEvent.press(sendButton());
      await screen.findByText('Your bat is on its way');

      const [first, second] = mockedSendMessage.mock.calls;
      expect(second?.[2]).toBe(first?.[2]);
    });

    it('treats a letter changed after a failure as a new letter', async () => {
      mockedSendMessage.mockRejectedValueOnce(
        new RpcError('No connection. Check your network and try again.', null),
      );
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');
      await screen.findByText(DID_NOT_GO);
      await fireEvent.changeText(letterField(), 'See you at the lake at six.');
      await fireEvent.press(sendButton());
      await screen.findByText('Your bat is on its way');

      const [first, second] = mockedSendMessage.mock.calls;
      expect(second?.[2]).not.toBe(first?.[2]);
    });
  });

  /**
   * A send can reach the server, which stores the letter, while its answer is
   * lost on the way back: the phone changes networks, or the answer takes too
   * long. Told only "No connection", the courier corrected a word and sent
   * again - and both versions went, on two bats. (Found in review.) So no
   * answer means "not known", and the server is asked what became of the
   * letter before anything else is done about it.
   */
  describe('a send that was never answered', () => {
    it('shows the letter on its way, not an error, when it went and only the answer was lost', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockResolvedValue(dispatchToAnna());
      const first = await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(
        screen.getByText(/^It will reach Anna Weber in Munich in 6h 20m, at /),
      ).toBeOnTheScreen();
      expect(screen.queryByText(AS_FIRST_WRITTEN)).toBeNull();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
      // Asked after by the very reference it went out under.
      expect(refsAskedAfter()).toEqual(refsSent());
      expect(announced()).toEqual(['Your bat is on its way to Anna Weber. It lands in 6h 20m.']);

      // And nothing of it is left to send.
      await first.unmount();
      await openLetterTo('user-anna');
      expect(letterField()).toHaveDisplayValue('');
    });

    it('shows no error while it is still finding out', async () => {
      const asked = deferred<Dispatch | null>();
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockReturnValueOnce(asked.promise);
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');

      // Still finding out: the button spins, and nothing is claimed either way.
      expect(sendButton()).toBeBusy();
      expect(screen.queryByText('No connection. Check your network and try again.')).toBeNull();
      expect(screen.queryByText(DID_NOT_GO)).toBeNull();
      expect(screen.queryByText(NOT_KNOWN)).toBeNull();

      await act(async () => asked.resolve(dispatchToAnna()));

      expect(screen.getByText('Your bat is on its way')).toBeOnTheScreen();
    });

    it('takes no changes to the letter while it is finding out', async () => {
      const asked = deferred<Dispatch | null>();
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockReturnValueOnce(asked.promise);
      await openLetterTo('user-anna');
      await writeAndSend('See you on Fridya.');

      await fireEvent.changeText(letterField(), 'See you on Friday.');

      expect(letterField()).toHaveDisplayValue('See you on Fridya.');
    });

    /**
     * A request nobody answers is given up by the client's own fetch after
     * twenty seconds. Until then the letter holds still and the button spins;
     * once the send and the asking after it have both been given up, the
     * screen lets go. A send that was never given up kept the letter read-only
     * here, and on any screen opened onto it since, for as long as the app ran.
     * (Found in review.)
     */
    it('lets go of the letter once a send nobody answered has been given up', async () => {
      const givenUp = () =>
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new TypeError('Network request timed out')), 20 * SECOND);
        });
      mockedSendMessage.mockImplementationOnce(givenUp);
      mockedFetchSentLetter.mockImplementationOnce(givenUp);
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');

      // Twenty seconds for the send, and twenty more for asking what became of it.
      await letTimePass(39 * SECOND);
      expect(sendButton()).toBeBusy();
      await letTimePass(SECOND);

      expect(screen.getByText(NOT_KNOWN)).toBeOnTheScreen();
      expect(sendButton()).not.toBeBusy();
      await fireEvent.changeText(letterField(), 'See you at the lake!');
      expect(letterField()).toHaveDisplayValue('See you at the lake!');

      // And the same words go again as the same letter.
      await fireEvent.changeText(letterField(), 'See you at the lake.');
      await fireEvent.press(sendButton());
      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      const [first, second] = refsSent();
      expect(second).toBe(first);
    });

    /**
     * The case from the review. The first send went; the app could not find
     * that out at once; the courier corrects a word and sends. The correction
     * must not go out as a second letter behind the first one's back.
     */
    it('does not send a second letter when the first went and only its answer was lost', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      // Still no connection when it first asks what became of the letter.
      mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you on Fridya.');
      await screen.findByText(NOT_KNOWN);

      // The connection is back, and the server has the letter: it went.
      mockedFetchSentLetter.mockResolvedValue(dispatchToAnna());
      await fireEvent.changeText(letterField(), 'See you on Friday.');
      await fireEvent.press(sendButton());

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(
        screen.getByText(/^It will reach Anna Weber in Munich in 6h 20m, at /),
      ).toBeOnTheScreen();
      expect(screen.getByText(AS_FIRST_WRITTEN)).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
      expect(mockedSendMessage).toHaveBeenCalledWith(
        'user-anna',
        'See you on Fridya.',
        expect.any(String),
      );
      expect(announced().at(-1)).toBe(
        'Your bat is on its way to Anna Weber. It lands in 6h 20m. ' +
          'It went as you first wrote it; what you changed since has not been sent.',
      );
    });

    /**
     * Asked straight after the failure, the server may not have the letter yet:
     * the request can still be on its way in. "Nothing went" is therefore not
     * taken as the last word; it is asked once more before other words go out
     * under a reference of their own.
     */
    it('asks once more before a changed letter goes, even after being told that nothing went', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockResolvedValueOnce(null);
      await openLetterTo('user-anna');
      await writeAndSend('See you on Fridya.');
      await screen.findByText(DID_NOT_GO);

      // By now it has arrived after all.
      mockedFetchSentLetter.mockResolvedValue(dispatchToAnna());
      await fireEvent.changeText(letterField(), 'See you on Friday.');
      await fireEvent.press(sendButton());

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(screen.getByText(AS_FIRST_WRITTEN)).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
      const [ref] = refsSent();
      expect(refsAskedAfter()).toEqual([ref, ref]);
    });

    it('keeps what was changed since, and sends it as a second letter if the courier wants that', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you on Fridya.');
      await screen.findByText(NOT_KNOWN);
      mockedFetchSentLetter.mockResolvedValue(dispatchToAnna());
      await fireEvent.changeText(letterField(), 'See you on Friday.');
      await fireEvent.press(sendButton());
      await screen.findByText(AS_FIRST_WRITTEN);

      await fireEvent.press(screen.getByRole('button', { name: 'Back to what you wrote' }));

      expect(letterField()).toHaveDisplayValue('See you on Friday.');
      expect(screen.queryByText(NOT_KNOWN)).toBeNull();

      // Sending it now is the courier's own decision: a second letter, under
      // a reference of its own, with nothing left to ask about the first.
      mockedFetchSentLetter.mockClear();
      await fireEvent.press(sendButton());

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(screen.queryByText(AS_FIRST_WRITTEN)).toBeNull();
      expect(mockedSendMessage).toHaveBeenCalledTimes(2);
      expect(mockedSendMessage).toHaveBeenLastCalledWith(
        'user-anna',
        'See you on Friday.',
        expect.any(String),
      );
      const [first, second] = refsSent();
      expect(second).not.toBe(first);
      expect(mockedFetchSentLetter).not.toHaveBeenCalled();
    });

    it('offers no way back to changed words when the letter went as it stands', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockResolvedValue(dispatchToAnna());
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');
      await screen.findByText('Your bat is on its way');

      expect(screen.queryByRole('button', { name: 'Back to what you wrote' })).toBeNull();
    });

    /**
     * Asked, the server knew of no such letter: that much is known, so there is
     * no "may or may not" about it, and nothing to keep asking. Nor is it "No
     * connection" any more: the server has just answered. (Found in review.)
     */
    it('says only that it did not go when the server, asked, has no such letter', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');

      expect(await screen.findByText(DID_NOT_GO)).toBeOnTheScreen();
      expect(screen.queryByText('No connection. Check your network and try again.')).toBeNull();
      expect(screen.queryByText(NOT_KNOWN)).toBeNull();

      // Nor does the doubt come back once the letter is changed and the error clears.
      await fireEvent.changeText(letterField(), 'See you at the lake at six.');
      expect(screen.queryByText(DID_NOT_GO)).toBeNull();
      expect(screen.queryByText(NOT_KNOWN)).toBeNull();

      await letTimePass(5 * MINUTE);
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(1);
    });

    /**
     * A letter found this way left when it was first sent, not when the answer
     * at last came. The roost, fetched again, has the server's own time of
     * leaving, and the drawing goes by that.
     */
    it('draws a letter that left a while ago where it is by now, not at the start', async () => {
      const { deliverAt } = dispatchToAnna();
      // A quarter of the way: it has flown a third as long as it still has to.
      const leftAt = new Date(NOW - (deliverAt.getTime() - NOW) / 3);
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(NOT_KNOWN);

      // Sent again, the server answers with the letter that went the first time.
      serveRoost(() => [
        {
          id: 'bat-1',
          slot: 1,
          status: 'flying',
          flight: {
            messageId: 'letter-to-anna',
            recipient: { id: 'user-anna', username: 'anna', displayName: 'Anna Weber' },
            sentAt: leftAt,
            deliverAt,
            distanceKm: 504.6,
          },
        },
        batAtHome(2),
        batAtHome(3),
      ]);
      await fireEvent.press(sendButton());

      expect(
        await screen.findByRole('image', { name: 'Bat 25% of the way from Berlin to Munich' }),
      ).toBeOnTheScreen();
    });

    it('says so when it cannot find out whether the letter went, and keeps the letter', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValue(noAnswer());
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');

      expect(await screen.findByText(NOT_KNOWN)).toBeOnTheScreen();
      expect(screen.queryByText('Your bat is on its way')).toBeNull();
      expect(letterField()).toHaveDisplayValue('See you at the lake.');
      expect(sendButton()).not.toBeBusy();
      // Said aloud too: it appears while focus is still on the button.
      expect(announced()).toEqual([`Your letter: ${NOT_KNOWN}`]);
    });

    it('checks again by itself, and shows the letter on its way once it finds it', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(NOT_KNOWN);

      mockedFetchSentLetter.mockResolvedValue(dispatchToAnna());
      await letTimePass(3 * SECOND);

      expect(screen.getByText('Your bat is on its way')).toBeOnTheScreen();
      expect(screen.queryByText(AS_FIRST_WRITTEN)).toBeNull();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    });

    it('says which words went when it finds the letter while the courier is changing it', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you on Fridya.');
      await screen.findByText(NOT_KNOWN);
      await fireEvent.changeText(letterField(), 'See you on Friday.');

      mockedFetchSentLetter.mockResolvedValue(dispatchToAnna());
      await letTimePass(3 * SECOND);

      expect(screen.getByText('Your bat is on its way')).toBeOnTheScreen();
      expect(screen.getByText(AS_FIRST_WRITTEN)).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Back to what you wrote' }));
      expect(letterField()).toHaveDisplayValue('See you on Friday.');
    });

    it('says the letter did not go once it finds that out, and sends it when asked again', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(NOT_KNOWN);

      mockedFetchSentLetter.mockResolvedValue(null);
      await letTimePass(3 * SECOND);

      expect(
        screen.getByText('Your letter did not go after all. It is still here to send.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText(NOT_KNOWN)).toBeNull();
      expect(letterField()).toHaveDisplayValue('See you at the lake.');

      // Knowing now, it does not keep asking - nor does the doubt come back
      // when the letter is touched and that message clears.
      const asked = mockedFetchSentLetter.mock.calls.length;
      await letTimePass(5 * MINUTE);
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(asked);
      await fireEvent.changeText(letterField(), 'See you at the lake. ');
      expect(screen.queryByText(/did not go after all/)).toBeNull();
      expect(screen.queryByText(NOT_KNOWN)).toBeNull();

      await fireEvent.press(sendButton());
      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      const [first, second] = refsSent();
      expect(second).toBe(first);
    });

    /**
     * Often enough to notice a connection that is back within seconds, and
     * then less and less often: a phone left underground must not ask every
     * two seconds for an hour.
     */
    it('checks again after two seconds, then less and less often, and once a minute at the least', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValue(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(NOT_KNOWN);
      // Once already, straight after the send failed.
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(1);

      await letTimePass(SECOND);
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(1);
      await letTimePass(SECOND);
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(2);

      // After 2, 4, 6 and 9 seconds; the next is not due until 13.5.
      await letTimePass(10 * SECOND);
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(5);

      // From the fourth minute on the pause has reached a minute, and stays there.
      await letTimePass(4 * MINUTE - 12 * SECOND);
      const afterFourMinutes = mockedFetchSentLetter.mock.calls.length;
      await letTimePass(5 * MINUTE);
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(afterFourMinutes + 5);

      expect(screen.getByText(NOT_KNOWN)).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    });

    /**
     * And it says so. Pressing Send used to leave the screen as it was, saying
     * only that the first letter may or may not have gone, with nothing about
     * what had become of the press. (Found in review.)
     */
    it('does not let a changed letter go while it cannot find out what became of the first', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValue(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you on Fridya.');
      await screen.findByText(NOT_KNOWN);

      await fireEvent.changeText(letterField(), 'See you on Friday.');
      await fireEvent.press(sendButton());

      expect(await screen.findByText(HELD_BACK)).toBeOnTheScreen();
      expect(announced().at(-1)).toBe(`Your letter: ${HELD_BACK}`);
      expect(sendButton()).not.toBeBusy();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
      expect(letterField()).toHaveDisplayValue('See you on Friday.');
      expect(screen.queryByText('Your bat is on its way')).toBeNull();

      // Touched again, the letter says once more only what is not known.
      await fireEvent.changeText(letterField(), 'See you on Friday!');
      expect(screen.queryByText(HELD_BACK)).toBeNull();
      expect(screen.getByText(NOT_KNOWN)).toBeOnTheScreen();
    });

    it('says so again, and sends nothing, when Send is pressed once more before it can find out', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValue(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you on Fridya.');
      await screen.findByText(NOT_KNOWN);
      await fireEvent.changeText(letterField(), 'See you on Friday.');
      await fireEvent.press(sendButton());
      await screen.findByText(HELD_BACK);

      await fireEvent.press(sendButton());

      // Said aloud again: the second press is not met with silence either.
      await waitFor(() =>
        expect(announced().filter((said) => said === `Your letter: ${HELD_BACK}`)).toHaveLength(2),
      );
      expect(screen.getByText(HELD_BACK)).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
      // Asked after once more for that press, and only ever about the first letter.
      const [ref] = refsSent();
      expect(refsAskedAfter().length).toBeGreaterThanOrEqual(3);
      expect(new Set(refsAskedAfter())).toEqual(new Set([ref]));
    });

    /**
     * "Nothing went" was the answer to the first question. If the second one,
     * before the corrected letter goes, cannot be asked, that answer no longer
     * holds - and the doubt is back, with the asking that goes with it.
     */
    it('is in doubt again when it cannot ask once more before a changed letter goes', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you on Fridya.');
      await screen.findByText(DID_NOT_GO);

      mockedFetchSentLetter.mockRejectedValue(noAnswer());
      await fireEvent.changeText(letterField(), 'See you on Friday.');
      await fireEvent.press(sendButton());

      expect(await screen.findByText(HELD_BACK)).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
      await fireEvent.changeText(letterField(), 'See you on Friday!');
      expect(screen.getByText(NOT_KNOWN)).toBeOnTheScreen();

      // And it goes on to find out by itself, after a pause: the first letter had gone.
      mockedFetchSentLetter.mockResolvedValue(dispatchToAnna());
      const asked = mockedFetchSentLetter.mock.calls.length;
      await letTimePass(SECOND);
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(asked);
      await letTimePass(2 * SECOND);

      expect(screen.getByText('Your bat is on its way')).toBeOnTheScreen();
      expect(screen.getByText(AS_FIRST_WRITTEN)).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    });

    /**
     * The same words can always go out again under the same reference: the
     * server answers a reference it knows with the letter that went, so this
     * is both the question and, if nothing went, the send.
     */
    it('sends the same words again under the same reference while it is not known', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValue(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(NOT_KNOWN);

      await fireEvent.press(sendButton());

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      const [first, second] = refsSent();
      expect(second).toBe(first);
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(1);
    });

    it('still knows, when the screen is opened again, that the letter may have gone', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValue(noAnswer());
      const first = await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(NOT_KNOWN);
      await first.unmount();

      await openLetterTo('user-anna');

      expect(letterField()).toHaveDisplayValue('See you at the lake.');
      expect(screen.getByText(NOT_KNOWN)).toBeOnTheScreen();

      // The new screen sends the same words under the reference the old one used.
      await fireEvent.press(sendButton());
      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      const [before, after] = refsSent();
      expect(after).toBe(before);
    });

    it('asks at once when the screen is opened again after a while', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValue(noAnswer());
      const first = await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(NOT_KNOWN);
      await first.unmount();

      // Nobody is looking at the letter, so nobody asks.
      const asked = mockedFetchSentLetter.mock.calls.length;
      await letTimePass(10 * MINUTE);
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(asked);

      mockedFetchSentLetter.mockResolvedValue(dispatchToAnna());
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    });

    /**
     * Left while it is not known whether it went, the letter is still pointed
     * out in the list of friends - but as what it is. "A letter you started"
     * said of a letter that may be on its way was not the whole truth, and
     * opening the letter is what finds out.
     */
    it('is pointed out in the list of friends as a letter that may have gone', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockRejectedValue(noAnswer());
      const first = await openLetterTo('user-anna');
      await writeAndSend('Dear Anna,\n\nSee you at the lake.');
      await screen.findByText(NOT_KNOWN);
      await first.unmount();
      delete mockParams.to;

      await renderScreen(<ComposeScreen />);

      const annaRow = await screen.findByRole('button', { name: /^Anna Weber/ });
      expect(
        within(annaRow).getByText(
          'A letter that may or may not have gone: Dear Anna, See you at the lake.',
          { normalizer: asRendered },
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/^A letter you started/)).toBeNull();
      // Nobody is looking at the letter itself, so nobody asks after it from here.
      const asked = mockedFetchSentLetter.mock.calls.length;
      await letTimePass(MINUTE);
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(asked);

      await fireEvent.press(annaRow);
      expect(mockSetParams).toHaveBeenCalledWith({ to: 'user-anna' });
    });

    // What may have gone is what was sent, whatever has been written over it
    // since - even nothing.
    it.each([
      ['changed', 'See you at the lake at six.'],
      ['taken out', ''],
    ])(
      'is pointed out by the words that may have gone when they were %s since',
      async (_, since) => {
        mockedSendMessage.mockRejectedValueOnce(noAnswer());
        mockedFetchSentLetter.mockRejectedValue(noAnswer());
        const first = await openLetterTo('user-anna');
        await writeAndSend('See you at the lake.');
        await screen.findByText(NOT_KNOWN);
        await fireEvent.changeText(letterField(), since);
        await first.unmount();
        delete mockParams.to;

        await renderScreen(<ComposeScreen />);
        await screen.findByText('Who is it for?');

        expect(
          screen.getByText('A letter that may or may not have gone: See you at the lake.'),
        ).toBeOnTheScreen();
        expect(screen.queryByText(/^A letter you started/)).toBeNull();
      },
    );

    it('is a letter merely started again once it is known not to have gone', async () => {
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      // Asked what became of it, the server knows of no such letter.
      const first = await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(DID_NOT_GO);
      await first.unmount();
      delete mockParams.to;

      await renderScreen(<ComposeScreen />);
      await screen.findByText('Who is it for?');

      expect(screen.getByText('A letter you started: See you at the lake.')).toBeOnTheScreen();
      expect(screen.queryByText(/may or may not have gone/)).toBeNull();
    });

    it('does not ask after a letter the server refused: it said itself that none went', async () => {
      mockedSendMessage.mockRejectedValueOnce(
        new RpcError(REFUSALS.no_available_bat, 'no_available_bat'),
      );
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');
      await screen.findByText(REFUSALS.no_available_bat);

      expect(mockedFetchSentLetter).not.toHaveBeenCalled();
      // And a changed letter is then simply another letter.
      await fireEvent.changeText(letterField(), 'See you at the lake at six.');
      await fireEvent.press(sendButton());
      await screen.findByText('Your bat is on its way');
      expect(mockedFetchSentLetter).not.toHaveBeenCalled();
    });

    /**
     * A letter found this way may have left hours ago. One whose landing time
     * has passed is not "on its way".
     */
    it('calls a letter that has already landed arrived, not on its way', async () => {
      const landedAt = new Date(NOW - 5 * MINUTE);
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      mockedFetchSentLetter.mockResolvedValue({ ...dispatchToAnna(), deliverAt: landedAt });
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');

      expect(await screen.findByText('Your letter has arrived')).toBeOnTheScreen();
      expect(
        screen.getByText(
          `It has reached Anna Weber in Munich. Landed ${formatTimestamp(landedAt)}.`,
        ),
      ).toBeOnTheScreen();
      expect(screen.getByText('505 km as the bat flies.')).toBeOnTheScreen();
      expect(screen.queryByText('Your bat is on its way')).toBeNull();
      expect(screen.queryByText(/any moment now/)).toBeNull();
      // Nothing is drawn as still in the air.
      expect(screen.queryByRole('image', { name: /^Bat / })).toBeNull();
      expect(announced()).toEqual(['Your letter to Anna Weber has arrived.']);
    });

    it('calls it arrived when a send tried again is answered with a letter that landed long ago', async () => {
      const landedAt = new Date(NOW + 20 * MINUTE);
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(DID_NOT_GO);

      // The screen stays open while the letter, which did go, flies and lands.
      await letTimePass(25 * MINUTE);
      mockedSendMessage.mockResolvedValue({ ...dispatchToAnna(), deliverAt: landedAt });
      await fireEvent.press(sendButton());

      expect(await screen.findByText('Your letter has arrived')).toBeOnTheScreen();
      expect(
        screen.getByText(
          `It has reached Anna Weber in Munich. Landed ${formatTimestamp(landedAt)}.`,
        ),
      ).toBeOnTheScreen();
    });

    /**
     * Only a letter that may have left earlier can have landed already. One
     * sent this moment is on its way whatever the phone's clock makes of its
     * landing time - a clock running fast must not announce an arrival.
     */
    it('does not call a letter sent this moment arrived, even if the phone thinks its time has passed', async () => {
      mockedSendMessage.mockResolvedValue({
        ...dispatchToAnna(),
        deliverAt: new Date(NOW - MINUTE),
      });
      await openLetterTo('user-anna');

      await writeAndSend('See you at the lake.');

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(
        screen.getByText('It is reaching Anna Weber in Munich any moment now.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText('Your letter has arrived')).toBeNull();
    });

    /**
     * What is kept about a send that was never answered belongs to the letter
     * it was a send of. The same words to someone else are another letter.
     */
    it('sends the same words to a different friend as a different letter', async () => {
      serveFriends(() => [anna, eva]);
      mockedSendMessage.mockRejectedValueOnce(noAnswer());
      const view = await openLetterTo('user-anna');
      await writeAndSend('See you at the lake.');
      await screen.findByText(DID_NOT_GO);

      // The same screen, now with Eva in the route.
      mockParams.to = 'user-eva';
      await view.rerender(inSafeArea(<ComposeScreen />));
      await writeAndSend('See you at the lake.');

      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
      expect(mockedSendMessage).toHaveBeenLastCalledWith(
        'user-eva',
        'See you at the lake.',
        expect.any(String),
      );
      const [toAnna, toEva] = refsSent();
      expect(toEva).not.toBe(toAnna);
      // Nor is Anna's letter asked after on the way: it is not Eva's business.
      expect(mockedFetchSentLetter).toHaveBeenCalledTimes(1);
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

    // Until the roost answers the button is disabled, and a disabled button
    // with nothing beside it to say why looks broken. (Found in review.)
    it('says that it is counting the bats until it has', async () => {
      const roost = deferred<Bat[]>();
      mockedFetchRoost.mockReturnValue(roost.promise);
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);
      await screen.findByLabelText('Your letter');

      // Said quietly: nothing is wrong yet.
      expect(screen.getByText('Counting your bats…')).toHaveStyle({ color: Colors.textMuted });
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

      await act(async () => roost.resolve(everyBatHome()));

      expect(screen.queryByText('Counting your bats…')).toBeNull();
      expect(screen.getByText(/^3 of 3 bats at home\./)).toBeOnTheScreen();
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
      mockedFetchRoost.mockRejectedValue(new Error(ROOST_NOT_LOADED));
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);
      expect(await screen.findByLabelText('Your letter')).toBeOnTheScreen();

      expect(await screen.findByText(ROOST_NOT_LOADED)).toHaveStyle({ color: Colors.danger });
      expect(screen.queryByText('Counting your bats…')).toBeNull();
      expect(sendButton()).toBeDisabled();
    });

    /**
     * One failed request as the screen opened used to leave "Send by bat"
     * disabled for good, under an error that said "try again" with nothing to
     * try it with. Leaving was the only way out. (Found in review.)
     */
    it('offers to count the bats again, and lets the letter go once they are counted', async () => {
      mockedFetchRoost.mockRejectedValueOnce(new Error(ROOST_NOT_LOADED));
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);
      await screen.findByText(ROOST_NOT_LOADED);
      await fireEvent.changeText(letterField(), 'See you at the lake.');

      await fireEvent.press(tryAgainButton());

      expect(await screen.findByText(/^3 of 3 bats at home\./)).toBeOnTheScreen();
      expect(screen.queryByText(ROOST_NOT_LOADED)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(sendButton()).toBeEnabled();
      expect(letterField()).toHaveDisplayValue('See you at the lake.');
      expect(mockedFetchRoost).toHaveBeenCalledTimes(2);
    });

    it('shows that it is counting the bats again', async () => {
      mockedFetchRoost.mockRejectedValueOnce(new Error(ROOST_NOT_LOADED));
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);
      await screen.findByText(ROOST_NOT_LOADED);

      const secondTry = deferred<Bat[]>();
      mockedFetchRoost.mockReturnValueOnce(secondTry.promise);
      await fireEvent.press(tryAgainButton());

      expect(tryAgainButton()).toBeBusy();

      await act(async () => secondTry.reject(new Error(ROOST_NOT_LOADED)));

      expect(tryAgainButton()).not.toBeBusy();
      expect(screen.getByText(ROOST_NOT_LOADED)).toBeOnTheScreen();
      expect(sendButton()).toBeDisabled();
    });

    it('offers nothing to try again while the bats are counted', async () => {
      await openLetterTo('user-anna');

      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    // A count that is on screen stays there when a later one fails: the last
    // one known still says whether a letter can go.
    it('keeps the count it has, without the button, when a later count fails', async () => {
      await openLetterTo('user-anna');

      mockedFetchRoost.mockRejectedValue(new Error(ROOST_NOT_LOADED));
      await act(async () => roostChanged());

      expect(mockedFetchRoost).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/^3 of 3 bats at home\./)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(sendButton()).toBeEnabled();
    });

    /**
     * The profile is not needed to send: the server knows where home is, and
     * refuses a sender without a city itself. A profile that failed to load
     * used to keep "Send by bat" disabled until the screen was left - with the
     * letter. (Found in review.)
     */
    it('does not hold a letter back because the profile could not be loaded', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = PROFILE_NOT_LOADED;
      await openLetterTo('user-anna');

      expect(sendButton()).toBeEnabled();
      await writeAndSend('See you at the lake.');

      expect(mockedSendMessage).toHaveBeenCalledWith(
        'user-anna',
        'See you at the lake.',
        expect.any(String),
      );
      expect(await screen.findByText('Your bat is on its way')).toBeOnTheScreen();
    });

    it('says that the profile could not be loaded, and loads it again when asked', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = PROFILE_NOT_LOADED;
      await openLetterTo('user-anna');
      expect(screen.getByText(PROFILE_NOT_LOADED)).toBeOnTheScreen();
      await fireEvent.changeText(letterField(), 'See you at the lake.');

      // The connection is back: the next load of the profile succeeds.
      mockReloadProfile.mockClear();
      mockReloadProfile.mockImplementation(async () => {
        mockProfileState.profile = courier;
        mockProfileState.error = null;
      });
      await fireEvent.press(tryAgainButton());

      await waitFor(() => expect(screen.queryByText(PROFILE_NOT_LOADED)).toBeNull());
      expect(mockReloadProfile).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(letterField()).toHaveDisplayValue('See you at the lake.');
    });

    it('shows that it is loading the profile again', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = PROFILE_NOT_LOADED;
      await openLetterTo('user-anna');

      const secondTry = deferred<void>();
      mockReloadProfile.mockReturnValueOnce(secondTry.promise);
      await fireEvent.press(tryAgainButton());

      expect(tryAgainButton()).toBeBusy();

      await act(async () => secondTry.resolve());

      expect(tryAgainButton()).not.toBeBusy();
      expect(screen.getByText(PROFILE_NOT_LOADED)).toBeOnTheScreen();
    });

    // The hook says what became of a load and does not throw; if it ever did,
    // the button must not be left spinning for good.
    it('is not left busy if loading the profile again fails outright', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = PROFILE_NOT_LOADED;
      await openLetterTo('user-anna');

      mockReloadProfile.mockRejectedValueOnce(new Error('unexpected'));
      await fireEvent.press(tryAgainButton());

      expect(tryAgainButton()).not.toBeBusy();
      expect(tryAgainButton()).toBeEnabled();
    });

    // With no connection as the friends came through, both are missing. One
    // way out is enough, and it asks for both.
    it('offers to try again once when neither the bats nor the profile could be loaded', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = PROFILE_NOT_LOADED;
      mockedFetchRoost.mockRejectedValueOnce(new Error(ROOST_NOT_LOADED));
      mockParams.to = 'user-anna';
      await renderScreen(<ComposeScreen />);
      await screen.findByText(ROOST_NOT_LOADED);
      expect(screen.getByText(PROFILE_NOT_LOADED)).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);

      mockReloadProfile.mockClear();
      await fireEvent.press(tryAgainButton());

      expect(await screen.findByText(/^3 of 3 bats at home\./)).toBeOnTheScreen();
      expect(mockReloadProfile).toHaveBeenCalledTimes(1);
    });

    // A way to the friend cannot be there without a city, as the server works
    // routes out; if one ever were, the letter would still be held back here.
    it('holds a letter back for a courier known to have no city, whatever else is known', async () => {
      mockProfileState.profile = { ...courier, city: null };
      await openLetterTo('user-anna');

      expect(
        screen.getByText('Choose your city first. Your bats need to know where home is.'),
      ).toBeOnTheScreen();
      expect(sendButton()).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
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
