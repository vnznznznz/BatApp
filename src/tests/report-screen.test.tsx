import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { AccessibilityInfo, BackHandler, Platform, type ViewProps } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import ReportScreen from '@/app/(app)/report';
import { REPORT_NOTE_MAX_LENGTH, REPORT_RETENTION_DAYS } from '@/constants/config';
import { reportCourier, reportLetter, type ReportOutcome } from '@/features/safety/safety';
import { announce } from '@/lib/announce';
import { RpcError } from '@/lib/rpc-error';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work that would otherwise
// count against whichever test runs first.
jest.setTimeout(20_000);

/**
 * The router: one object for every render, as expo-router's own useRouter()
 * returns. Done and Android's back button ask it whether there is a screen to
 * dismiss to before they dismiss one.
 */
const mockRouter = {
  canDismiss: jest.fn(() => true),
  dismiss: jest.fn(),
  dismissTo: jest.fn(),
  replace: jest.fn(),
};

/** The route's search params, as the screen reads them. */
const mockParams: { courier?: string; username?: string; letter?: string; blocked?: string } = {};

/** What the confirmation sets on its header through <Stack.Screen>. */
type HeaderOptions = {
  headerBackVisible?: boolean;
  headerLeft?: () => ReactNode;
  gestureEnabled?: boolean;
};

/**
 * Every set of options the screen has given its header, in order. Recorded
 * rather than applied: there is no navigator here to apply them to.
 */
const mockHeaderOptions = jest.fn<void, [HeaderOptions]>();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
    Stack: {
      Screen: ({ options }: { options: HeaderOptions }) => {
        mockHeaderOptions(options);
        return null;
      },
    },
  };
});

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

// A phone hears what the screen says through VoiceOver or TalkBack, and the web
// build through a live region on the page - which this environment does not
// have. So what the screen hands announce() is recorded, the same way on every
// platform, and announce() still runs; its own tests cover the rest.
jest.mock('@/lib/announce', () => {
  const actual = jest.requireActual<typeof import('@/lib/announce')>('@/lib/announce');
  return { announce: jest.fn(actual.announce) };
});

const mockedReportLetter = jest.mocked(reportLetter);
const mockedReportCourier = jest.mocked(reportCourier);
const mockedAnnounce = jest.mocked(announce);

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

const ABOUT_A_LETTER =
  'Your report goes to the person who runs Night Courier, with a copy of the letter. @anna is ' +
  'not told who reported them, unless the law requires it - but this letter had only one ' +
  'reader, so if it is acted on, they may guess.';
const ABOUT_A_COURIER =
  "Your report goes to the person who runs Night Courier, with @anna's names as they are now. " +
  '@anna is not told who reported them, unless the law requires it.';
const KEEP_A_COPY =
  'If their account is removed, every letter between you goes with it. Keep a copy of anything ' +
  'you may need first - a screenshot will do.';

/** What reportLetter and reportCourier say of a failure they do not recognise. */
const NOT_SENT = 'The report could not be sent. Check your connection.';

const REPORTED = 'Your report is with the person who runs Night Courier.';
const LETTER_REPORTED_BEFORE =
  'You have already reported this letter, and that report is still open.';
const COURIER_REPORTED_BEFORE = 'You have already reported @anna, and that report is still open.';
const OVER_THE_LIMIT =
  'You have sent a lot of reports today, so this one was not recorded. Try again tomorrow.';
const OVER_THE_LIMIT_BLOCKED =
  'You have sent a lot of reports today, so this one was not recorded. Report @anna again ' +
  'tomorrow, from your blocked couriers in your profile.';
const BLOCKED =
  '@anna is blocked: they cannot write to you or ask to be friends, and their letters are ' +
  'hidden. You can unblock them in your profile.';

const NOTHING_TO_REPORT = 'There is nothing to report from here.';

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

/**
 * Opens it as "Report" beside Anna in Blocked couriers does: about her, blocked
 * already. Her letters and her page are out of reach once she is blocked, so
 * this is the one place left to report her from.
 */
async function reportingFromTheBlockedList() {
  Object.assign(mockParams, { courier: 'user-anna', username: 'anna', blocked: '1' });
  await renderScreen(<ReportScreen />);
}

