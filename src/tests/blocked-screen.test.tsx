import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import BlockedScreen from '@/app/(app)/blocked';
import { fetchBlocked, unblockCourier, type BlockedCourier } from '@/features/safety/safety';
import { RpcError } from '@/lib/rpc-error';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work that would otherwise
// count against whichever test runs first.
jest.setTimeout(20_000);

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush }),
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

const USERNAMES = ['anna', 'ben', 'carla', 'dora'];

const LEAD =
  'They cannot write to you or ask to be friends, and you do not see their letters. ' +
  'Unblocking brings their letters back and lets them ask again; to write to each other, ' +
  'one of you has to ask to be friends.';
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

const reportButton = (username: string) =>
  screen.getByRole('button', { name: `Report @${username}` });
const unblockButton = (username: string) =>
  screen.getByRole('button', { name: `Unblock @${username}` });

/** The row a courier is listed in: the nearest container of their name that also holds their Unblock button. */
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
    /** The way out of the alert, which leaves things as they are. */
    cancel: buttons.filter((choice) => choice.style === 'cancel').map((choice) => choice.text),
  };
}

/** Taps a button on the alert the screen raised most recently. */
async function chooseInAlert(label: string) {
  const choice = alertSpy.mock.lastCall?.[2]?.find((candidate) => candidate.text === label);
  if (!choice) throw new Error(`The alert has no "${label}" button.`);
  await act(async () => choice.onPress?.());
}

/** Lifts a block as the courier does: Unblock on their row, then Unblock again when asked. */
async function unblock(username: string) {
  await fireEvent.press(unblockButton(username));
  expect(lastAlert().title).toBe(`Unblock @${username}?`);
  await chooseInAlert('Unblock');
}

let announceSpy: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;

/** Everything said aloud to a screen reader so far, in order. */
const announced = () => announceSpy.mock.calls.map(([message]) => message);

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockPush.mockClear();
  mockedFetchBlocked.mockReset();
  serve(() => [anna, ben, carla, dora]);
  mockedUnblockCourier.mockReset().mockResolvedValue(undefined);
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

