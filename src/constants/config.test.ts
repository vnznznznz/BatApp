import {
  BATS_PER_USER,
  BAT_SPEED_KMH,
  DEBUG_TIME_MULTIPLIER,
  DISPLAY_NAME_FORBIDDEN_PATTERN,
  MESSAGE_MAX_LENGTH,
  MINIMUM_FLIGHT_MINUTES,
  MONETISATION_ENABLED,
  PRODUCTION_TIME_MULTIPLIER,
  MINIMUM_AGE,
  PARENTAL_PERMISSION_UNDER,
  RELOCATION_HOURS,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  VISIBLE_CHARACTER_PATTERN,
} from '@/constants/config';

// Node built-ins, typed by hand: the project's tsconfig deliberately leaves out
// Node's types, which describe nothing that exists in React Native.
declare const __dirname: string;
const { readdirSync, readFileSync } = jest.requireActual<{
  readdirSync: (path: string, options?: { recursive: true }) => string[];
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');

/**
 * These assertions guard the product rules, not the implementation. They exist
 * so that a change which would turn Night Courier into a different product
 * fails here first.
 */
describe('product invariants', () => {
  it('gives every user exactly three bats', () => {
    expect(BATS_PER_USER).toBe(3);
  });

  it('has no monetisation', () => {
    expect(MONETISATION_ENABLED).toBe(false);
  });

  it('never delivers instantly', () => {
    expect(MINIMUM_FLIGHT_MINUTES).toBeGreaterThan(0);
  });

  it('runs production at real speed', () => {
    expect(PRODUCTION_TIME_MULTIPLIER).toBe(1);
  });

  it('keeps the debug multiplier strictly faster than production', () => {
    expect(DEBUG_TIME_MULTIPLIER).toBeGreaterThan(0);
    expect(DEBUG_TIME_MULTIPLIER).toBeLessThan(PRODUCTION_TIME_MULTIPLIER);
  });

  it('flies at a positive, finite speed', () => {
    expect(BAT_SPEED_KMH).toBeGreaterThan(0);
    expect(Number.isFinite(BAT_SPEED_KMH)).toBe(true);
  });

  it('bounds message length', () => {
    expect(MESSAGE_MAX_LENGTH).toBeGreaterThan(0);
  });

  /**
   * A move that took effect at once would let a courier borrow a friend's city
   * for one short flight and move straight back.
   */
  it('makes a new city take time to become where bats fly from', () => {
    expect(RELOCATION_HOURS).toBeGreaterThan(0);
  });
});

describe('username rules', () => {
  it('bounds username length sensibly', () => {
    expect(USERNAME_MIN_LENGTH).toBeGreaterThanOrEqual(3);
    expect(USERNAME_MAX_LENGTH).toBeGreaterThan(USERNAME_MIN_LENGTH);
  });

  it('accepts lowercase, digits and underscores', () => {
    expect(USERNAME_PATTERN.test('night_courier_01')).toBe(true);
  });

  it('rejects uppercase, spaces and punctuation', () => {
    expect(USERNAME_PATTERN.test('NightCourier')).toBe(false);
    expect(USERNAME_PATTERN.test('night courier')).toBe(false);
    expect(USERNAME_PATTERN.test('night.courier')).toBe(false);
  });
});

/**
 * The database holds the same two lists, and src/tests/db/parity.db.test.mjs
 * compares them with these for every character there is. Here, what they are
 * for.
 */
describe('what a display name and a letter must have in them', () => {
  const isPlain = (name: string) => !DISPLAY_NAME_FORBIDDEN_PATTERN.test(name);
  const hasSomethingToSee = (text: string) => VISIBLE_CHARACTER_PATTERN.test(text);

  it('keeps line breaks, control characters and turns of direction out of a name', () => {
    expect(isPlain('An\nna')).toBe(false);
    expect(isPlain('\x07')).toBe(false);
    expect(isPlain('ab\u202Edetpecca')).toBe(false);
    expect(isPlain('\u2066Anna\u2069')).toBe(false);
    expect(isPlain('An\u2028na')).toBe(false);
    expect(isPlain('\u0000')).toBe(false);
  });

  it('lets the marks and joiners that scripts and emoji need stay in a name', () => {
    for (const name of [
      'Anna B.',
      'J\u00FCrgen \u00D6zt\u00FCrk',
      '\u5F20\u4F1F',
      '\u{1F469}\u200D\u{1F467}',
      '\u{1F3F3}\uFE0F\u200D\u{1F308}',
      '\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645',
      '\u05D3\u05E0\u05D4\u200F',
    ]) {
      expect(isPlain(name)).toBe(true);
      expect(hasSomethingToSee(name)).toBe(true);
    }
  });

  it('finds nothing to see in a blank of any kind', () => {
    for (const blank of [
      '',
      '   ',
      '\n\t',
      '\u200B',
      '\u00A0\u200B',
      '\u3000',
      '\u2060',
      '\u3164',
      '\u2800',
      '\uFEFF',
      '\u00AD',
      '\uFE0F',
      '\u{E0061}\u{E007F}',
      '\u200E\u200F\u200C\u200D',
      '\u{13430}\u{13431}\u{13436}',
      '\u0000',
    ]) {
      expect(hasSomethingToSee(blank)).toBe(false);
    }
  });

  /**
   * The list claims to be Unicode's white space, its control characters, what
   * it calls default-ignorable and the format characters that draw nothing.
   * Held to that claim here, for every character this runtime's Unicode knows,
   * so that a class left out - the hieroglyph format controls were, in review
   * - fails a test rather than a reader. Only the prepended concatenation marks
   * are format characters that are drawn: a number sign, the end of an ayah.
   */
  it('finds nothing to see in any character Unicode says draws nothing', () => {
    const drawn = /[\u0600-\u0605\u06DD\u070F\u0890\u0891\u08E2\u{110BD}\u{110CD}]/u;
    const drawsNothing = /[\p{White_Space}\p{Cc}\p{Default_Ignorable_Code_Point}\p{Cf}]/u;
    const counted: string[] = [];
    const leftOut: string[] = [];
    for (let code = 1; code <= 0x10ffff; code++) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      const character = String.fromCodePoint(code);
      if (drawn.test(character)) {
        if (!hasSomethingToSee(character)) counted.push(code.toString(16));
      } else if (drawsNothing.test(character) && hasSomethingToSee(character)) {
        leftOut.push(code.toString(16));
      }
    }

    expect(leftOut).toEqual([]);
    expect(counted).toEqual([]);
  });

  it('finds something to see as soon as one character shows', () => {
    expect(hasSomethingToSee('\u200B.\u2060')).toBe(true);
    expect(hasSomethingToSee('\u202Eolleh')).toBe(true);
    expect(hasSomethingToSee('\u{1F987}')).toBe(true);
  });
});

