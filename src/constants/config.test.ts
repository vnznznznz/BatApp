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
      '\u0000',
    ]) {
      expect(hasSomethingToSee(blank)).toBe(false);
    }
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
});
