import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import BlockedScreen from '@/app/(app)/blocked';
import { fetchBlocked, unblockCourier, type BlockedCourier } from '@/features/safety/safety';
import { RpcError } from '@/lib/rpc-error';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work that would otherwise
// count against whichever test runs first.
jest.setTimeout(20_000);

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
  };
});

// The screen is under test, not the network. Every call that reaches Supabase
// is replaced; the rest of the module is kept.
jest.mock('@/features/safety/safety', () => ({
  ...jest.requireActual('@/features/safety/safety'),
  blockCourier: jest.fn(),
  unblockCourier: jest.fn(),
  fetchBlocked: jest.fn(),
  reportLetter: jest.fn(),
  reportCourier: jest.fn(),
}));

const mockedFetchBlocked = jest.mocked(fetchBlocked);
const mockedUnblockCourier = jest.mocked(unblockCourier);

/**
 * A fixed moment, in the reader's local time rather than UTC: "today" and
 * "yesterday" are the reader's days, and an instant given in UTC would fall on
 * a different one depending on where the tests run.
 */
const NOW = new Date(2026, 9, 31, 21, 0);

// Most recent first, as list_blocked() orders them.
const anna: BlockedCourier = {
  id: 'user-anna',
  username: 'anna',
  blockedAt: new Date(2026, 9, 31, 20, 15),
};
const ben: BlockedCourier = {
  id: 'user-ben',
  username: 'ben',
  blockedAt: new Date(2026, 9, 30, 23, 40),
};
const carla: BlockedCourier = {
  id: 'user-carla',
  username: 'carla',
  blockedAt: new Date(2026, 9, 12, 9, 5),
};
const dora: BlockedCourier = {
  id: 'user-dora',
  username: 'dora',
  blockedAt: new Date(2025, 11, 24, 18, 0),
};

const LEAD =
  'They cannot write to you or ask to be friends, and you do not see their letters. ' +
  'Unblocking brings their letters back; to write to each other again, one of you has to ask ' +
  'to be friends.';
const NOBODY = 'You have not blocked anyone.';
const LOAD_FAILED = 'Your blocked couriers could not be loaded.';
const UNBLOCK_FAILED = 'That courier could not be unblocked. Try again.';

/** What `list_blocked()` answers from now on. */
const serve = (list: () => BlockedCourier[]) =>
  mockedFetchBlocked.mockImplementation(async () => list());

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

type Element = ReturnType<typeof screen.getByText>;

/** Resolves once the list is on screen, with the courier blocked most recently. */
const listLoaded = () => screen.findByText('@anna');

const unblockButton = (username: string) =>
  screen.getByRole('button', { name: `Unblock @${username}` });

/** The row a courier is listed in: the nearest container of their name that also holds their button. */
function rowOf(username: string): Element {
  const name = screen.getByText(`@${username}`);
  const button = unblockButton(username);
  for (let node = name.parent; node; node = node.parent) {
    if (node.queryAll((candidate) => candidate === button).length > 0) return node;
  }
  throw new Error(`@${username} has no row of their own.`);
}

const spinners = () => screen.container.queryAll((node) => node.type === 'ActivityIndicator');

/**
 * The refresh control has no role or label to find it by, so it is picked out
 * by its native type and sent the event the native view sends on a pull.
 */
async function pullToRefresh() {
  const [control] = screen.container.queryAll((node) => node.type === 'RCTRefreshControl');
  if (!control) throw new Error('The list has no refresh control.');
  await fireEvent(control, 'refresh');
}

let announceSpy: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;

/** Everything said aloud to a screen reader so far, in order. */
const announced = () => announceSpy.mock.calls.map(([message]) => message);

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockedFetchBlocked.mockReset();
  serve(() => [anna, ben, carla, dora]);
  mockedUnblockCourier.mockReset().mockResolvedValue(undefined);
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
});

afterEach(() => {
  announceSpy.mockRestore();
  jest.useRealTimers();
});

