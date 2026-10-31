import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import LettersScreen from '@/app/(app)/letters/index';
import {
  fetchInbox,
  fetchSent,
  PAGE_SIZE,
  type Correspondent,
  type ReceivedLetter,
  type SentLetter,
} from '@/features/messages/messages';
import { formatTimestamp } from '@/lib/format';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work, measured at over five
// on four cores, that would otherwise count against whichever test runs first.
jest.setTimeout(20_000);

const mockPush = jest.fn();

/**
 * Stands in for navigation focus. There is no navigator here, so mounting is
 * the first focus, and `returnToList()` is coming back to the list from a
 * letter - which is when `useFocusEffect` runs its effect again.
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
// helpers that name a correspondent and size a page are kept.
jest.mock('@/features/messages/messages', () => ({
  ...jest.requireActual('@/features/messages/messages'),
  fetchInbox: jest.fn(),
  fetchSent: jest.fn(),
  readMessage: jest.fn(),
}));

const mockedFetchInbox = jest.mocked(fetchInbox);
const mockedFetchSent = jest.mocked(fetchSent);

/** A fixed moment, so every countdown on screen is exact. */
const NOW = new Date('2026-10-31T21:00:00Z').getTime();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const anna: Correspondent = { id: 'user-anna', username: 'anna', displayName: 'Anna Weber' };
const ben: Correspondent = { id: 'user-ben', username: 'ben', displayName: 'Ben Okafor' };

/** A letter from Anna that landed two hours ago and has not been opened. */
function received(overrides: Partial<ReceivedLetter> = {}): ReceivedLetter {
  return {
    id: 'letter-from-anna',
    sender: anna,
    origin: { name: 'Hamburg', countryCode: 'DE' },
    distanceKm: 255.3,
    sentAt: new Date(NOW - 5 * HOUR - 12 * MINUTE),
    arrivedAt: new Date(NOW - 2 * HOUR),
    openedAt: null,
    preview: 'Dear Mara,\n\nthe harbour was loud tonight.',
    ...overrides,
  };
}

/** A letter to Ben, in the air until two and a half hours after the fixed now. */
function sent(overrides: Partial<SentLetter> = {}): SentLetter {
  return {
    id: 'letter-to-ben',
    recipient: ben,
    destination: { name: 'Vienna', countryCode: 'AT' },
    distanceKm: 523.7,
    sentAt: new Date(NOW - HOUR),
    deliverAt: new Date(NOW + 2 * HOUR + 30 * MINUTE + 30 * SECOND),
    delivered: false,
    preview: 'Dear Ben,\n\nhow is the new flat?',
    ...overrides,
  };
}

/** As many letters as the server sends at once, newest first: letter-1 to letter-30. */
function fullPage(): ReceivedLetter[] {
  return Array.from({ length: PAGE_SIZE }, (_, index) =>
    received({ id: `letter-${index + 1}`, arrivedAt: new Date(NOW - (index + 1) * HOUR) }),
  );
}

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

/** Matches text exactly as rendered; the default matcher collapses whitespace itself. */
const asRendered = (text: string) => text;

const tab = (name: 'Received' | 'Sent') => screen.getByRole('tab', { name });

async function showSent() {
  await fireEvent.press(tab('Sent'));
}

async function returnToList() {
  await act(() => mockFocus.returns.forEach((comeBack) => comeBack()));
}

/** The list itself: the scroll view the letters are rendered into. */
function letterList() {
  const [list] = screen.container.queryAll((node) => node.type === 'RCTScrollView');
  if (!list) throw new Error('There is no list of letters on screen.');
  return list;
}

/**
 * Scrolls to the end of the list, as far as the list can tell. The test
 * renderer does no layout, so the list never works out for itself that its
 * last row is in view; it is sent the event it would send.
 */
async function scrollToEnd() {
  await fireEvent(letterList(), 'endReached', { distanceFromEnd: 0 });
}