describe('who can join', () => {
  it('lets in no one younger than the age that needs a parent’s permission, and that only with it', () => {
    expect(MINIMUM_AGE).toBeGreaterThan(0);
    expect(PARENTAL_PERMISSION_UNDER).toBeGreaterThan(MINIMUM_AGE);
  });

  /**
   * The app reads both ages from these constants, but the privacy policy, the
   * help page and the store listings say them in fixed words - and it is the
   * documents that say what the operator decided. A constant changed alone,
   * or a document changed alone, and the sign-up form would admit people the
   * policy turns away, or the other way round. Each place a document says who
   * may join is written out below, `{min}` for MINIMUM_AGE and `{parent}` for
   * PARENTAL_PERMISSION_UNDER, and must say the same as the constants.
   */
  const SAID_IN: Record<string, string[]> = {
    'privacy-policy.en.md': [
      'Night Courier is for people aged {min} and over. Anyone under {parent} needs the permission of a parent or guardian.',
      'At sign-up you only confirm that you are at least {min} and, if you are under {parent}, that a parent or guardian has said yes.',
      'If I learn that someone is younger than {min}, I delete their account',
    ],
    'privacy-policy.de.md': [
      'Night Courier ist ab {min} Jahren. Wer unter {parent} ist, braucht die Erlaubnis der Eltern oder anderer Erziehungsberechtigter.',
      'Bei der Registrierung bestätigst du nur, dass du mindestens {min} bist und, falls du unter {parent} bist, die Erlaubnis',
      'Erfahre ich, dass jemand jünger als {min} ist, lösche ich das Konto',
    ],
    'support-page.md': [
      'You must be at least {min}. If you are under {parent}, you need the permission of a parent or guardian.',
      'If I learn that an account belongs to someone under {min}, I delete it',
      'Du musst mindestens {min} Jahre alt sein. Wer unter {parent} ist, braucht die Erlaubnis der Eltern',
      'Erfahre ich, dass ein Konto jemandem unter {min} gehört, lösche ich es',
    ],
    'app-store.md': [
      "You must be at least {min}, and if you are under {parent} you need a parent's or guardian's permission.",
      'Du musst mindestens {min} Jahre alt sein. Wenn du unter {parent} bist, brauchst du die Erlaubnis',
      "Night Courier is for people aged {min} and over; under {parent}, only with a parent's or guardian's permission.",
      'Override to Higher Age Rating → {min}+',
    ],
    'google-play.md': [
      "You must be at least {min}, and if you are under {parent} you need a parent's or guardian's permission.",
      'Du musst mindestens {min} Jahre alt sein. Wenn du unter {parent} bist, brauchst du die Erlaubnis',
      "Night Courier is for people aged {min} and over; under {parent}, only with a parent's or guardian's permission.",
    ],
  };

  const ROOT = join(__dirname, '..', '..');

  /**
   * A document - its path from the project's root - as one line of plain
   * words: its sentences are wrapped, and some are bold.
   */
  const plainText = (path: string) =>
    readFileSync(join(ROOT, path), 'utf8').replace(/\*\*/g, '').replace(/\s+/g, ' ');

  /** Every age each place in `text` gives, in the order the statement names them. */
  function agesIn(text: string, statement: string) {
    const names = [...statement.matchAll(/\{(min|parent)\}/g)].map((match) => match[1]);
    const pattern = statement
      .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
      .replace(/\{(min|parent)\}/g, '(\\d+)');
    return [...text.matchAll(new RegExp(pattern, 'g'))].map((match) =>
      Object.fromEntries(names.map((name, index) => [name, Number(match[index + 1])])),
    );
  }

  it.each(Object.entries(SAID_IN))('is what %s says, in every place it says it', (file, said) => {
    const text = plainText(join('docs', 'store', file));
    const ages = { min: MINIMUM_AGE, parent: PARENTAL_PERMISSION_UNDER };

    for (const statement of said) {
      const found = agesIn(text, statement);
      expect({ statement, found: found.length > 0 }).toEqual({ statement, found: true });
      for (const given of found) {
        expect({ statement, ...given }).toEqual({
          statement,
          ...Object.fromEntries(
            Object.keys(given).map((name) => [name, ages[name as 'min' | 'parent']]),
          ),
        });
      }
    }
  });

  /**
   * The statements above are the ones that matter most, not all there are:
   * the listings, the records of processing and the operator's notes give the
   * ages in many more places, and a 13 changed to 14 in one of them passed.
   * (Found in review.) So every place a document gives an age is also found
   * by the words around the number - "at least 13", "under 16", "ab 13
   * Jahren", "13+" - and must give one of the two; a span, "13–15", must be
   * the years that need the permission. Every Markdown document is searched,
   * not only the store's: the go-live list and the roadmap give the ages too,
   * and a document added later, or one that gives no age yet, could give
   * another unnoticed. (Found in review.) Not "older than" or "älter als":
   * the documents say how long records are kept with them.
   */
  const NUMBER = String.raw`(\d+)(?![.,:]?\d)`;
  /** Where a word starts, in any script: `\b` knows only the letters of English. */
  const START = String.raw`(?<![\p{L}\p{N}_])`;
  const AGE_GIVEN = new RegExp(
    [
      String.raw`aged ${NUMBER}(?: to ${NUMBER})?`,
      String.raw`${NUMBER} (?:and|or) (?:over|older|up)\b`,
      String.raw`(?:at least|under|younger than|below) ${NUMBER}`,
      String.raw`(?:minimum )?age (?:of |is |was |to )?${NUMBER}`,
      String.raw`minimum of ${NUMBER}`,
      String.raw`${NUMBER}- to ${NUMBER}-year-old`,
      String.raw`${NUMBER}-year-old`,
      String.raw`${NUMBER} ?– ?${NUMBER}`,
      String.raw`${NUMBER}\+`,
      String.raw`(?:MINIMUM_AGE|PARENTAL_PERMISSION_UNDER) = ${NUMBER}`,
      String.raw`(?:ab|unter|mindestens|jünger als) ${NUMBER}`,
      String.raw`${NUMBER} Jahre alt`,
      String.raw`${NUMBER} und älter`,
      String.raw`von ${NUMBER} bis ${NUMBER}`,
      String.raw`Altersgrenze (?:ist |von )?${NUMBER}`,
    ]
      .map((phrase) => START + phrase)
      .join('|'),
    'giu',
  );

  /**
   * The numbers in such words that are no age of Night Courier's - counts of
   * other things, the ages of other rules and of the stores' own scales, and
   * the age it had until 5 November 2026 - each written as the documents
   * write it. They are taken out before the documents are searched, and each
   * must still be in one of them, so that this list says what they say.
   * Apple's scale and Play's groups come before the parts of them named alone.
   */
  const OTHER_NUMBERS: [what: string, where: RegExp][] = [
    ['a flight within a city', /at least 20 minutes|mindestens 20 Minuten/g],
    ['a password', /at least 8 characters/g],
    ['the screenshots for Google Play', /At least 2, at most 8/g],
    ["Google's closed test", /at least 12 testers/g],
    ["Google's precise location", /at least 3 km²/g],
    ['when a data protection officer is needed', /ab 20 Personen/g],
    ['the age of the rule on sexual content', /(?:involving|sent to) anyone under 18/g],
    ['the phases of the roadmap', /Phases \d+–\d+|delivery time \(6–8\)/g],
    ["a courier's bats", /slots 1–3/g],
    ['the versions of Node.js and npm', /Node 24\.3\+|npm 10\+/g],
    ["Apple's enterprise programme", /100\+ employees/g],
    ["Apple's age ratings", /4\+, 9\+, 13\+, 16\+ and 18\+/g],
    [
      "the rating Apple's tables give the app before the override",
      /(?:at|under|as|expected:|expected to be) 4\+/g,
    ],
    ["Play's age groups", /5 and under, 6–8, 9–12, 13–15, 16–17, 18 and over/g],
    ["Play's age groups below the minimum age", /not 5 and under, not 6–8, not 9–12/g],
    [
      "Play's age groups from the permission age up",
      /16–17,? (?:and|und) 18 (?:and over|und älter)/g,
    ],
    [
      'the minimum age until 5 November 2026',
      /the minimum age was 12|include 9–12|Kindes unter 12|for a minimum age of 12/g,
    ],
  ];

  const isMarkdown = (file: string) => file.endsWith('.md');

  /** Every Markdown document: those at the project's root, and all under docs/. */
  const DOCUMENTS = [
    ...readdirSync(ROOT).filter(isMarkdown),
    ...readdirSync(join(ROOT, 'docs'), { recursive: true })
      .filter(isMarkdown)
      .map((file) => join('docs', file)),
  ];

  /** The documents that say who may join, each of which the search has to find an age in. */
  const SAY_WHO_MAY_JOIN = [
    ...readdirSync(join(ROOT, 'docs', 'store'))
      .filter(isMarkdown)
      .map((file) => join('docs', 'store', file)),
    join('docs', 'GO-LIVE.md'),
    join('docs', 'ROADMAP.md'),
  ];

  it('is every age the documents give, wherever they give one', () => {
    const contradicting: string[] = [];
    const notFound = new Set(OTHER_NUMBERS.map(([what]) => what));
    expect(DOCUMENTS).toEqual(expect.arrayContaining([...SAY_WHO_MAY_JOIN, 'README.md']));

    for (const file of DOCUMENTS) {
      let text = plainText(file);
      for (const [what, where] of OTHER_NUMBERS) {
        text = text.replace(where, () => {
          notFound.delete(what);
          return '…';
        });
      }

      const given = [...text.matchAll(AGE_GIVEN)];
      // A search that found nothing would pass whatever such a document said.
      if (SAY_WHO_MAY_JOIN.includes(file)) {
        expect({ file, givesAnAge: given.length > 0 }).toEqual({ file, givesAnAge: true });
      }
      for (const match of given) {
        const [first, last] = match
          .slice(1)
          .filter((age) => age !== undefined)
          .map(Number);
        const right =
          last === undefined
            ? first === MINIMUM_AGE || first === PARENTAL_PERMISSION_UNDER
            : first === MINIMUM_AGE && last === PARENTAL_PERMISSION_UNDER - 1;
        if (!right) {
          const at = match.index ?? 0;
          contradicting.push(`${file}: …${text.slice(Math.max(0, at - 40), at + 40)}…`);
        }
      }
    }

    expect(contradicting).toEqual([]);
    expect([...notFound]).toEqual([]);
  });
});
