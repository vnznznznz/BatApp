import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import LetterScreen from '@/app/(app)/letters/[id]';
import { readMessage, type Correspondent, type Letter } from '@/features/messages/messages';
import { formatTimestamp } from '@/lib/format';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work, measured at over five
// on four cores, that would otherwise count against whichever test runs first.
jest.setTimeout(20_000);

const mockPush = jest.fn();
const mockParams = { id: 'letter-from-anna' };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => mockParams,
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
  };
});

// The screen is under test, not the network. The fetchers are replaced; the
// helper that names a correspondent is kept.
jest.mock('@/features/messages/messages', () => ({
  ...jest.requireActual('@/features/messages/messages'),
  fetchInbox: jest.fn(),
  fetchSent: jest.fn(),
  readMessage: jest.fn(),
}));

const mockedReadMessage = jest.mocked(readMessage);

/** A fixed moment, so every countdown on screen is exact. */
const NOW = new Date('2026-10-31T21:00:00Z').getTime();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const anna: Correspondent = { id: 'user-anna', username: 'anna', displayName: 'Anna Weber' };
const ben: Correspondent = { id: 'user-ben', username: 'ben', displayName: 'Ben Okafor' };

/** From Anna in Hamburg to the courier in Berlin: 3h 11m in the air, landed two hours ago. */
function receivedLetter(overrides: Partial<Letter> = {}): Letter {
  return {
    id: 'letter-from-anna',
    direction: 'received',
    other: anna,
    origin: { name: 'Hamburg', countryCode: 'DE' },
    destination: { name: 'Berlin', countryCode: 'DE' },
    distanceKm: 255.3,
    sentAt: new Date(NOW - 5 * HOUR - 11 * MINUTE),
    deliverAt: new Date(NOW - 2 * HOUR),
    delivered: true,
    openedAt: new Date(NOW),
    body: 'Dear Mara,\n\nThe harbour was loud tonight.\n\nAnna',
    ...overrides,
  };
}

/** From the courier in Berlin to Ben in Vienna, landing two and a half hours after the fixed now. */
function sentLetter(overrides: Partial<Letter> = {}): Letter {
  return {
    id: 'letter-to-ben',
    direction: 'sent',
    other: ben,
    origin: { name: 'Berlin', countryCode: 'DE' },
    destination: { name: 'Vienna', countryCode: 'AT' },
    distanceKm: 523.7,
    sentAt: new Date(NOW - HOUR),
    deliverAt: new Date(NOW + 2 * HOUR + 30 * MINUTE + 30 * SECOND),
    delivered: false,
    openedAt: null,
    body: 'Dear Ben,\n\nHow is the new flat?\n\nMara',
    ...overrides,
  };
}

/** The same letter as the server reports it once its bat has landed. */
const landed = (letter: Letter): Letter => ({ ...letter, delivered: true });

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

/** Matches text exactly as rendered; the default matcher collapses whitespace itself. */
const asRendered = (text: string) => text;

const spinners = () => screen.container.queryAll((node) => node.type === 'ActivityIndicator');

const writeBack = () => screen.queryByRole('button', { name: 'Write back' });

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
  mockParams.id = 'letter-from-anna';
  mockedReadMessage.mockReset();
  mockedReadMessage.mockResolvedValue(receivedLetter());
});

afterEach(() => {
  jest.useRealTimers();
});