const reasonChoice = (label: string) => screen.getByRole('radio', { name: label });
const noteField = () => screen.getByLabelText('Anything else we should know?');
const blockSwitch = () => screen.getByRole('switch', { name: 'Also block @anna' });
const sendButton = () => screen.getByRole('button', { name: 'Send report' });
const doneButton = () => screen.getByRole('button', { name: 'Done' });

/** Flips "Also block" as a tap on the switch does. */
const setBlocking = (on: boolean) => fireEvent(blockSwitch(), 'valueChange', on);

/**
 * Sends a report with no more than the form requires - a reason - with "Also
 * block" turned to `block`, or left as it is when that is not given; then waits
 * for the screen to say what became of it.
 */
async function sendReport(block?: boolean) {
  await fireEvent.press(reasonChoice('Threats or violence'));
  if (block !== undefined) await setBlocking(block);
  await fireEvent.press(sendButton());
  await screen.findByRole('button', { name: 'Done' });
}

const spinners = () => screen.container.queryAll((node) => node.type === 'ActivityIndicator');

/**
 * Everything said aloud so far, in order: to VoiceOver or TalkBack on a phone,
 * into a live region on the web.
 */
const announced = () => mockedAnnounce.mock.calls.map(([message]) => message);

let focusSpy: jest.SpiedFunction<typeof AccessibilityInfo.sendAccessibilityEvent>;

/**
 * Where the screen has sent a screen reader so far, in order: the event, and
 * the role and name of the view it went to. React Native's mock View is a class
 * component, so the view the screen holds a ref to - and sends the event to - is
 * its instance, props and all.
 */
function focusedOn() {
  return focusSpy.mock.calls.map(([view, event]) => {
    const { accessibilityRole, accessibilityLabel } = (view as unknown as { props: ViewProps })
      .props;
    return { event, role: accessibilityRole, name: accessibilityLabel };
  });
}

/** The options the confirmation gave its header most recently. */
function headerOptions(): HeaderOptions {
  const options = mockHeaderOptions.mock.lastCall?.[0];
  if (!options) throw new Error('The screen has not set its header.');
  return options;
}

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];

/** The screen's listeners for Android's back button, added and not yet removed, oldest first. */
let backListeners: BackListener[] = [];
let backSpy: jest.SpiedFunction<typeof BackHandler.addEventListener>;

/**
 * Presses Android's back button. As on a phone, the listeners still in place
 * are asked newest first until one answers true, having handled the press; if
 * none does, the navigator goes back a screen as it always would. Resolves to
 * whether one did.
 */
const pressBackOnAndroid = () =>
  act(() =>
    [...backListeners]
      .reverse()
      .some((listener) => listener({ type: 'hardwareBackPress', timeStamp: 0 }) === true),
  );

/** The platform the tests run as unless one says otherwise: jest-expo's, iOS. */
const DEFAULT_OS = Platform.OS;

/** Runs the rest of the test as the build for `os` would. */
function onPlatform(os: typeof Platform.OS) {
  Platform.OS = os;
}

beforeEach(() => {
  mockRouter.canDismiss.mockReset().mockReturnValue(true);
  mockRouter.dismiss.mockClear();
  mockRouter.dismissTo.mockClear();
  mockRouter.replace.mockClear();
  mockHeaderOptions.mockClear();
  mockedAnnounce.mockClear();
  delete mockParams.letter;
  delete mockParams.courier;
  delete mockParams.username;
  delete mockParams.blocked;
  mockedReportLetter.mockReset().mockResolvedValue('reported');
  mockedReportCourier.mockReset().mockResolvedValue('reported');
  focusSpy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  backListeners = [];
  backSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, listener) => {
    backListeners.push(listener);
    return {
      remove: () => {
        backListeners = backListeners.filter((other) => other !== listener);
      },
    };
  });
});

afterEach(() => {
  focusSpy.mockRestore();
  backSpy.mockRestore();
  Platform.OS = DEFAULT_OS;
});

/**
 * Runs `taps` inside one act(), so that nothing renders between them: two taps
 * in the same frame. React warns that the act() scopes overlap, which is the
 * very thing being simulated, so that one warning is kept out of the output.
 */