/** What the list holds, whether or not the list has rendered that far down. */
const lettersHeld = () => (letterList().props.data as { id: string }[]).map((letter) => letter.id);

/**
 * The refresh control has no role or label to find it by, so it is picked out
 * by its native type and sent the event the native view sends on a pull.
 */
async function pullToRefresh() {
  const [control] = screen.container.queryAll((node) => node.type === 'RCTRefreshControl');
  if (!control) throw new Error('The list has no refresh control.');
  await fireEvent(control, 'refresh');
}

const spinners = () => screen.container.queryAll((node) => node.type === 'ActivityIndicator');

/**
 * Lets time pass as it does on a phone: a second at a time, with the screen
 * rendering in between.
 */
async function letTimePass(ms: number) {
  for (let left = ms; left > 0; left -= SECOND) {
    await act(() => jest.advanceTimersByTimeAsync(Math.min(SECOND, left)));
  }
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockPush.mockClear();
  mockedFetchInbox.mockReset();
  mockedFetchInbox.mockResolvedValue([]);
  mockedFetchSent.mockReset();
  mockedFetchSent.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('LettersScreen', () => {
  describe('received letters', () => {
    it('shows the letters received first, and loads only those', async () => {
      await renderScreen(<LettersScreen />);

      expect(await screen.findByText(/^Nothing has landed yet\./)).toBeOnTheScreen();
      expect(tab('Received')).toBeSelected();
      expect(tab('Sent')).not.toBeSelected();
      expect(mockedFetchInbox).toHaveBeenCalledTimes(1);
      expect(mockedFetchInbox).toHaveBeenCalledWith();
      expect(mockedFetchSent).not.toHaveBeenCalled();
    });

    it('lists a landed letter with its sender, where it flew from, how far, and when it landed', async () => {
      const letter = received();
      mockedFetchInbox.mockResolvedValue([letter]);
      await renderScreen(<LettersScreen />);

      expect(await screen.findByText('Anna Weber')).toBeOnTheScreen();
      expect(
        screen.getByText(`From Hamburg · 255 km · ${formatTimestamp(letter.arrivedAt)}`),
      ).toBeOnTheScreen();
      expect(screen.getByText('Dear Mara, the harbour was loud tonight.')).toBeOnTheScreen();
    });

    /**
     * Letters start with a greeting and a blank line. Kept as written, a
     * two-line preview would show "Dear Mara," and then nothing.
     */
    it("runs a letter's opening lines together for the preview", async () => {
      mockedFetchInbox.mockResolvedValue([
        received({ preview: '  Dear Mara,\n\n  the harbour was loud tonight.\n' }),
      ]);
      await renderScreen(<LettersScreen />);
      await screen.findByText('Anna Weber');

      expect(
        screen.getByText('Dear Mara, the harbour was loud tonight.', { normalizer: asRendered }),
      ).toBeOnTheScreen();
    });

    it('marks the letters that have not been opened, and only those', async () => {
      mockedFetchInbox.mockResolvedValue([
        received({ id: 'from-anna', sender: anna, openedAt: null }),
        received({ id: 'from-ben', sender: ben, openedAt: new Date(NOW - HOUR) }),
      ]);
      await renderScreen(<LettersScreen />);

      const unopened = await screen.findByRole('button', { name: /Anna Weber/ });
      const opened = screen.getByRole('button', { name: /Ben Okafor/ });
      expect(within(unopened).getByLabelText('Unread')).toBeOnTheScreen();
      expect(within(opened).queryByLabelText('Unread')).toBeNull();
      expect(screen.getAllByLabelText('Unread')).toHaveLength(1);
    });

    it('names a sender by their username when they have no name to show', async () => {
      mockedFetchInbox.mockResolvedValue([received({ sender: { ...anna, displayName: '' } })]);
      await renderScreen(<LettersScreen />);

      expect(await screen.findByText('@anna')).toBeOnTheScreen();
    });

    it('opens a letter when it is tapped', async () => {
      mockedFetchInbox.mockResolvedValue([received({ id: 'letter-42' })]);
      await renderScreen(<LettersScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: /Anna Weber/ }));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/letters/[id]',
        params: { id: 'letter-42' },
      });
    });

    // Opening a letter marks it read on the server; the list learns of it by
    // fetching again when it comes back into view.
    it('clears the unread mark when the list is shown again after the letter was read', async () => {
      mockedFetchInbox
        .mockResolvedValueOnce([received()])
        .mockResolvedValue([received({ openedAt: new Date(NOW) })]);
      await renderScreen(<LettersScreen />);
      expect(await screen.findByLabelText('Unread')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: /Anna Weber/ }));
      await returnToList();

      await waitFor(() => expect(screen.queryByLabelText('Unread')).toBeNull());
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(mockedFetchInbox).toHaveBeenCalledTimes(2);
    });

    it('says when nothing has landed yet', async () => {
      await renderScreen(<LettersScreen />);

      expect(
        await screen.findByText(
          'Nothing has landed yet. When a friend’s bat arrives, the letter will be here.',
        ),
      ).toBeOnTheScreen();
    });

    it('does not say nothing has landed while the first letters are still loading', async () => {
      mockedFetchInbox.mockReturnValue(new Promise<ReceivedLetter[]>(() => {}));
      await renderScreen(<LettersScreen />);

      expect(spinners()).toHaveLength(1);
      expect(screen.queryByText(/^Nothing has landed yet/)).toBeNull();
    });

    it('says so when the letters cannot be loaded, rather than that there are none', async () => {
      mockedFetchInbox.mockRejectedValue(
        new Error('Your letters could not be loaded. Check your connection.'),
      );
      await renderScreen(<LettersScreen />);

      expect(
        await screen.findByText('Your letters could not be loaded. Check your connection.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/^Nothing has landed yet/)).toBeNull();
    });
  });

  describe('sent letters', () => {
    it('switches to the letters sent, loading them only when asked for', async () => {
      mockedFetchSent.mockResolvedValue([sent()]);
      await renderScreen(<LettersScreen />);
      await screen.findByText(/^Nothing has landed yet\./);
      expect(mockedFetchSent).not.toHaveBeenCalled();

      await showSent();

      expect(await screen.findByText('To Ben Okafor')).toBeOnTheScreen();
      expect(tab('Sent')).toBeSelected();
      expect(tab('Received')).not.toBeSelected();
      expect(mockedFetchSent).toHaveBeenCalledTimes(1);
      expect(mockedFetchSent).toHaveBeenCalledWith();
    });

    it('shows where a letter in the air is going, and how long until it lands', async () => {
      mockedFetchSent.mockResolvedValue([sent()]);
      await renderScreen(<LettersScreen />);
      await showSent();

      expect(await screen.findByText('To Ben Okafor')).toBeOnTheScreen();
      expect(screen.getByText('In the air to Vienna · lands in 2h 30m')).toBeOnTheScreen();
      expect(screen.getByText('Dear Ben, how is the new flat?')).toBeOnTheScreen();
    });

    /**
     * The client never decides when a letter lands. Each countdown runs toward
     * the arrival time the server set when the letter left - 523 km in twelve
     * minutes, here, because that is what the server said - and the phone's
     * clock only moves it along.
     */
    it('counts each letter in the air down to the arrival time the server set', async () => {
      mockedFetchSent.mockResolvedValue([
        sent({ id: 'to-ben', deliverAt: new Date(NOW + 12 * MINUTE + 30 * SECOND) }),
        sent({
          id: 'to-anna',
          recipient: anna,
          destination: { name: 'Hamburg', countryCode: 'DE' },
          distanceKm: 255.3,
          deliverAt: new Date(NOW + 7 * HOUR + 42 * MINUTE + 30 * SECOND),
        }),
      ]);
      await renderScreen(<LettersScreen />);
      await showSent();

      expect(await screen.findByText('In the air to Vienna · lands in 12m')).toBeOnTheScreen();
      expect(screen.getByText('In the air to Hamburg · lands in 7h 42m')).toBeOnTheScreen();

      await letTimePass(MINUTE);

      expect(screen.getByText('In the air to Vienna · lands in 11m')).toBeOnTheScreen();
      expect(screen.getByText('In the air to Hamburg · lands in 7h 41m')).toBeOnTheScreen();
    });

    it('shows where a letter landed, and when', async () => {
      const letter = sent({
        delivered: true,
        sentAt: new Date(NOW - 9 * HOUR),
        deliverAt: new Date(NOW - 2 * HOUR),
      });
      mockedFetchSent.mockResolvedValue([letter]);
      await renderScreen(<LettersScreen />);
      await showSent();

      expect(
        await screen.findByText(`Landed in Vienna · ${formatTimestamp(letter.deliverAt)}`),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/^In the air/)).toBeNull();
    });

    it('calls a letter landed once the arrival time the server set has passed', async () => {
      const letter = sent({ deliverAt: new Date(NOW + 30 * SECOND) });
      mockedFetchSent.mockResolvedValue([letter]);
      await renderScreen(<LettersScreen />);
      await showSent();
      expect(
        await screen.findByText('In the air to Vienna · lands in less than a minute'),
      ).toBeOnTheScreen();

      await letTimePass(31 * SECOND);

      expect(
        screen.getByText(`Landed in Vienna · ${formatTimestamp(letter.deliverAt)}`),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/any moment now/)).toBeNull();
    });

    /**
     * There are no read receipts. The server never tells a sender whether a
     * letter was opened; these letters carry it anyway, both ways, so that a
     * Sent view that started showing it would have something to show.
     */
    it('never shows whether a letter that was sent has been opened', async () => {
      const openedByBen = {
        ...sent({ id: 'opened', delivered: true, deliverAt: new Date(NOW - HOUR) }),
        openedAt: new Date(NOW - 30 * MINUTE),
      };
      const notOpenedYet = {
        ...sent({ id: 'not-opened', delivered: true, deliverAt: new Date(NOW - 2 * HOUR) }),
        openedAt: null,
      };
      mockedFetchSent.mockResolvedValue([sent({ id: 'in-the-air' }), openedByBen, notOpenedYet]);
      await renderScreen(<LettersScreen />);
      await showSent();
      expect(await screen.findAllByText('To Ben Okafor')).toHaveLength(3);

      const readState = /unread|\bread\b|opened|\bseen\b/i;
      expect(screen.queryAllByText(readState)).toHaveLength(0);
      expect(screen.queryAllByLabelText(readState)).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: readState })).toHaveLength(0);
    });

    it('opens a sent letter when it is tapped', async () => {
      mockedFetchSent.mockResolvedValue([sent({ id: 'letter-7' })]);
      await renderScreen(<LettersScreen />);
      await showSent();

      await fireEvent.press(await screen.findByRole('button', { name: /^To Ben Okafor/ }));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/letters/[id]',
        params: { id: 'letter-7' },
      });
    });

    it('says when no letter has been sent yet', async () => {
      await renderScreen(<LettersScreen />);
      await showSent();

      expect(await screen.findByText('You have not sent a letter yet.')).toBeOnTheScreen();
    });

    it('says so when the letters sent cannot be loaded, rather than that there are none', async () => {
      mockedFetchSent.mockRejectedValue(
        new Error('Your letters could not be loaded. Check your connection.'),
      );
      await renderScreen(<LettersScreen />);
      await showSent();

      expect(
        await screen.findByText('Your letters could not be loaded. Check your connection.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText('You have not sent a letter yet.')).toBeNull();
    });
  });

  describe('older letters', () => {
    it('asks for the page after the last letter held when the end of the list is reached', async () => {
      mockedFetchInbox
        .mockResolvedValueOnce(fullPage())
        .mockResolvedValueOnce([received({ id: 'letter-31' })]);
      await renderScreen(<LettersScreen />);
      await screen.findAllByText('Anna Weber');

      await scrollToEnd();

      expect(mockedFetchInbox).toHaveBeenCalledTimes(2);
      expect(mockedFetchInbox).toHaveBeenLastCalledWith(`letter-${PAGE_SIZE}`);
      await waitFor(() => expect(lettersHeld()).toHaveLength(PAGE_SIZE + 1));
      expect(lettersHeld().at(-1)).toBe('letter-31');
    });

    it('shows that older letters are loading until they arrive', async () => {
      let arrive: (letters: ReceivedLetter[]) => void = () => {};
      mockedFetchInbox.mockResolvedValueOnce(fullPage()).mockReturnValueOnce(
        new Promise<ReceivedLetter[]>((resolve) => {
          arrive = resolve;
        }),
      );
      await renderScreen(<LettersScreen />);
      await screen.findAllByText('Anna Weber');
      expect(spinners()).toHaveLength(0);

      await scrollToEnd();
      expect(spinners()).toHaveLength(1);

      await act(async () => arrive([received({ id: 'letter-31' })]));

      await waitFor(() => expect(spinners()).toHaveLength(0));
    });

    it('does not ask for more when the first page was already short', async () => {
      mockedFetchInbox.mockResolvedValue([received()]);
      await renderScreen(<LettersScreen />);
      await screen.findByText('Anna Weber');

      await scrollToEnd();

      expect(mockedFetchInbox).toHaveBeenCalledTimes(1);
    });

    it('stops asking once an older page comes back short', async () => {
      mockedFetchInbox
        .mockResolvedValueOnce(fullPage())
        .mockResolvedValueOnce([received({ id: 'letter-31' })]);
      await renderScreen(<LettersScreen />);
      await screen.findAllByText('Anna Weber');
      await scrollToEnd();
      await waitFor(() => expect(lettersHeld()).toHaveLength(PAGE_SIZE + 1));

      await scrollToEnd();

      expect(mockedFetchInbox).toHaveBeenCalledTimes(2);
    });

    it('pages through the letters sent in the same way', async () => {
      const page = Array.from({ length: PAGE_SIZE }, (_, index) =>
        sent({ id: `sent-${index + 1}` }),
      );
      mockedFetchSent.mockResolvedValueOnce(page).mockResolvedValueOnce([]);
      await renderScreen(<LettersScreen />);
      await showSent();
      await screen.findAllByText('To Ben Okafor');

      await scrollToEnd();

      expect(mockedFetchSent).toHaveBeenCalledTimes(2);
      expect(mockedFetchSent).toHaveBeenLastCalledWith(`sent-${PAGE_SIZE}`);
    });
  });

  describe('staying current', () => {
    it('fetches the newest letters again when pulled down', async () => {
      mockedFetchInbox
        .mockResolvedValueOnce([received({ id: 'older', sender: ben })])
        .mockResolvedValue([received({ id: 'newer' }), received({ id: 'older', sender: ben })]);
      await renderScreen(<LettersScreen />);
      await screen.findByText('Ben Okafor');
      expect(screen.queryByText('Anna Weber')).toBeNull();

      await pullToRefresh();

      expect(await screen.findByText('Anna Weber')).toBeOnTheScreen();
      expect(screen.getByText('Ben Okafor')).toBeOnTheScreen();
      expect(mockedFetchInbox).toHaveBeenCalledTimes(2);
      expect(mockedFetchInbox).toHaveBeenLastCalledWith();
    });

    it('keeps the letters it has when a refresh fails, and says why', async () => {
      mockedFetchInbox
        .mockResolvedValueOnce([received()])
        .mockRejectedValue(new Error('No connection. Check your network and try again.'));
      await renderScreen(<LettersScreen />);
      await screen.findByText('Anna Weber');

      await pullToRefresh();

      expect(
        await screen.findByText('No connection. Check your network and try again.'),
      ).toBeOnTheScreen();
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
    });
  });
});
