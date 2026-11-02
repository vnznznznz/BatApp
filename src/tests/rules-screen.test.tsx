import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import RulesScreen from '@/app/rules';
import { REPORT_RETENTION_DAYS } from '@/constants/config';
import { Colors } from '@/constants/theme';
import { openLink } from '@/lib/links';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work that would otherwise
// count against whichever test runs first.
jest.setTimeout(20_000);

const mockBack = jest.fn();
const mockReplace = jest.fn();
/** Whether there is a screen behind this one to go back to. */
const mockCanGoBack = jest.fn<boolean, []>();
/** Every set of options the screen has given its header, in the order it gave them. */
const mockHeaderOptions: Record<string, unknown>[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  // There is no navigator here. A screen sets its own header by rendering
  // Stack.Screen with options, so the stand-in keeps the options it is given.
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockHeaderOptions.push(options);
      return null;
    },
  },
}));

/** The two links, as this build is configured. Unset in the environment, each is null. */
const mockLinks: { contact: string | null; privacyPolicy: string | null } = {
  contact: null,
  privacyPolicy: null,
};

// Both links are configuration, read from the build's environment, and the
// screen leaves out whichever is unset. Getters, so the screen reads them as it
// renders and each test can configure them as a build would; opening one is the
// device's business. No spread of the real module: Babel turns a spread beside
// a getter into a copy, and the copy would read the getter once, too early.
jest.mock('@/lib/links', () => ({
  get CONTACT_URL() {
    return mockLinks.contact;
  },
  get PRIVACY_POLICY_URL() {
    return mockLinks.privacyPolicy;
  },
  openLink: jest.fn(),
}));

const mockedOpenLink = jest.mocked(openLink);

const CONTACT = 'mailto:night-courier@example.com';
const PRIVACY_POLICY = 'https://example.com/night-courier/privacy';

const TERMS =
  'These are the terms of using Night Courier. Everyone here agrees to them when they create an ' +
  'account.';
const FRIENDS_ONLY =
  'Night Courier is for letters between friends. Nobody can write to you until you accept their ' +
  'friend request, and there is no search and no public profile.';
const NEVER_SEND = [
  'Harassment, bullying, or anything meant to frighten or shame someone.',
  'Threats, or encouragement to violence or self-harm.',
  'Hate: attacks on people for who they are.',
  'Sexual content of any kind involving anyone under 18, or sent to anyone under 18.',
  'Sexual messages to anyone who has not asked for them.',
  'Spam, scams, or pretending to be someone else.',
];
const NO_TOLERANCE =
  'There is no tolerance for objectionable content or abusive behaviour. An account that breaks ' +
  'these rules may be removed, along with every letter it sent or received - at once, if it is ' +
  'serious.';
const REPORTING =
  'Report the letter - open it, and choose Report - or report the courier from their page in ' +
  'Friends, or from your blocked couriers. Reports go to the person who runs Night Courier, who ' +
  'reads every one and acts on what breaks the rules. The person you report is never told who ' +
  'reported them, unless the law requires it - but a letter has only one reader, so if one is ' +
  'acted on, its sender may guess.';
const BLOCKING =
  'You can also block a courier, from a letter of theirs or from their page in Friends. Your ' +
  'friendship ends, they cannot write to you or ask to be friends, and their letters are hidden ' +
  'from you until you unblock them. They are not told, though they will see that you are no ' +
  'longer friends. Letters you sent them stay with them.';
const RETENTION =
  `A report, and the copy it keeps of what was reported, is deleted ${REPORT_RETENTION_DAYS} ` +
  'days after it was made - unless it has been passed to the police. If an account is removed, ' +
  'every letter between it and anyone else goes with it, so keep a copy of anything you may ' +
  'need: a screenshot will do.';
const GET_IN_TOUCH =
  'For a question, something to add to a report, or a request about your data, get in touch.';

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

type Element = ReturnType<typeof screen.getByText>;

/** A section of the rules: what its heading heads, the heading included. */
function sectionOf(heading: string): Element {
  const section = screen.getByRole('header', { name: heading }).parent;
  if (!section) throw new Error(`"${heading}" heads no section.`);
  return section;
}

/** Each piece of text in a part of the screen, in the order a screen reader reads them. */
const textsIn = (part: Element) =>
  within(part)
    .getAllByText(/./)
    .map((text) => text.props.children);

const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack.mockReset().mockReturnValue(true);
  mockHeaderOptions.length = 0;
  mockLinks.contact = null;
  mockLinks.privacyPolicy = null;
  mockedOpenLink.mockReset().mockResolvedValue(undefined);
});