async function inOneFrame(taps: () => Promise<void>) {
  const realError = console.error;
  const quiet = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('overlapping act()')) return;
    realError(...args);
  });
  try {
    await act(taps);
  } finally {
    quiet.mockRestore();
  }
}

describe('ReportScreen', () => {
  describe('reporting a letter', () => {
    /**
     * Whoever is reported is not told who reported them, unless the law
     * requires it - but a letter has one reader, so a report that is acted on
     * points to them all the same. The screen says so, rather than promise
     * more than holds.
     */
    it('says it is a letter from the sender, that a copy of it goes with the report, and that the sender may guess who reported it', async () => {
      await reportingTheLetter();

      expect(screen.getByText('Report')).toBeOnTheScreen();
      expect(screen.getByText('A letter from @anna')).toBeOnTheScreen();
      expect(screen.getByText(ABOUT_A_LETTER)).toBeOnTheScreen();
    });

    /**
     * The copy outlives the letter, and both accounts. The courier is told for
     * how long, in the number the database deletes by: parity.db.test.mjs holds
     * the two together. The database deletes every report then, with no
     * exception; only a copy given to the police outlives it, and is theirs.
     */
    it('says how long the report and the copy of the letter are kept, and that the police keep their own copy', async () => {
      await reportingTheLetter();

      expect(
        screen.getByText(
          `Reports, and the copy of the letter, are deleted ${REPORT_RETENTION_DAYS} days after ` +
            'they were made. If one is passed to the police, the police keep their own copy.',
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
    /**
     * A courier's names are theirs to change at any time, to anything. The
     * report keeps them as they were when it was made, so that it can still
     * be judged once they have changed - and the screen says which go with it.
     */
    it('names the courier, says their names go with the report as they are now, and that they are not told who reported them unless the law requires it', async () => {
      await reportingTheCourier();

      expect(screen.getByText('Report')).toBeOnTheScreen();
      expect(screen.getByText('@anna')).toBeOnTheScreen();
      expect(screen.getByText(ABOUT_A_COURIER)).toBeOnTheScreen();
      expect(screen.queryByText(/A letter from|copy of the letter/)).toBeNull();
    });

    it('says how long the report is kept, and that the police keep their own copy', async () => {
      await reportingTheCourier();

      expect(
        screen.getByText(
          `Reports are deleted ${REPORT_RETENTION_DAYS} days after they were made. If one is ` +
            'passed to the police, the police keep their own copy.',
        ),
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

  describe('reporting someone blocked already', () => {
    /**
     * There is no block left to ask for: the switch is not offered, and the
     * report asks for none.
     */
    it('does not offer to block them, and reports them without a block', async () => {
      await reportingFromTheBlockedList();

      expect(screen.getByText('@anna')).toBeOnTheScreen();
      expect(screen.getByText(ABOUT_A_COURIER)).toBeOnTheScreen();
      expect(screen.queryByRole('switch')).toBeNull();
      expect(screen.queryByText(/Also block/)).toBeNull();
      expect(screen.queryByText(BLOCK_HINT)).toBeNull();

      await fireEvent.press(reasonChoice('Harassment or bullying'));
      await fireEvent.press(sendButton());

      expect(mockedReportCourier).toHaveBeenCalledTimes(1);
      expect(mockedReportCourier).toHaveBeenCalledWith('user-anna', {
        reason: 'harassment',
        note: '',
        alsoBlock: false,
      });
      expect(mockedReportLetter).not.toHaveBeenCalled();
      expect(await screen.findByText('Thank you')).toBeOnTheScreen();
    });

    /**
     * The block is older than the report, so the confirmation says nothing of
     * one. Over the day's limit, it sends the courier back to where they
     * reported from - the one place left to report again.
     */
    it.each<[string, ReportOutcome, string, string]>([
      ['went through', 'reported', 'Thank you', REPORTED],
      [
        'found an earlier one still open',
        'already_reported',
        'Already reported',
        COURIER_REPORTED_BEFORE,
      ],
      ["was over the day's limit", 'limit_reached', 'Not recorded', OVER_THE_LIMIT_BLOCKED],
    ])(
      'says what became of a report that %s, and nothing of a block it did not make',
      async (_, outcome, title, line) => {
        mockedReportCourier.mockResolvedValue(outcome);
        await reportingFromTheBlockedList();

        await sendReport();

        expect(screen.getByText(title)).toBeOnTheScreen();
        expect(screen.getByText(line)).toBeOnTheScreen();
        expect(screen.queryAllByText(/ is blocked: /)).toHaveLength(0);
        expect(screen.getByRole('header', { name: `${title} ${line}` })).toBeOnTheScreen();
      },
    );

    /**
     * Nothing the blocked list showed is gone, so every way back leads to it,
     * as from any report that made no block.
     */
    it('goes back to the blocked list when done, and leaves every other way back to it', async () => {
      await reportingFromTheBlockedList();
      await sendReport();

      const header = headerOptions();
      expect(header.headerBackVisible).toBe(true);
      expect(header.gestureEnabled).toBe(true);
      expect(header.headerLeft).toBeUndefined();
      expect(await pressBackOnAndroid()).toBe(false);

      await fireEvent.press(doneButton());

      expect(mockRouter.dismiss).toHaveBeenCalledTimes(1);
      expect(mockRouter.dismiss).toHaveBeenCalledWith(1);
    });
  });

  describe('keeping a copy', () => {
    /**
     * A report can end with an account removed, and every letter that account
     * sent or received goes with it - the reporter's own copies too. Whatever
     * they may need later, for the police say, is theirs to keep first.
     */
    it.each([
      ['a letter', reportingTheLetter],
      ['a courier', reportingTheCourier],
      ['someone blocked already', reportingFromTheBlockedList],
    ])('says to keep a copy of anything needed, when reporting %s', async (_, open) => {
      await open();

      expect(screen.getByText(KEEP_A_COPY)).toBeOnTheScreen();
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

    /**
     * Two taps in the same moment both land before the button has re-rendered
     * as busy, so its being disabled cannot stop the second: the screen has to.
     */
    it('sends it once for two taps in the same moment, before the button can turn busy', async () => {
      const sending = deferred<ReportOutcome>();
      mockedReportLetter.mockReturnValue(sending.promise);
      await reportingTheLetter();
      await fireEvent.press(reasonChoice('Hate speech'));

      // Nothing renders until the outer act() is over, so the second tap finds
      // the button just as the first one left it.
      await inOneFrame(async () => {
        await fireEvent.press(sendButton());
        expect(sendButton()).not.toBeBusy();
        await fireEvent.press(sendButton());
      });

      expect(mockedReportLetter).toHaveBeenCalledTimes(1);
      expect(sendButton()).toBeBusy();
      await act(async () => sending.resolve('reported'));
      expect(await screen.findByText('Thank you')).toBeOnTheScreen();
      expect(mockedReportLetter).toHaveBeenCalledTimes(1);
    });

    it('says why a report did not go, aloud as well, and keeps what was filled in', async () => {
      mockedReportLetter.mockRejectedValue(new RpcError(NOT_SENT, null));
      await reportingTheLetter();
      await fireEvent.press(reasonChoice('Spam or a scam'));
      await fireEvent.changeText(noteField(), 'Asked me for my bank details.');
      await setBlocking(false);

      await fireEvent.press(sendButton());

      expect(await screen.findByText(NOT_SENT)).toBeOnTheScreen();
      expect(announced()).toEqual([NOT_SENT]);
      expect(reasonChoice('Spam or a scam')).toBeChecked();
      expect(noteField()).toHaveDisplayValue('Asked me for my bank details.');
      expect(blockSwitch()).not.toBeChecked();
      expect(blockSwitch()).toHaveProp('disabled', false);
      expect(sendButton()).toBeEnabled();
      expect(sendButton()).not.toBeBusy();
      expect(screen.queryByText('Thank you')).toBeNull();
      expect(mockRouter.dismiss).not.toHaveBeenCalled();
    });

    /**
     * A report that went through is not announced: a screen reader is taken
     * to its confirmation instead. One that did not go leaves the form where it
     * was, with focus still on Send, so why is said aloud - on the web as on a
     * phone.
     */
    it.each<typeof Platform.OS>(['ios', 'android', 'web'])(
      'says aloud on %s why a report did not go',
      async (os) => {
        onPlatform(os);
        mockedReportCourier.mockRejectedValue(new RpcError(NOT_SENT, null));
        await reportingTheCourier();
        await fireEvent.press(reasonChoice('Spam or a scam'));

        await fireEvent.press(sendButton());

        expect(await screen.findByText(NOT_SENT)).toBeOnTheScreen();
        expect(announced()).toEqual([NOT_SENT]);
        expect(focusedOn()).toEqual([]);
      },
    );

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
     * report still holds. One over the day's limit is told this one was not
     * recorded, and when to make it again - and, once a block has put the
     * letter and the courier's page out of reach, where from. A block asked
     * for is made whatever became of the report - the database blocks all the
     * same - and the screen says so. The heading reads all of it out, and is
     * where a screen reader is taken.
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
        "a letter over the day's limit, and its sender blocked",
        reportingTheLetter,
        'limit_reached',
        true,
        'Not recorded',
        [OVER_THE_LIMIT_BLOCKED, BLOCKED],
      ],
      [
        "a letter over the day's limit",
        reportingTheLetter,
        'limit_reached',
        false,
        'Not recorded',
        [OVER_THE_LIMIT],
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
      [
        "a courier over the day's limit, blocked too",
        reportingTheCourier,
        'limit_reached',
        true,
        'Not recorded',
        [OVER_THE_LIMIT_BLOCKED, BLOCKED],
      ],
      [
        "a courier over the day's limit",
        reportingTheCourier,
        'limit_reached',
        false,
        'Not recorded',
        [OVER_THE_LIMIT],
      ],
    ])(
      'says what became of the report of %s, and takes a screen reader to it',
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
        const heading = [title, ...lines].join(' ');
        expect(screen.getByRole('header', { name: heading })).toBeOnTheScreen();
        expect(focusedOn()).toEqual([{ event: 'focus', role: 'header', name: heading }]);
        expect(announced()).toEqual([]);
        // The form has gone, and the screen waits for the courier to be done with it.
        expect(screen.queryByRole('button', { name: 'Send report' })).toBeNull();
        expect(screen.queryAllByRole('radio')).toHaveLength(0);
        expect(doneButton()).toBeEnabled();
        expect(mockRouter.dismiss).not.toHaveBeenCalled();
        expect(mockRouter.replace).not.toHaveBeenCalled();
      },
    );

    /**
     * A block ends the friendship and hides the courier's letters, this one
     * too - whatever became of the report - so the letter or the courier's
     * page the report was made from has nothing left to show. Done goes back
     * past it as well.
     */
    /**
     * Two taps before the screen has gone would dismiss twice: four screens
     * back instead of two, past the letters list. (Found in review.)
     */
    it('leaves once, however often Done is tapped before the screen has gone', async () => {
      await reportingTheLetter();
      await fireEvent.press(reasonChoice('Threats or violence'));
      await fireEvent.press(sendButton());
      const done = await screen.findByRole('button', { name: 'Done' });

      // Nothing here re-renders or leaves between the taps - the router is a
      // stand-in - so two taps in turn are two taps before the screen has gone.
      await fireEvent.press(done);
      await fireEvent.press(done);

      expect(mockRouter.dismiss).toHaveBeenCalledTimes(1);
      expect(mockRouter.dismiss).toHaveBeenCalledWith(2);
    });

    it.each<[string, () => Promise<void>, ReportOutcome]>([
      ['a letter', reportingTheLetter, 'reported'],
      ['a letter again', reportingTheLetter, 'already_reported'],
      ["a letter over the day's limit", reportingTheLetter, 'limit_reached'],
      ['a courier', reportingTheCourier, 'reported'],
      ['a courier again', reportingTheCourier, 'already_reported'],
      ["a courier over the day's limit", reportingTheCourier, 'limit_reached'],
    ])(
      'after reporting %s and blocking, Done goes back past the page the report came from',
      async (_, open, outcome) => {
        mockedReportLetter.mockResolvedValue(outcome);
        mockedReportCourier.mockResolvedValue(outcome);
        await open();
        await fireEvent.press(reasonChoice('Threats or violence'));
        await fireEvent.press(sendButton());

        await fireEvent.press(await screen.findByRole('button', { name: 'Done' }));

        expect(mockRouter.dismiss).toHaveBeenCalledTimes(1);
        expect(mockRouter.dismiss).toHaveBeenCalledWith(2);
        expect(mockRouter.replace).not.toHaveBeenCalled();
      },
    );

    it.each<[string, () => Promise<void>, ReportOutcome]>([
      ['a letter', reportingTheLetter, 'reported'],
      ['a letter again', reportingTheLetter, 'already_reported'],
      ["a letter over the day's limit", reportingTheLetter, 'limit_reached'],
      ['a courier', reportingTheCourier, 'reported'],
      ['a courier again', reportingTheCourier, 'already_reported'],
      ["a courier over the day's limit", reportingTheCourier, 'limit_reached'],
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

        expect(mockRouter.dismiss).toHaveBeenCalledTimes(1);
        expect(mockRouter.dismiss).toHaveBeenCalledWith(1);
        expect(mockRouter.replace).not.toHaveBeenCalled();
      },
    );

    /**
     * Opened straight from a link, the report can be the only screen in its
     * stack, with nothing beneath it to go back to. Done goes to the roost
     * instead, whether or not the report made a block.
     */
    it.each([
      ['that made a block', true],
      ['that made none', false],
    ])(
      'with no screen to go back to, Done goes to the roost after a report %s',
      async (_, block) => {
        mockRouter.canDismiss.mockReturnValue(false);
        await reportingTheLetter();
        await sendReport(block);

        await fireEvent.press(doneButton());

        expect(mockRouter.replace).toHaveBeenCalledTimes(1);
        expect(mockRouter.replace).toHaveBeenCalledWith('/home');
        expect(mockRouter.dismiss).not.toHaveBeenCalled();
      },
    );
  });

  describe('going back', () => {
    /**
     * The header's back button and the iOS swipe would go back to the page the
     * report came from, which a block has just emptied - going back there once
     * showed the letter that had just been hidden. Both are taken away, and
     * Done is the way back. headerBackVisible does it on iOS and Android; the
     * web build's stack ignores that and draws a back button wherever
     * headerLeft is unset, so headerLeft is set to draw nothing. Until the
     * report is sent, the header is left as the layout made it.
     */
    it.each([
      ['a letter', reportingTheLetter],
      ['a courier', reportingTheCourier],
    ])(
      "takes the header's back button and the swipe away once reporting %s has made a block",
      async (_, open) => {
        await open();
        expect(mockHeaderOptions).not.toHaveBeenCalled();

        await sendReport(true);

        const header = headerOptions();
        expect(header.headerBackVisible).toBe(false);
        expect(header.gestureEnabled).toBe(false);
        expect(header.headerLeft).toEqual(expect.any(Function));
        expect(header.headerLeft?.()).toBeNull();
      },
    );

    it.each([
      ['a letter', reportingTheLetter],
      ['a courier', reportingTheCourier],
    ])(
      "leaves the header's back button and the swipe once reporting %s has made no block",
      async (_, open) => {
        await open();

        await sendReport(false);

        const header = headerOptions();
        expect(header.headerBackVisible).toBe(true);
        expect(header.gestureEnabled).toBe(true);
        expect(header.headerLeft).toBeUndefined();
      },
    );

    /**
     * Android's back button would go back to that page too, header or no
     * header. Once a report has made a block it does what Done does instead,
     * and says it has handled the press, so the navigator does not go back as
     * well.
     */
    it("after a report that made a block, Android's back button goes back past the page it came from", async () => {
      await reportingTheLetter();
      await sendReport(true);

      expect(await pressBackOnAndroid()).toBe(true);

      expect(mockRouter.dismiss).toHaveBeenCalledTimes(1);
      expect(mockRouter.dismiss).toHaveBeenCalledWith(2);
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it("with no screen to go back to, Android's back button goes to the roost, as Done does", async () => {
      mockRouter.canDismiss.mockReturnValue(false);
      await reportingTheCourier();
      await sendReport(true);

      expect(await pressBackOnAndroid()).toBe(true);

      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith('/home');
      expect(mockRouter.dismiss).not.toHaveBeenCalled();
    });

    /**
     * Without a block, the page the report came from still has all it showed,
     * and going back to it is what the button is for.
     */
    it("leaves Android's back button to go back as it always does after a report that made no block", async () => {
      await reportingTheLetter();
      await sendReport(false);

      expect(await pressBackOnAndroid()).toBe(false);

      expect(mockRouter.dismiss).not.toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    /**
     * Until the report is sent there is nothing to go past, so the form leaves
     * the button alone. And once the confirmation is gone the button is let
     * go of - or it would go on dismissing screens from wherever the courier
     * went next.
     */
    it("holds on to Android's back button only while the confirmation of a block is up", async () => {
      await reportingTheLetter();
      await fireEvent.press(reasonChoice('Threats or violence'));
      expect(backListeners).toHaveLength(0);

      await fireEvent.press(sendButton());
      await screen.findByRole('button', { name: 'Done' });
      expect(backSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
      expect(backListeners).toHaveLength(1);

      await screen.unmount();

      expect(backListeners).toHaveLength(0);
    });
  });

  describe('telling a screen reader', () => {
    /**
     * Send, where the screen reader was, is gone once the confirmation
     * replaces the form. On a phone the screen reader is taken to the
     * heading, which reads out all of what happened; announcing it as well
     * would have it said twice, or cut off halfway.
     */
    it.each<typeof Platform.OS>(['ios', 'android'])(
      'on %s, takes a screen reader to what became of the report, and announces nothing over it',
      async (os) => {
        onPlatform(os);
        await reportingTheLetter();

        await sendReport();

        const heading = ['Thank you', REPORTED, BLOCKED].join(' ');
        expect(screen.getByRole('header', { name: heading })).toBeOnTheScreen();
        expect(focusedOn()).toEqual([{ event: 'focus', role: 'header', name: heading }]);
        expect(announced()).toEqual([]);
      },
    );

    /** The web build has no way to move a screen reader, so there it hears what happened instead. */
    it('on the web, says aloud what became of the report instead', async () => {
      onPlatform('web');
      await reportingTheLetter();

      await sendReport();

      expect(screen.getByText('Thank you')).toBeOnTheScreen();
      expect(focusedOn()).toEqual([]);
      // The same words, title first, as the heading reads out on a phone.
      expect(announced()).toEqual([`Thank you ${REPORTED} ${BLOCKED}`]);
    });
  });

  describe('opened without someone to report', () => {
    /**
     * A route can be opened from a link without the params its buttons give
     * it - an address typed by hand, a link cut short. With no one to report
     * there is no report to make, and the screen says so rather than offer a
     * form that would report "@undefined".
     */
    it.each<[string, typeof mockParams]>([
      ['nothing at all', {}],
      ['no courier', { username: 'anna' }],
      ['no username', { courier: 'user-anna' }],
      ['only a letter', { letter: 'letter-from-anna' }],
    ])(
      'says there is nothing to report, and sends nothing, when opened with %s',
      async (_, params) => {
        Object.assign(mockParams, params);
        await renderScreen(<ReportScreen />);

        expect(screen.getByText(NOTHING_TO_REPORT)).toBeOnTheScreen();
        expect(screen.getByRole('button', { name: 'Back to the roost' })).toBeEnabled();
        expect(screen.queryByText('Report')).toBeNull();
        expect(screen.queryByText(/@undefined/)).toBeNull();
        expect(screen.queryAllByRole('radio')).toHaveLength(0);
        expect(screen.queryByRole('button', { name: 'Send report' })).toBeNull();
        expect(mockedReportLetter).not.toHaveBeenCalled();
        expect(mockedReportCourier).not.toHaveBeenCalled();
      },
    );

    it('goes back to the roost from there', async () => {
      await renderScreen(<ReportScreen />);

      await fireEvent.press(screen.getByRole('button', { name: 'Back to the roost' }));

      expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
      expect(mockRouter.dismissTo).toHaveBeenCalledWith('/home');
      expect(mockRouter.dismiss).not.toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });
});