describe('BlockedScreen', () => {
  describe('the list', () => {
    /**
     * Unblocking lifts the block and nothing more: the friendship the block
     * ended stays ended, though the courier may now ask again. Someone who
     * expects to be friends again learns it here, rather than from a letter
     * that has nobody to go to.
     */
    it('says what a block does, that unblocking lets them ask again, and that it does not make you friends again', async () => {
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
     * own, away from the row it sits in. Eight buttons that said only
     * "Report" and "Unblock" would not say whom.
     */
    it('offers on each row to report or unblock that courier, naming them on each button', async () => {
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      for (const username of USERNAMES) {
        const row = within(rowOf(username));
        expect(row.getByText('Report')).toBeOnTheScreen();
        expect(row.getByText('Unblock')).toBeOnTheScreen();
        expect(row.getByRole('button', { name: `Report @${username}` })).toBeEnabled();
        expect(row.getByRole('button', { name: `Unblock @${username}` })).toBeEnabled();
      }
      expect(screen.queryByRole('button', { name: 'Report' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Unblock' })).toBeNull();
    });

    it('says so when nobody is blocked', async () => {
      serve(() => []);
      await renderScreen(<BlockedScreen />);

      expect(await screen.findByText(NOBODY)).toBeOnTheScreen();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
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

  describe('reporting', () => {
    /**
     * Once a courier is blocked their letters and their page are out of
     * reach, so this list is the one place left to report them from. The form
     * is told they are blocked already, and so does not offer to block them.
     */
    it('opens the report form about the courier on that row, saying they are blocked already', async () => {
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      await fireEvent.press(reportButton('carla'));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/report',
        params: { courier: 'user-carla', username: 'carla', blocked: '1' },
      });
      // Reporting asks nothing here, and lifts nothing: the block stays.
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockedUnblockCourier).not.toHaveBeenCalled();
    });
  });

  describe('unblocking', () => {
    /**
     * One stray tap would otherwise bring back the letters of someone blocked
     * for a reason, and let them ask again.
     */
    it('asks before unblocking, and says what unblocking brings back', async () => {
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      await fireEvent.press(unblockButton('carla'));

      expect(mockedUnblockCourier).not.toHaveBeenCalled();
      expect(lastAlert()).toEqual({
        title: 'Unblock @carla?',
        message:
          'Their letters come back, and they can ask to be friends again. You can block them ' +
          'again at any time.',
        buttons: ['Keep blocked', 'Unblock'],
        cancel: ['Keep blocked'],
      });
      expect(unblockButton('carla')).not.toBeBusy();
    });

    it('keeps the block if the courier thinks better of it', async () => {
      await renderScreen(<BlockedScreen />);
      await listLoaded();
      await fireEvent.press(unblockButton('carla'));

      await chooseInAlert('Keep blocked');

      expect(mockedUnblockCourier).not.toHaveBeenCalled();
      expect(announced()).toEqual([]);
      expect(mockedFetchBlocked).toHaveBeenCalledTimes(1);
      expect(screen.getByText('@carla')).toBeOnTheScreen();
      for (const username of USERNAMES) {
        expect(reportButton(username)).toBeEnabled();
        expect(unblockButton(username)).toBeEnabled();
        expect(unblockButton(username)).not.toBeBusy();
      }
    });

    it('unblocks a courier once the courier confirms, says so aloud, and shows the list without them', async () => {
      mockedUnblockCourier.mockImplementation(async () => {
        serve(() => [ben, carla, dora]);
      });
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      await unblock('anna');

      expect(mockedUnblockCourier).toHaveBeenCalledTimes(1);
      expect(mockedUnblockCourier).toHaveBeenCalledWith('user-anna');
      await waitFor(() => expect(screen.queryByText('@anna')).toBeNull());
      expect(announced()).toEqual(['@anna is unblocked.']);
      expect(mockedFetchBlocked).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(unblockButton('ben')).toBeEnabled());
      expect(reportButton('ben')).toBeEnabled();
    });

    it('says when the last block is lifted that nobody is blocked any more', async () => {
      serve(() => [anna]);
      mockedUnblockCourier.mockImplementation(async () => {
        serve(() => []);
      });
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      await unblock('anna');

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

      await unblock('anna');

      expect(await screen.findByText(UNBLOCK_FAILED)).toBeOnTheScreen();
      expect(announced()).toEqual([UNBLOCK_FAILED]);
      await waitFor(() => expect(mockedFetchBlocked).toHaveBeenCalledTimes(2));
      // Still blocked, and the courier can try again - or report them instead.
      await waitFor(() => expect(unblockButton('anna')).toBeEnabled());
      expect(unblockButton('anna')).not.toBeBusy();
      expect(reportButton('anna')).toBeEnabled();
    });

    it('lets go of a failure once the next unblock is tried', async () => {
      mockedUnblockCourier
        .mockRejectedValueOnce(new RpcError(UNBLOCK_FAILED, null))
        .mockResolvedValue(undefined);
      await renderScreen(<BlockedScreen />);
      await listLoaded();
      await unblock('anna');
      expect(await screen.findByText(UNBLOCK_FAILED)).toBeOnTheScreen();
      await waitFor(() => expect(unblockButton('ben')).toBeEnabled());

      await unblock('ben');

      await waitFor(() => expect(screen.queryByText(UNBLOCK_FAILED)).toBeNull());
      expect(mockedUnblockCourier).toHaveBeenLastCalledWith('user-ben');
      expect(announced()).toEqual([UNBLOCK_FAILED, '@ben is unblocked.']);
    });

    it('takes no other unblock, and no report, while one is on its way', async () => {
      const unblocking = deferred<void>();
      mockedUnblockCourier.mockReturnValue(unblocking.promise);
      await renderScreen(<BlockedScreen />);
      await listLoaded();

      await unblock('anna');

      expect(unblockButton('anna')).toBeBusy();
      expect(reportButton('anna')).toBeDisabled();
      for (const username of ['ben', 'carla', 'dora']) {
        expect(unblockButton(username)).toBeDisabled();
        expect(unblockButton(username)).not.toBeBusy();
        expect(reportButton(username)).toBeDisabled();
      }
      await fireEvent.press(unblockButton('ben'));
      await fireEvent.press(unblockButton('anna'));
      await fireEvent.press(reportButton('carla'));
      // No second question, and no report form.
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockedUnblockCourier).toHaveBeenCalledTimes(1);

      await act(async () => unblocking.resolve());
      await waitFor(() => expect(unblockButton('ben')).toBeEnabled());
      expect(reportButton('ben')).toBeEnabled();
      expect(mockedUnblockCourier).toHaveBeenCalledTimes(1);
    });
  });
});