describe('RulesScreen', () => {
  describe('the terms', () => {
    /**
     * Creating an account agrees to these rules, which makes them the terms of
     * using the app - the terms App Review asks an app with user content for,
     * saying there is no tolerance for objectionable content or abusive users.
     */
    it('says these are the terms of using Night Courier, which everyone here has agreed to', async () => {
      await renderScreen(<RulesScreen />);

      expect(screen.getByText('House rules')).toBeOnTheScreen();
      expect(screen.getByText(TERMS)).toBeOnTheScreen();
    });

    it('says nobody can write to you until you accept them, and that there is no search', async () => {
      await renderScreen(<RulesScreen />);

      expect(screen.getByText(FRIENDS_ONLY)).toBeOnTheScreen();
    });

    /**
     * The rule about minors names an age rather than saying "children", and
     * forbids sending sexual content to anyone under 18 as well as content
     * that involves them, so that neither half can be read away.
     */
    it('lists the six things never to send, in order, under their heading', async () => {
      await renderScreen(<RulesScreen />);

      expect(textsIn(sectionOf('Never send'))).toEqual(['Never send', ...NEVER_SEND]);
    });

    it('says there is no tolerance, and what becomes of an account that breaks the rules', async () => {
      await renderScreen(<RulesScreen />);

      expect(within(sectionOf('No tolerance')).getByText(NO_TOLERANCE)).toBeOnTheScreen();
    });
  });

  describe('if someone breaks them', () => {
    it('says where to report, who reads a report, and that the reporter is not named', async () => {
      await renderScreen(<RulesScreen />);

      expect(within(sectionOf('If someone breaks them')).getByText(REPORTING)).toBeOnTheScreen();
    });

    /**
     * A block is private, but not invisible: the friendship it ends is gone on
     * both sides. Someone who blocks should not believe the other cannot tell.
     */
    it('says where to block, what a block does, and what the blocked courier still sees', async () => {
      await renderScreen(<RulesScreen />);

      expect(within(sectionOf('If someone breaks them')).getByText(BLOCKING)).toBeOnTheScreen();
    });

    /**
     * In the number the database deletes by: parity.db.test.mjs holds the two
     * together. And because removing an account takes its letters from both
     * sides, whoever reported it is told to keep a copy first.
     */
    it('says how long a report is kept, and to keep a copy of anything that may be needed', async () => {
      await renderScreen(<RulesScreen />);

      expect(within(sectionOf('If someone breaks them')).getByText(RETENTION)).toBeOnTheScreen();
    });
  });

  describe('headings', () => {
    // VoiceOver and TalkBack users move through a long page by its headings.
    it('marks each section heading as a header, for a screen reader to move between', async () => {
      mockLinks.contact = CONTACT;
      mockLinks.privacyPolicy = PRIVACY_POLICY;
      await renderScreen(<RulesScreen />);

      for (const heading of [
        'Never send',
        'No tolerance',
        'If someone breaks them',
        'Anything else',
      ]) {
        expect(screen.getByRole('header', { name: heading })).toBeOnTheScreen();
      }
    });
  });

  describe('anything else', () => {
    it('leaves the section out while neither link is configured', async () => {
      await renderScreen(<RulesScreen />);

      expect(screen.queryByRole('header', { name: 'Anything else' })).toBeNull();
      expect(screen.queryByText(GET_IN_TOUCH)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Contact' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Privacy policy' })).toBeNull();
      // Back is all there is left to press.
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(button('Back')).toBeEnabled();
    });

    /**
     * App Review asks an app with user content for published contact
     * information, and a report may need something added to it later.
     */
    it('offers a way to get in touch once a contact address is configured, and opens it', async () => {
      mockLinks.contact = CONTACT;
      await renderScreen(<RulesScreen />);
      const section = sectionOf('Anything else');
      expect(within(section).getByText(GET_IN_TOUCH)).toBeOnTheScreen();
      expect(within(section).queryByRole('button', { name: 'Privacy policy' })).toBeNull();

      await fireEvent.press(within(section).getByRole('button', { name: 'Contact' }));

      expect(mockedOpenLink).toHaveBeenCalledTimes(1);
      expect(mockedOpenLink).toHaveBeenCalledWith(CONTACT);
    });

    it('offers the privacy policy once one is configured, and opens it', async () => {
      mockLinks.privacyPolicy = PRIVACY_POLICY;
      await renderScreen(<RulesScreen />);
      const section = sectionOf('Anything else');
      // The invitation to get in touch goes with an address to get in touch at.
      expect(within(section).queryByText(GET_IN_TOUCH)).toBeNull();
      expect(within(section).queryByRole('button', { name: 'Contact' })).toBeNull();

      await fireEvent.press(within(section).getByRole('button', { name: 'Privacy policy' }));

      expect(mockedOpenLink).toHaveBeenCalledTimes(1);
      expect(mockedOpenLink).toHaveBeenCalledWith(PRIVACY_POLICY);
    });
  });

  describe('going back', () => {
    it('goes back to where it was opened from', async () => {
      mockCanGoBack.mockReturnValue(true);
      await renderScreen(<RulesScreen />);

      await fireEvent.press(button('Back'));

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    /**
     * Opened straight from a link, or reloaded in the web build, the rules are
     * the only screen there is: a Back that went back would go nowhere, and
     * leave the reader stuck on them.
     */
    it('goes to the start of the app when there is nothing behind it', async () => {
      mockCanGoBack.mockReturnValue(false);
      await renderScreen(<RulesScreen />);

      await fireEvent.press(button('Back'));

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/');
      expect(mockBack).not.toHaveBeenCalled();
    });
  });

  describe('the header', () => {
    /**
     * The root stack shows no header, and the rules live outside the signed-in
     * group that gives its screens one. Without asking for one, the rules would
     * have no back button of the platform's - on iOS, only a swipe someone has
     * to know about.
     */
    it('asks for the same header as the screens in the app: a back button, and no title', async () => {
      await renderScreen(<RulesScreen />);

      expect(mockHeaderOptions.at(-1)).toEqual({
        headerShown: true,
        headerTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
      });
    });
  });
});