describe('LetterScreen', () => {
  describe('a letter received', () => {
    it('opens the letter it was asked to show', async () => {
      mockParams.id = 'letter-42';
      await renderScreen(<LetterScreen />);
      await screen.findByText('Anna Weber');

      expect(mockedReadMessage).toHaveBeenCalledTimes(1);
      expect(mockedReadMessage).toHaveBeenCalledWith('letter-42');
    });

    it('shows who it is from', async () => {
      await renderScreen(<LetterScreen />);

      expect(await screen.findByText('Anna Weber')).toBeOnTheScreen();
      expect(screen.getByText('From')).toBeOnTheScreen();
      expect(screen.getByText('@anna')).toBeOnTheScreen();
      expect(screen.queryByText('To')).toBeNull();
    });

    it('shows the letter whole, with its paragraphs as written', async () => {
      await renderScreen(<LetterScreen />);
      await screen.findByText('Anna Weber');

      expect(
        screen.getByText('Dear Mara,\n\nThe harbour was loud tonight.\n\nAnna', {
          normalizer: asRendered,
        }),
      ).toBeOnTheScreen();
    });

    it('says how far it flew, from where, how long it took, and when it landed', async () => {
      const letter = receivedLetter();
      mockedReadMessage.mockResolvedValue(letter);
      await renderScreen(<LetterScreen />);

      expect(
        await screen.findByText('Flew 255 km from Hamburg, DE to Berlin, DE, in 3h 11m.'),
      ).toBeOnTheScreen();
      expect(
        screen.getByText(
          `Sent ${formatTimestamp(letter.sentAt)}. Landed ${formatTimestamp(letter.deliverAt)}.`,
        ),
      ).toBeOnTheScreen();
    });

    it('offers to write back to whoever sent it', async () => {
      await renderScreen(<LetterScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Write back' }));

      expect(mockPush).toHaveBeenCalledWith({ pathname: '/compose', params: { to: 'user-anna' } });
    });
  });

  describe('a letter sent', () => {
    it('shows who it is going to, where, and how long until it lands', async () => {
      const letter = sentLetter();
      mockedReadMessage.mockResolvedValue(letter);
      await renderScreen(<LetterScreen />);

      expect(await screen.findByText('Ben Okafor')).toBeOnTheScreen();
      expect(screen.getByText('To')).toBeOnTheScreen();
      expect(screen.getByText('@ben')).toBeOnTheScreen();
      expect(screen.queryByText('From')).toBeNull();
      expect(screen.getByText('Flying 524 km from Berlin, DE to Vienna, AT.')).toBeOnTheScreen();
      expect(
        screen.getByText(
          `Sent ${formatTimestamp(letter.sentAt)}. Lands in 2h 30m, at ${formatTimestamp(letter.deliverAt)}.`,
        ),
      ).toBeOnTheScreen();
    });

    it('does not offer to write back to a letter of your own', async () => {
      mockedReadMessage.mockResolvedValue(sentLetter());
      await renderScreen(<LetterScreen />);
      await screen.findByText('Ben Okafor');

      expect(writeBack()).toBeNull();
    });

    /**
     * The client never decides when a letter lands. The countdown runs toward
     * the arrival time the server set when the letter left; the phone's clock
     * only moves it along.
     */
    it('counts down to the arrival time the server set', async () => {
      mockedReadMessage.mockResolvedValue(sentLetter());
      await renderScreen(<LetterScreen />);
      expect(await screen.findByText(/\. Lands in 2h 30m, at /)).toBeOnTheScreen();

      await letTimePass(MINUTE);

      expect(screen.getByText(/\. Lands in 2h 29m, at /)).toBeOnTheScreen();
      expect(mockedReadMessage).toHaveBeenCalledTimes(1);
    });

    it('tells a letter that has landed in the past tense', async () => {
      const letter = sentLetter({
        sentAt: new Date(NOW - 9 * HOUR),
        deliverAt: new Date(NOW - 2 * HOUR),
        delivered: true,
      });
      mockedReadMessage.mockResolvedValue(letter);
      await renderScreen(<LetterScreen />);

      expect(
        await screen.findByText('Flew 524 km from Berlin, DE to Vienna, AT, in 7h.'),
      ).toBeOnTheScreen();
      expect(
        screen.getByText(
          `Sent ${formatTimestamp(letter.sentAt)}. Landed ${formatTimestamp(letter.deliverAt)}.`,
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/Lands in/)).toBeNull();
      expect(writeBack()).toBeNull();
    });

    /**
     * There are no read receipts. The server never tells a sender whether a
     * letter was opened; this one carries it anyway, so a screen that started
     * showing it would have something to show.
     */
    it('never says whether the friend has opened it', async () => {
      mockedReadMessage.mockResolvedValue(
        sentLetter({
          sentAt: new Date(NOW - 9 * HOUR),
          deliverAt: new Date(NOW - 2 * HOUR),
          delivered: true,
          openedAt: new Date(NOW - HOUR),
        }),
      );
      await renderScreen(<LetterScreen />);
      await screen.findByText('Ben Okafor');

      const readState = /unread|\bread\b|opened|\bseen\b/i;
      expect(screen.queryAllByText(readState)).toHaveLength(0);
      expect(screen.queryAllByLabelText(readState)).toHaveLength(0);
    });
  });

  describe('landing', () => {
    /**
     * Fetching is what lands a letter: the server delivers whatever is due
     * before it answers. So the screen asks again once the arrival time has
     * passed, and the letter lands on screen without anyone leaving and
     * coming back.
     */
    it('fetches the letter again once it is due, and shows it landed', async () => {
      const inTheAir = sentLetter({ deliverAt: new Date(NOW + 2 * MINUTE + 30 * SECOND) });
      mockedReadMessage.mockResolvedValue(inTheAir);
      await renderScreen(<LetterScreen />);
      expect(await screen.findByText(/\. Lands in 2m, at /)).toBeOnTheScreen();

      // The server has landed it by the time it is next asked.
      mockedReadMessage.mockResolvedValue(landed(inTheAir));
      await letTimePass(2 * MINUTE);
      expect(mockedReadMessage).toHaveBeenCalledTimes(1);

      await letTimePass(32 * SECOND);

      expect(mockedReadMessage).toHaveBeenCalledTimes(2);
      expect(
        await screen.findByText(
          `Sent ${formatTimestamp(inTheAir.sentAt)}. Landed ${formatTimestamp(inTheAir.deliverAt)}.`,
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/Lands in/)).toBeNull();
    });

    /**
     * The server lands a letter only once its own clock says it is due. A
     * phone running a few seconds fast asks too early and is told the bat is
     * still out; the screen has to ask again rather than wait for the courier
     * to leave and come back.
     */
    it('keeps asking until the server has landed it', async () => {
      const inTheAir = sentLetter({ deliverAt: new Date(NOW + MINUTE) });
      mockedReadMessage
        .mockResolvedValueOnce(inTheAir)
        .mockResolvedValueOnce(inTheAir)
        .mockResolvedValue(landed(inTheAir));
      await renderScreen(<LetterScreen />);
      await screen.findByText('Ben Okafor');

      await letTimePass(2 * MINUTE);

      expect(screen.getByText(/\. Landed /)).toBeOnTheScreen();
      // On opening, once too early for the server, and once more.
      expect(mockedReadMessage).toHaveBeenCalledTimes(3);
    });

    it('does not keep asking about a letter that has already landed', async () => {
      await renderScreen(<LetterScreen />);
      await screen.findByText('Anna Weber');

      await letTimePass(5 * MINUTE);

      expect(mockedReadMessage).toHaveBeenCalledTimes(1);
    });

    // From the moment a letter is due until the server says it has landed - at
    // least the second's grace before the screen asks, longer while the
    // server's clock is behind or a fetch fails - the countdown has nothing
    // left to count. Spliced into "Lands in ...", formatDuration's "any moment
    // now" once read "Lands in any moment now, at 21:00."
    it('does not say a letter "lands in any moment now" once it is due', async () => {
      const inTheAir = sentLetter({ deliverAt: new Date(NOW + 10 * SECOND) });
      // The server's clock is a little behind the phone's: the bat is still out.
      mockedReadMessage.mockResolvedValue(inTheAir);
      await renderScreen(<LetterScreen />);
      await screen.findByText('Ben Okafor');

      await letTimePass(10 * SECOND);

      expect(
        screen.getByText(
          `Sent ${formatTimestamp(inTheAir.sentAt)}. Landing any moment now, at ${formatTimestamp(inTheAir.deliverAt)}.`,
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/Lands in any moment now/)).toBeNull();
    });
  });

  describe('opening', () => {
    it('shows nothing of the letter until it has loaded', async () => {
      mockedReadMessage.mockReturnValue(new Promise<Letter>(() => {}));
      await renderScreen(<LetterScreen />);

      expect(spinners()).toHaveLength(1);
      expect(screen.queryByText('From')).toBeNull();
      expect(screen.queryByText('To')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(writeBack()).toBeNull();
    });

    it('says why a letter could not be opened, and tries again when asked', async () => {
      mockedReadMessage
        .mockRejectedValueOnce(new Error('That letter could not be opened. Check your connection.'))
        .mockResolvedValue(receivedLetter());
      await renderScreen(<LetterScreen />);
      expect(
        await screen.findByText('That letter could not be opened. Check your connection.'),
      ).toBeOnTheScreen();
      expect(spinners()).toHaveLength(0);

      await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('Anna Weber')).toBeOnTheScreen();
      expect(
        screen.queryByText('That letter could not be opened. Check your connection.'),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(mockedReadMessage).toHaveBeenCalledTimes(2);
      expect(mockedReadMessage).toHaveBeenLastCalledWith('letter-from-anna');
    });
  });
});
