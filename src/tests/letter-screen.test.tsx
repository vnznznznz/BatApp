import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Alert, AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import LetterScreen from '@/app/(app)/letters/[id]';
import { readMessage, type Correspondent, type Letter } from '@/features/messages/messages';
import { blockCourier, type BlockOutcome } from '@/features/safety/safety';
import { formatTimestamp } from '@/lib/format';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work, measured at over five
// on four cores, that would otherwise count against whichever test runs first.
jest.setTimeout(20_000);

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
const mockParams = { id: 'letter-from-anna' };
/** Whether the letter is still the screen in front, as its navigator would say. */
const mockFocus = { isFocused: true };
// Stable, as a navigator's is.
const mockNavigation = { isFocused: () => mockFocus.isFocused };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      replace: jest.fn(),
      dismissTo: mockDismissTo,
    }),
    useNavigation: () => mockNavigation,
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

// Blocking is the one call the screen makes into the safety module. Reporting
// happens on a screen of its own.
jest.mock('@/features/safety/safety', () => ({
  ...jest.requireActual('@/features/safety/safety'),
  blockCourier: jest.fn(),
}));

const mockedReadMessage = jest.mocked(readMessage);
const mockedBlockCourier = jest.mocked(blockCourier);

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

const button = (name: string) => screen.getByRole('button', { name });

/** Opens Anna's letter, as tapping it in the inbox does, and resolves once it is on screen. */
async function openAnnasLetter() {
  await renderScreen(<LetterScreen />);
  await screen.findByText('Anna Weber');
}

/** A promise the test settles by hand, to look at the screen while a call is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** The app moving between background and foreground, as React Native reports it. */
const appStateListeners = new Set<(state: AppStateStatus) => void>();

/**
 * The courier coming back to the app - from another app, or from the phone's
 * lock screen. The screen fetches the letter again then, as it does each time
 * it comes back into view.
 */
