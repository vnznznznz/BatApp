import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import ReportScreen from '@/app/(app)/report';
import { REPORT_NOTE_MAX_LENGTH, REPORT_RETENTION_DAYS } from '@/constants/config';
import { reportCourier, reportLetter, type ReportOutcome } from '@/features/safety/safety';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work that would otherwise
// count against whichever test runs first.
jest.setTimeout(20_000);

const mockDismiss = jest.fn();
/** The route's search params, as the screen reads them. */
const mockParams: { courier?: string; username?: string; letter?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismiss: mockDismiss }),
  useLocalSearchParams: () => mockParams,
}));

// The screen is under test, not the network. Every call that reaches Supabase
// is replaced; the words for each reason and the check on a note's length are
// kept, so what the screen offers and refuses is what it would for real.
jest.mock('@/features/safety/safety', () => ({
  ...jest.requireActual('@/features/safety/safety'),
  blockCourier: jest.fn(),
  unblockCourier: jest.fn(),
  fetchBlocked: jest.fn(),
  reportLetter: jest.fn(),
  reportCourier: jest.fn(),
}));

const mockedReportLetter = jest.mocked(reportLetter);
const mockedReportCourier = jest.mocked(reportCourier);

/** The reasons, in the words and the order the courier is offered them. */
const REASONS = [
  'Spam or a scam',
  'Harassment or bullying',
  'Hate speech',
  'Sexual content',
  'Threats or violence',
  'Something else',
];

const NO_REASON = 'Choose what is wrong first.';
const NOTE_HINT = `Optional. Up to ${REPORT_NOTE_MAX_LENGTH} characters.`;
const NOTE_TOO_LONG = `A note can be at most ${REPORT_NOTE_MAX_LENGTH} characters.`;
const BLOCK_HINT =
  'Ends your friendship, hides their letters from you, and stops them asking again.';

const REPORTED = 'Your report is with the people who run Night Courier.';
const LETTER_REPORTED_BEFORE = 'You had already reported this letter. Your first report stands.';
const COURIER_REPORTED_BEFORE = 'You have already reported @anna, and that report is still open.';
const BLOCKED =
  '@anna is blocked: they cannot write to you or ask to be friends, and their letters are ' +
  'hidden. You can unblock them in your profile.';

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

/** Opens the screen as "Report this letter" does, on a letter from Anna. */
async function reportingTheLetter() {
  Object.assign(mockParams, { letter: 'letter-from-anna', courier: 'user-anna', username: 'anna' });
  await renderScreen(<ReportScreen />);
}

/** Opens it as "Report @anna" on Anna's page does: about her, with no letter. */
async function reportingTheCourier() {
  Object.assign(mockParams, { courier: 'user-anna', username: 'anna' });
  await renderScreen(<ReportScreen />);
}

const reasonChoice = (label: string) => screen.getByRole('radio', { name: label });
const noteField = () => screen.getByLabelText('Anything else we should know?');
const blockSwitch = () => screen.getByRole('switch', { name: 'Also block @anna' });
const sendButton = () => screen.getByRole('button', { name: 'Send report' });

/** Flips "Also block" as a tap on the switch does. */
const setBlocking = (on: boolean) => fireEvent(blockSwitch(), 'valueChange', on);

const spinners = () => screen.container.queryAll((node) => node.type === 'ActivityIndicator');

let announceSpy: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;

/** Everything said aloud to a screen reader so far, in order. */
const announced = () => announceSpy.mock.calls.map(([message]) => message);

beforeEach(() => {
  mockDismiss.mockClear();
  delete mockParams.letter;
  delete mockParams.courier;
  delete mockParams.username;
  mockedReportLetter.mockReset().mockResolvedValue('reported');
  mockedReportCourier.mockReset().mockResolvedValue('reported');
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
});

afterEach(() => {
  announceSpy.mockRestore();
});