describe('BlockedScreen', () => {
  describe('the list', () => {
    /**
     * Unblocking lifts the block and nothing more: the friendship the block
     * ended stays ended. Someone who expects to be friends again learns it
     * here, rather than from a letter that has nobody to go to.
     */
    it('says what a block does, and that unblocking does not make you friends again', async () => {
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      expect(screen.getByText('Blocked couriers')).toBeOnTheScreen();
      expect(screen.getByText(LEAD)).toBeOnTheScreen();
    });

    /**
     * By username alone, which is all the server sends: a display name is the
     * other person's to change, and a list of the people you have shut out is
     * the last place to show whatever they changed it to.
     */
    it('lists each blocked courier by username, most recent first', async () => {
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      expect(screen.getAllByText(/^@/).map((name) => name.props.children)).toEqual([
        '@anna',
        '@ben',
        '@carla',
        '@dora',
      ]);
    });

    it('says on each row when that courier was blocked', async () => {
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      expect(within(rowOf('anna')).getByText('Blocked today')).toBeOnTheScreen();
      expect(within(rowOf('ben')).getByText('Blocked yesterday')).toBeOnTheScreen();
      expect(within(rowOf('carla')).getByText('Blocked on 12 Oct')).toBeOnTheScreen();
      expect(within(rowOf('dora')).getByText('Blocked on 24 Dec 2025')).toBeOnTheScreen();
    });

    /**
     * A screen reader moving from button to button reads each label on its
     * own, away from the row it sits in. Four buttons that all said "Unblock"
     * would not say whom.
     */
    it('names on each Unblock button whom it unblocks', async () => {
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      for (const username of ['anna', 'ben', 'carla', 'dora']) {
        expect(unblockButton(username)).toBeEnabled();
      }
      expect(screen.queryByRole('button', { name: 'Unblock' })).toBeNull();
    });

    it('says so when nobody is blocked', async () => {
      serve(() => []);
      await renderScreen(<BlockedScreen />);

      expect(await screen.findByText(NOBODY)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /^Unblock/ })).toBeNull();
    });

    it('fetches the list again when pulled down', async () => {
      serve(() => [ben]);
      await renderScreen(<BlockedScreen />);
      await screen.findByText('@ben');

      // Blocked from a letter in the meantime.
      serve(() => [anna, ben]);
      await pullToRefresh();

      expect(await screen.findByText('@anna')).toBeOnTheScreen();
      expect(mockedFetchBlocked).toHaveBeenCalledTimes(2);
    });
  });

  describe('loading', () => {
    it('shows a spinner, and claims nothing, until the list has loaded', async () => {
      mockedFetchBlocked.mockReturnValue(new Promise<BlockedCourier[]>(() => {}));
      await renderScreen(<BlockedScreen />);

      expect(spinners()).toHaveLength(1);
      expect(screen.queryByText(NOBODY)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('says why the list could not be loaded, rather than that nobody is blocked, and tries again when asked', async () => {
      mockedFetchBlocked.mockRejectedValueOnce(new RpcError(LOAD_FAILED, null));
      await renderScreen(<BlockedScreen />);

      expect(await screen.findByText(LOAD_FAILED)).toBeOnTheScreen();
      expect(screen.queryByText(NOBODY)).toBeNull();
      expect(spinners()).toHaveLength(0);

      await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('@anna')).toBeOnTheScreen();
      expect(screen.queryByText(LOAD_FAILED)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(mockedFetchBlocked).toHaveBeenCalledTimes(2);
    });
  });

  describe('unblocking', () => {
    it('unblocks a courier, says so aloud, and shows the list without them', async () => {
      mockedUnblockCourier.mockImplementation(async () => {
        serve(() => [ben, carla, dora]);
      });
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      await fireEvent.press(unblockButton('anna'));

      expect(mockedUnblockCourier).toHaveBeenCalledTimes(1);
      expect(mockedUnblockCourier).toHaveBeenCalledWith('user-anna');
      await waitFor(() => expect(screen.queryByText('@anna')).toBeNull());
      expect(announced()).toEqual(['@anna is unblocked.']);
      expect(mockedFetchBlocked).toHaveBeenCalledTimes(2);
      expect(unblockButton('ben')).toBeEnabled();
    });

    it('says when the last block is lifted that nobody is blocked any more', async () => {
      serve(() => [anna]);
      mockedUnblockCourier.mockImplementation(async () => {
        serve(() => []);
      });
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      await fireEvent.press(unblockButton('anna'));

      expect(await screen.findByText(NOBODY)).toBeOnTheScreen();
    });

    /**
     * The list is read again whatever happened: a failure can be an answer
     * lost on the way back as easily as a refusal, and what the list shows
     * afterwards should be what is true.
     */
    it('says why an unblock failed, aloud as well, and reads the list again', async () => {
      mockedUnblockCourier.mockRejectedValue(new RpcError(UNBLOCK_FAILED, null));
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      await fireEvent.press(unblockButton('anna'));

      expect(await screen.findByText(UNBLOCK_FAILED)).toBeOnTheScreen();
      expect(announced()).toEqual([UNBLOCK_FAILED]);
      await waitFor(() => expect(mockedFetchBlocked).toHaveBeenCalledTimes(2));
      // Still blocked, and the courier can try again.
      await waitFor(() => expect(unblockButton('anna')).toBeEnabled());
      expect(unblockButton('anna')).not.toBeBusy();
    });

    it('lets go of a failure once the next unblock is tried', async () => {
      mockedUnblockCourier
        .mockRejectedValueOnce(new RpcError(UNBLOCK_FAILED, null))
        .mockResolvedValue(undefined);
      await renderScreen(<BlockedScreen />);
      await listLoaded();
      await fireEvent.press(unblockButton('anna'));
      expect(await screen.findByText(UNBLOCK_FAILED)).toBeOnTheScreen();
      await waitFor(() => expect(unblockButton('ben')).toBeEnabled());

      await fireEvent.press(unblockButton('ben'));

      await waitFor(() => expect(screen.queryByText(UNBLOCK_FAILED)).toBeNull());
      expect(announced()).toEqual([UNBLOCK_FAILED, '@ben is unblocked.']);
    });

    it('takes no other unblock while one is on its way', async () => {
      const unblocking = deferred<void>();
      mockedUnblockCourier.mockReturnValue(unblocking.promise);
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      await fireEvent.press(unblockButton('anna'));

      expect(unblockButton('anna')).toBeBusy();
      for (const username of ['ben', 'carla', 'dora']) {
        expect(unblockButton(username)).toBeDisabled();
        expect(unblockButton(username)).not.toBeBusy();
      }
      await fireEvent.press(unblockButton('ben'));
      await fireEvent.press(unblockButton('anna'));
      expect(mockedUnblockCourier).toHaveBeenCalledTimes(1);

      await act(async () => unblocking.resolve());
      await waitFor(() => expect(unblockButton('ben')).toBeEnabled());
      expect(mockedUnblockCourier).toHaveBeenCalledTimes(1);
    });
  });
});