async function returnToTheApp() {
  await act(async () => appStateListeners.forEach((listener) => listener('active')));
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
  mockFocus.isFocused = true;
  mockParams.id = 'letter-from-anna';
  mockedReadMessage.mockReset();
  mockedReadMessage.mockResolvedValue(receivedLetter());
  mockedBlockCourier.mockReset().mockResolvedValue('blocked');
  appStateListeners.clear();
  jest.mocked(AppState.addEventListener).mockImplementation((_type, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
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

  describe('reporting and blocking', () => {
    it('offers to report a letter received, and to block whoever sent it', async () => {
      await openAnnasLetter();

      expect(button('Report this letter')).toBeEnabled();
      expect(button('Block @anna')).toBeEnabled();
    });

    // Only a letter that landed for the courier can be reported: one of their
    // own carries nothing someone else chose to send them.
    it('offers neither on a letter of your own', async () => {
      mockedReadMessage.mockResolvedValue(sentLetter());
      await renderScreen(<LetterScreen />);
      await screen.findByText('Ben Okafor');

      expect(screen.queryByRole('button', { name: 'Report this letter' })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Block/ })).toBeNull();
    });

    /**
     * The report is about this letter, and whoever sent it: the form sends a
     * copy of the letter with the report, and offers to block its sender.
     */
    it('opens the report form about this letter and its sender', async () => {
      await openAnnasLetter();

      await fireEvent.press(button('Report this letter'));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/report',
        params: { letter: 'letter-from-anna', courier: 'user-anna', username: 'anna' },
      });
      // Whether to block as well is asked on the report form itself.
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockedBlockCourier).not.toHaveBeenCalled();
    });

    /**
     * A block tells nobody, and someone who means to have a courier stopped
     * could settle for it believing otherwise. The question says so before it
     * is answered, and points to reporting the letter instead, which can block
     * them as well.
     */
    it('asks before blocking, and says what a block does and what it does not', async () => {
      await openAnnasLetter();

      await fireEvent.press(button('Block @anna'));

      expect(mockedBlockCourier).not.toHaveBeenCalled();
      expect(lastAlert()).toEqual({
        title: 'Block @anna?',
        message:
          'Your friendship ends and they cannot ask again. Their letters - this one too - are ' +
          'hidden from you; yours stay with them. They are not told, though they may notice. ' +
          'Blocking alone tells no one: to tell the person who runs Night Courier, report the ' +
          'letter instead - a report can block them as well.',
        buttons: ['Cancel', 'Block'],
        destructive: ['Block'],
      });
    });

    it('blocks no one if the courier thinks better of it', async () => {
      await openAnnasLetter();
      await fireEvent.press(button('Block @anna'));

      await chooseInAlert('Cancel');

      expect(mockedBlockCourier).not.toHaveBeenCalled();
      expect(mockDismissTo).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(announced()).toEqual([]);
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(button('Block @anna')).toBeEnabled();
      expect(button('Write back')).toBeEnabled();
    });

    /**
     * The block hides the letter, so there is nothing left here to show. The
     * screen goes to the letters list by name rather than one step back, so
     * the courier lands on the list wherever the letter was opened from.
     */
    it('blocks the sender once the courier confirms, says so, and goes to the letters', async () => {
      await openAnnasLetter();
      await fireEvent.press(button('Block @anna'));

      await chooseInAlert('Block');

      expect(mockedBlockCourier).toHaveBeenCalledTimes(1);
      expect(mockedBlockCourier).toHaveBeenCalledWith('user-anna');
      await waitFor(() => expect(mockDismissTo).toHaveBeenCalledTimes(1));
      expect(mockDismissTo).toHaveBeenCalledWith('/letters');
      expect(mockBack).not.toHaveBeenCalled();
      expect(announced()).toEqual(['@anna is blocked.']);
    });

    /**
     * A block can take a moment, and the courier need not wait for it: the
     * header's back button still works while it is on its way. Once they have
     * gone, the screen is no longer theirs to move, and sending them to the
     * letters would take them from wherever they went.
     */
    it('takes the courier nowhere if they have left the letter by the time the block is made', async () => {
      const blocking = deferred<BlockOutcome>();
      mockedBlockCourier.mockReturnValue(blocking.promise);
      await openAnnasLetter();
      await fireEvent.press(button('Block @anna'));
      await chooseInAlert('Block');

      // Back to the list, or on to something else, while the block is still on its way.
      mockFocus.isFocused = false;
      await act(async () => blocking.resolve('blocked'));

      await waitFor(() => expect(announced()).toEqual(['@anna is blocked.']));
      expect(mockedBlockCourier).toHaveBeenCalledWith('user-anna');
      expect(mockDismissTo).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('takes nothing else while the block is on its way, and leaves once it is made', async () => {
      const blocking = deferred<BlockOutcome>();
      mockedBlockCourier.mockReturnValue(blocking.promise);
      await openAnnasLetter();
      await fireEvent.press(button('Block @anna'));

      await chooseInAlert('Block');

      expect(button('Block @anna')).toBeBusy();
      expect(button('Block @anna')).toBeDisabled();
      for (const other of ['Write back', 'Report this letter']) {
        expect(button(other)).toBeDisabled();
        expect(button(other)).not.toBeBusy();
        await fireEvent.press(button(other));
      }
      await fireEvent.press(button('Block @anna'));
      expect(mockPush).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(mockDismissTo).not.toHaveBeenCalled();

      await act(async () => blocking.resolve('blocked'));

      await waitFor(() => expect(mockDismissTo).toHaveBeenCalledTimes(1));
      expect(mockDismissTo).toHaveBeenCalledWith('/letters');
      expect(mockedBlockCourier).toHaveBeenCalledTimes(1);
    });

    /**
     * A block that did not go through must not look as if it had: the letter
     * stays, the reason is on screen and spoken, and the courier can try again.
     */
    it('says why a block did not go through, aloud as well, and stays on the letter', async () => {
      const offline = 'No connection. Check your network and try again.';
      mockedBlockCourier.mockRejectedValue(new RpcError(offline, null));
      await openAnnasLetter();
      await fireEvent.press(button('Block @anna'));

      await chooseInAlert('Block');

      expect(await screen.findByText(offline)).toBeOnTheScreen();
      expect(announced()).toEqual([offline]);
      expect(mockDismissTo).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      await waitFor(() => expect(button('Block @anna')).toBeEnabled());
      expect(button('Block @anna')).not.toBeBusy();
      expect(button('Write back')).toBeEnabled();
      expect(button('Report this letter')).toBeEnabled();
    });
  });

  describe('a letter that has gone', () => {
    /**
     * A letter can go while it is open: its sender deletes their account, and
     * their letters go with it, or the courier blocks them from the report
     * form, which hides their letters. The next fetch is refused - and what is
     * on screen is no longer the courier's to read, so the screen lets go of it
     * rather than keep it, as it keeps a letter through a fetch that failed.
     * (Found in review: back from a report that blocked its sender, the hidden
     * letter was on screen again.)
     */
    it('says the letter is no longer here once a fetch finds it gone, and goes to the letters', async () => {
      await openAnnasLetter();
      mockedReadMessage.mockRejectedValue(
        new RpcError(REFUSALS.message_not_found, 'message_not_found'),
      );

      await returnToTheApp();

      expect(await screen.findByText('This letter is no longer here.')).toBeOnTheScreen();
      expect(mockedReadMessage).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Anna Weber')).toBeNull();
      expect(screen.queryByText(/The harbour was loud tonight/)).toBeNull();
      expect(screen.queryByText(/^Flew /)).toBeNull();
      // Nothing about it is left to act on, or to try again: the way out is the only button.
      expect(screen.queryByText(REFUSALS.message_not_found)).toBeNull();
      expect(screen.getAllByRole('button')).toHaveLength(1);

      await fireEvent.press(button('Back to your letters'));

      expect(mockDismissTo).toHaveBeenCalledTimes(1);
      expect(mockDismissTo).toHaveBeenCalledWith('/letters');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('says so from the first fetch, too, rather than offering to try again', async () => {
      mockedReadMessage.mockRejectedValue(
        new RpcError(REFUSALS.message_not_found, 'message_not_found'),
      );

      await renderScreen(<LetterScreen />);

      expect(await screen.findByText('This letter is no longer here.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    /**
     * A letter of the courier's own, still in the air, goes when its recipient
     * deletes their account. Its landing time is no longer anything to wait
     * for: fetching again at it, and every minute after while it was "overdue",
     * would ask for a letter that is not there for as long as the screen is
     * open. (Found in review: 17 fetches in ten minutes.)
     */
    it('stops waiting to land a letter that has gone while in the air', async () => {
      mockedReadMessage.mockResolvedValue(sentLetter({ deliverAt: new Date(NOW + 30 * SECOND) }));
      await renderScreen(<LetterScreen />);
      await screen.findByText('Ben Okafor');
      mockedReadMessage.mockRejectedValue(
        new RpcError(REFUSALS.message_not_found, 'message_not_found'),
      );
      await returnToTheApp();
      expect(await screen.findByText('This letter is no longer here.')).toBeOnTheScreen();

      await letTimePass(5 * MINUTE);

      expect(mockedReadMessage).toHaveBeenCalledTimes(2);
    });

    it('keeps the letter on screen when a fetch fails for any other reason', async () => {
      await openAnnasLetter();
      mockedReadMessage.mockRejectedValue(
        new RpcError('No connection. Check your network and try again.', null),
      );

      await returnToTheApp();

      await waitFor(() => expect(mockedReadMessage).toHaveBeenCalledTimes(2));
      expect(screen.getByText('Anna Weber')).toBeOnTheScreen();
      expect(button('Write back')).toBeEnabled();
      expect(screen.queryByText('This letter is no longer here.')).toBeNull();
    });
  });
});