describe('ReportScreen', () => {
  describe('reporting a letter', () => {
    it('says it is a letter from the sender, and that a copy of it goes with the report', async () => {
      await reportingTheLetter();

      expect(screen.getByText('Report')).toBeOnTheScreen();
      expect(screen.getByText('A letter from @anna')).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Your report goes to the people who run Night Courier, with a copy of the letter. ' +
            '@anna is not told who reported them.',
        ),
      ).toBeOnTheScreen();
    });

    /**
     * The copy outlives the letter, and both accounts. The courier is told for
     * how long, in the number the database deletes by: parity.db.test.mjs holds
     * the two together.
     */
    it('says how long the report and the copy of the letter are kept', async () => {
      await reportingTheLetter();

      expect(
        screen.getByText(
          `Reports, and the copy of the letter, are kept for ${REPORT_RETENTION_DAYS} days and then deleted.`,
        ),
      ).toBeOnTheScreen();
    });

    it('reports that letter, with the reason and note given, and blocks its sender too', async () => {
      await reportingTheLetter();

      await fireEvent.press(reasonChoice('Harassment or bullying'));
      await fireEvent.changeText(noteField(), 'The third letter like this one.');
      await fireEvent.press(sendButton());

      expect(mockedReportLetter).toHaveBeenCalledTimes(1);
      expect(mockedReportLetter).toHaveBeenCalledWith('letter-from-anna', {
        reason: 'harassment',
        note: 'The third letter like this one.',
        alsoBlock: true,
      });
      expect(mockedReportCourier).not.toHaveBeenCalled();
      expect(await screen.findByText('Thank you')).toBeOnTheScreen();
    });
  });

  describe('reporting a courier', () => {
    it('names the courier, and says they are not told who reported them', async () => {
      await reportingTheCourier();

      expect(screen.getByText('Report')).toBeOnTheScreen();
      expect(screen.getByText('@anna')).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Your report goes to the people who run Night Courier. @anna is not told who reported them.',
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/A letter from|copy of the letter/)).toBeNull();
    });

    it('says how long the report is kept', async () => {
      await reportingTheCourier();

      expect(
        screen.getByText(`Reports are kept for ${REPORT_RETENTION_DAYS} days and then deleted.`),
      ).toBeOnTheScreen();
    });

    it('reports the courier rather than any letter', async () => {
      await reportingTheCourier();

      await fireEvent.press(reasonChoice('Spam or a scam'));
      await fireEvent.press(sendButton());

      expect(mockedReportCourier).toHaveBeenCalledTimes(1);
      expect(mockedReportCourier).toHaveBeenCalledWith('user-anna', {
        reason: 'spam',
        note: '',
        alsoBlock: true,
      });
      expect(mockedReportLetter).not.toHaveBeenCalled();
      expect(await screen.findByText('Thank you')).toBeOnTheScreen();
    });
  });

  describe('saying what is wrong', () => {
    /**
     * Nothing is chosen until the courier chooses it: a reason picked for them
     * would be sent as theirs.
     */
    it('offers six reasons as radio buttons in a named group, with none chosen', async () => {
      await reportingTheLetter();

      expect(screen.getByRole('header', { name: 'What is wrong?' })).toBeOnTheScreen();
      const choices = within(screen.getByLabelText('What is wrong?')).getAllByRole('radio');
      expect(choices).toHaveLength(REASONS.length);
      REASONS.forEach((label, index) => {
        expect(choices[index]).toHaveAccessibleName(label);
        expect(choices[index]).not.toBeChecked();
      });
    });

    it('takes one reason at a time, and sends the one chosen last', async () => {
      await reportingTheLetter();

      await fireEvent.press(reasonChoice('Spam or a scam'));
      expect(reasonChoice('Spam or a scam')).toBeChecked();

      await fireEvent.press(reasonChoice('Threats or violence'));
      expect(reasonChoice('Threats or violence')).toBeChecked();
      expect(reasonChoice('Spam or a scam')).not.toBeChecked();
      expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);

      await fireEvent.press(sendButton());

      expect(mockedReportLetter).toHaveBeenCalledWith(
        'letter-from-anna',
        expect.objectContaining({ reason: 'violence' }),
      );
      expect(await screen.findByText('Thank you')).toBeOnTheScreen();
    });

    it.each([
      ['a letter', reportingTheLetter],
      ['a courier', reportingTheCourier],
    ])('will not send a report about %s without a reason, and says so aloud', async (_, open) => {
      await open();

      await fireEvent.press(sendButton());

      expect(screen.getByText(NO_REASON)).toBeOnTheScreen();
      expect(announced()).toEqual([NO_REASON]);
      expect(mockedReportLetter).not.toHaveBeenCalled();
      expect(mockedReportCourier).not.toHaveBeenCalled();
      expect(sendButton()).toBeEnabled();
    });

    it('lets go of the complaint once a reason is chosen', async () => {
      await reportingTheLetter();
      await fireEvent.press(sendButton());
      expect(screen.getByText(NO_REASON)).toBeOnTheScreen();

      await fireEvent.press(reasonChoice('Hate speech'));

      expect(screen.queryByText(NO_REASON)).toBeNull();
      expect(reasonChoice('Hate speech')).toBeChecked();
    });
  });

  describe('the note', () => {
    it('says the note is optional, and how long it may be', async () => {
      await reportingTheLetter();

      expect(noteField()).toHaveDisplayValue('');
      expect(screen.getByText(NOTE_HINT)).toBeOnTheScreen();
    });

    it('will not send a note over the limit, and says why in place of the hint', async () => {
      await reportingTheLetter();
      const note = 'a'.repeat(REPORT_NOTE_MAX_LENGTH + 1);

      await fireEvent.press(reasonChoice('Something else'));
      await fireEvent.changeText(noteField(), note);
      await fireEvent.press(sendButton());

      expect(screen.getByText(NOTE_TOO_LONG)).toBeOnTheScreen();
      expect(screen.queryByText(NOTE_HINT)).toBeNull();
      expect(announced()).toContain(`Anything else we should know?: ${NOTE_TOO_LONG}`);
      expect(mockedReportLetter).not.toHaveBeenCalled();
      // Nothing is thrown away: the courier shortens what they wrote.
      expect(noteField()).toHaveDisplayValue(note);
      expect(reasonChoice('Something else')).toBeChecked();
    });

    /**
     * Postgres counts characters where JavaScript counts UTF-16 units, and the
     * two disagree on every emoji. A note the database would take must not be
     * refused here.
     */
    it('takes a note right up to the limit, counting an emoji as one character', async () => {
      await reportingTheLetter();
      const note = '🦇'.repeat(REPORT_NOTE_MAX_LENGTH);

      await fireEvent.press(reasonChoice('Something else'));
      await fireEvent.changeText(noteField(), note);
      await fireEvent.press(sendButton());

      expect(screen.queryByText(NOTE_TOO_LONG)).toBeNull();
      expect(mockedReportLetter).toHaveBeenCalledWith('letter-from-anna', {
        reason: 'other',
        note,
        alsoBlock: true,
      });
      expect(await screen.findByText('Thank you')).toBeOnTheScreen();
    });

    it('lets go of the complaint once the note is changed', async () => {
      await reportingTheLetter();
      await fireEvent.press(reasonChoice('Something else'));
      await fireEvent.changeText(noteField(), 'a'.repeat(REPORT_NOTE_MAX_LENGTH + 1));
      await fireEvent.press(sendButton());
      expect(screen.getByText(NOTE_TOO_LONG)).toBeOnTheScreen();

      await fireEvent.changeText(noteField(), 'a'.repeat(REPORT_NOTE_MAX_LENGTH));

      expect(screen.queryByText(NOTE_TOO_LONG)).toBeNull();
      expect(screen.getByText(NOTE_HINT)).toBeOnTheScreen();
    });

    it('names both problems at once when there is no reason and the note is too long', async () => {
      await reportingTheLetter();

      await fireEvent.changeText(noteField(), 'a'.repeat(REPORT_NOTE_MAX_LENGTH + 1));
      await fireEvent.press(sendButton());

      expect(screen.getByText(NO_REASON)).toBeOnTheScreen();
      expect(screen.getByText(NOTE_TOO_LONG)).toBeOnTheScreen();
      expect(mockedReportLetter).not.toHaveBeenCalled();
    });
  });

  describe('blocking as well', () => {
    /**
     * Someone reporting usually wants to hear no more from whoever they are
     * reporting, so the block goes with the report unless they say otherwise -
     * and the switch says what a block does before anything is sent.
     */
    it('blocks the courier too unless told not to, and says what that does', async () => {
      await reportingTheLetter();

      expect(blockSwitch()).toBeChecked();
      expect(screen.getByText(BLOCK_HINT)).toBeOnTheScreen();
    });

    it('can be turned off, and then reports the letter without a block', async () => {
      await reportingTheLetter();

      await setBlocking(false);
      expect(blockSwitch()).not.toBeChecked();
      await fireEvent.press(reasonChoice('Sexual content'));
      await fireEvent.press(sendButton());

      expect(mockedReportLetter).toHaveBeenCalledWith('letter-from-anna', {
        reason: 'sexual',
        note: '',
        alsoBlock: false,
      });
      expect(await screen.findByText('Thank you')).toBeOnTheScreen();
    });

    it('can be turned off when reporting a courier, too', async () => {
      await reportingTheCourier();

      await setBlocking(false);
      await fireEvent.press(reasonChoice('Hate speech'));
      await fireEvent.press(sendButton());

      expect(mockedReportCourier).toHaveBeenCalledWith('user-anna', {
        reason: 'hate',
        note: '',
        alsoBlock: false,
      });
      expect(await screen.findByText('Thank you')).toBeOnTheScreen();
    });
  });

  describe('sending', () => {
    /**
     * A second tap while the report is on its way would send it again, and the
     * server would answer the second one "already reported" - about the
     * courier's own report of a moment before.
     */
    it('shows the report is on its way, and sends it only once however often Send is pressed', async () => {
      const sending = deferred<ReportOutcome>();
      mockedReportLetter.mockReturnValue(sending.promise);
      await reportingTheLetter();
      await fireEvent.press(reasonChoice('Hate speech'));

      await fireEvent.press(sendButton());

      expect(sendButton()).toBeBusy();
      expect(sendButton()).toBeDisabled();
      expect(spinners()).toHaveLength(1);
      // The block goes as it was when Send was pressed, so the switch holds still.
      expect(blockSwitch()).toHaveProp('disabled', true);
      await fireEvent.press(sendButton());
      expect(mockedReportLetter).toHaveBeenCalledTimes(1);

      await act(async () => sending.resolve('reported'));

      expect(await screen.findByText('Thank you')).toBeOnTheScreen();
      expect(mockedReportLetter).toHaveBeenCalledTimes(1);
    });

    it('says why a report did not go, aloud as well, and keeps what was filled in', async () => {
      mockedReportLetter.mockRejectedValue(
        new RpcError(REFUSALS.too_many_reports, 'too_many_reports'),
      );
      await reportingTheLetter();
      await fireEvent.press(reasonChoice('Spam or a scam'));
      await fireEvent.changeText(noteField(), 'Asked me for my bank details.');
      await setBlocking(false);

      await fireEvent.press(sendButton());

      expect(await screen.findByText(REFUSALS.too_many_reports)).toBeOnTheScreen();
      expect(announceSpy).toHaveBeenLastCalledWith(REFUSALS.too_many_reports);
      expect(reasonChoice('Spam or a scam')).toBeChecked();
      expect(noteField()).toHaveDisplayValue('Asked me for my bank details.');
      expect(blockSwitch()).not.toBeChecked();
      expect(blockSwitch()).toHaveProp('disabled', false);
      expect(sendButton()).toBeEnabled();
      expect(sendButton()).not.toBeBusy();
      expect(screen.queryByText('Thank you')).toBeNull();
      expect(mockDismiss).not.toHaveBeenCalled();
    });

    it('sends the same report again when asked, without leaving the old error up', async () => {
      const offline = 'No connection. Check your network and try again.';
      const retrying = deferred<ReportOutcome>();
      mockedReportCourier
        .mockRejectedValueOnce(new RpcError(offline, null))
        .mockReturnValueOnce(retrying.promise);
      await reportingTheCourier();
      await fireEvent.press(reasonChoice('Harassment or bullying'));
      await fireEvent.changeText(noteField(), 'Keeps asking after I declined.');
      await fireEvent.press(sendButton());
      expect(await screen.findByText(offline)).toBeOnTheScreen();

      await fireEvent.press(sendButton());

      expect(screen.queryByText(offline)).toBeNull();
      await act(async () => retrying.resolve('reported'));
      expect(await screen.findByText('Thank you')).toBeOnTheScreen();
      expect(mockedReportCourier).toHaveBeenCalledTimes(2);
      expect(mockedReportCourier).toHaveBeenLastCalledWith('user-anna', {
        reason: 'harassment',
        note: 'Keeps asking after I declined.',
        alsoBlock: true,
      });
    });
  });

  describe('once sent', () => {
    /**
     * A courier who had reported before is told so, and that the earlier
     * report still holds. A block asked for this time is made all the same -
     * the database blocks whether or not the report is new - and the screen
     * says so.
     */
    it.each<[string, () => Promise<void>, ReportOutcome, boolean, string, string[]]>([
      [
        'a letter, and its sender blocked',
        reportingTheLetter,
        'reported',
        true,
        'Thank you',
        [REPORTED, BLOCKED],
      ],
      ['a letter', reportingTheLetter, 'reported', false, 'Thank you', [REPORTED]],
      [
        'a letter reported before, and its sender blocked',
        reportingTheLetter,
        'already_reported',
        true,
        'Already reported',
        [LETTER_REPORTED_BEFORE, BLOCKED],
      ],
      [
        'a letter reported before',
        reportingTheLetter,
        'already_reported',
        false,
        'Already reported',
        [LETTER_REPORTED_BEFORE],
      ],
      [
        'a courier, blocked too',
        reportingTheCourier,
        'reported',
        true,
        'Thank you',
        [REPORTED, BLOCKED],
      ],
      ['a courier', reportingTheCourier, 'reported', false, 'Thank you', [REPORTED]],
      [
        'a courier reported before, blocked too',
        reportingTheCourier,
        'already_reported',
        true,
        'Already reported',
        [COURIER_REPORTED_BEFORE, BLOCKED],
      ],
      [
        'a courier reported before',
        reportingTheCourier,
        'already_reported',
        false,
        'Already reported',
        [COURIER_REPORTED_BEFORE],
      ],
    ])(
      'says what became of the report of %s, on screen and aloud',
      async (_, open, outcome, block, title, lines) => {
        mockedReportLetter.mockResolvedValue(outcome);
        mockedReportCourier.mockResolvedValue(outcome);
        await open();
        await fireEvent.press(reasonChoice('Spam or a scam'));
        // Left on, or turned off.
        await setBlocking(block);

        await fireEvent.press(sendButton());

        expect(await screen.findByText(title)).toBeOnTheScreen();
        for (const line of lines) {
          expect(screen.getByText(line)).toBeOnTheScreen();
        }
        expect(screen.queryAllByText(/ is blocked: /)).toHaveLength(block ? 1 : 0);
        expect(announceSpy).toHaveBeenLastCalledWith(lines.join(' '));
        // The form has gone, and the screen waits for the courier to be done with it.
        expect(screen.queryByRole('button', { name: 'Send report' })).toBeNull();
        expect(screen.queryAllByRole('radio')).toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
        expect(mockDismiss).not.toHaveBeenCalled();
      },
    );

    /**
     * A block ends the friendship and hides the courier's letters, this one
     * too, so the letter or the courier's page the report was made from has
     * nothing left to show. Done goes back past it as well.
     */
    it.each<[string, () => Promise<void>, ReportOutcome]>([
      ['a letter', reportingTheLetter, 'reported'],
      ['a letter again', reportingTheLetter, 'already_reported'],
      ['a courier', reportingTheCourier, 'reported'],
      ['a courier again', reportingTheCourier, 'already_reported'],
    ])(
      'after reporting %s and blocking, Done goes back past the page the report came from',
      async (_, open, outcome) => {
        mockedReportLetter.mockResolvedValue(outcome);
        mockedReportCourier.mockResolvedValue(outcome);
        await open();
        await fireEvent.press(reasonChoice('Threats or violence'));
        await fireEvent.press(sendButton());

        await fireEvent.press(await screen.findByRole('button', { name: 'Done' }));

        expect(mockDismiss).toHaveBeenCalledTimes(1);
        expect(mockDismiss).toHaveBeenCalledWith(2);
      },
    );

    it.each<[string, () => Promise<void>, ReportOutcome]>([
      ['a letter', reportingTheLetter, 'reported'],
      ['a letter again', reportingTheLetter, 'already_reported'],
      ['a courier', reportingTheCourier, 'reported'],
      ['a courier again', reportingTheCourier, 'already_reported'],
    ])(
      'after reporting %s without blocking, Done goes back to the page the report came from',
      async (_, open, outcome) => {
        mockedReportLetter.mockResolvedValue(outcome);
        mockedReportCourier.mockResolvedValue(outcome);
        await open();
        await fireEvent.press(reasonChoice('Threats or violence'));
        await setBlocking(false);
        await fireEvent.press(sendButton());

        await fireEvent.press(await screen.findByRole('button', { name: 'Done' }));

        expect(mockDismiss).toHaveBeenCalledTimes(1);
        expect(mockDismiss).toHaveBeenCalledWith(1);
      },
    );
  });
});
