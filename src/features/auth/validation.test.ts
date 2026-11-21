import {
  EMAIL_NOT_ACCEPTED,
  normaliseUsername,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/features/auth/validation';

describe('validateEmail', () => {
  it('accepts an ordinary address', () => {
    expect(validateEmail('anna@example.com')).toBeNull();
  });

  it('ignores surrounding whitespace', () => {
    expect(validateEmail('  anna@example.com  ')).toBeNull();
  });

  it('asks for an address when the field is empty', () => {
    expect(validateEmail('')).toMatch(/Enter your email/);
    expect(validateEmail('   ')).toMatch(/Enter your email/);
  });

  it('rejects something that is plainly not an address', () => {
    expect(validateEmail('anna')).not.toBeNull();
    expect(validateEmail('anna@example')).not.toBeNull();
    expect(validateEmail('anna @example.com')).not.toBeNull();
  });

  /**
   * The auth server refuses any address with a letter outside ASCII, in the
   * name or in the domain, as "invalid format". Said here first, in the same
   * words the app gives for the server's refusal.
   */
  it.each(['jürgen@example.de', 'anna@müller.example', 'zoë@example.com'])(
    'refuses %s as the auth server would',
    (address) => {
      expect(validateEmail(address)).toBe(EMAIL_NOT_ACCEPTED);
    },
  );

  it('accepts a domain written the way the auth server takes it', () => {
    expect(validateEmail('anna@xn--mller-kva.example')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('accepts a password at the minimum length', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it('rejects one character short', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toMatch(/at least/);
  });

  it('asks for a password when the field is empty', () => {
    expect(validatePassword('')).toMatch(/Choose a password/);
  });

  /**
   * The auth server takes at most 72 bytes of a password, and an umlaut takes
   * two: 40 of them were refused as "longer than 72 characters".
   */
  it('accepts a password of the longest the auth server takes', () => {
    expect(PASSWORD_MAX_BYTES).toBe(72);
    expect(validatePassword('a'.repeat(72))).toBeNull();
    expect(validatePassword('ä'.repeat(36))).toBeNull();
    expect(validatePassword('🦇'.repeat(18))).toBeNull();
  });

  it.each([
    ['letters', 'a'.repeat(73)],
    ['umlauts, which take two bytes each', 'ä'.repeat(37)],
    ['the 40 umlauts the server refused', 'ä'.repeat(40)],
    ['emoji, which take four', '🦇'.repeat(19)],
  ])('refuses one longer than that, in %s, and says why', (_, password) => {
    const said = validatePassword(password);
    expect(said).toMatch(/at most 72/);
    expect(said).toMatch(/ä or é count as two/);
  });
});

/** These mirror the database constraints; drift between them is the bug. */
describe('validateUsername', () => {
  it('accepts lowercase letters, digits and underscores', () => {
    expect(validateUsername('anna_weber_01')).toBeNull();
  });

  it('accepts a username the user typed with capitals', () => {
    expect(validateUsername('AnnaWeber')).toBeNull();
  });

  it('rejects one that is too short', () => {
    expect(validateUsername('an')).toMatch(/at least/);
  });

  it('rejects one that is too long', () => {
    expect(validateUsername('a'.repeat(21))).toMatch(/at most/);
  });

  it('rejects spaces and punctuation', () => {
    expect(validateUsername('anna weber')).toMatch(/lowercase letters/);
    expect(validateUsername('anna.weber')).toMatch(/lowercase letters/);
  });

  it('asks for a username when the field is empty', () => {
    expect(validateUsername('   ')).toMatch(/Choose a username/);
  });

  it('accepts a username typed as the app writes it, with the @', () => {
    expect(validateUsername('@anna')).toBeNull();
    expect(validateUsername('@')).toMatch(/Choose a username/);
  });
});

describe('normaliseUsername', () => {
  it('lower-cases and trims, matching what the database stores', () => {
    expect(normaliseUsername('  AnnaWeber  ')).toBe('annaweber');
  });

  /** The app writes every username with an @, and tells people to share it that way. */
  it('drops the @ a username is shared with', () => {
    expect(normaliseUsername('@anna')).toBe('anna');
    expect(normaliseUsername(' @AnnaWeber ')).toBe('annaweber');
  });

  it('drops one @ only', () => {
    expect(normaliseUsername('@@anna')).toBe('@anna');
    expect(validateUsername('@@anna')).toMatch(/lowercase letters/);
  });
});

/**
 * The database's rules for a name, exactly: the visible names migration, and
 * the length check on profiles. A name it refuses at sign-up comes back from
 * the auth server as the same error as a taken username.
 */
describe('validateDisplayName', () => {
  const NOTHING_TO_SEE = 'Enter a name your friends will recognise.';
  const NOT_PLAIN = 'A name cannot contain line breaks or hidden characters.';

  it('accepts an ordinary name', () => {
    expect(validateDisplayName('Anna Weber')).toBeNull();
  });

  it('asks for one when the field is empty', () => {
    expect(validateDisplayName('  ')).toBe(NOTHING_TO_SEE);
  });

  it('rejects an unreasonably long one', () => {
    expect(validateDisplayName('a'.repeat(41))).not.toBeNull();
  });

  /** JavaScript's trim keeps these, and a name of them is a blank on every list. */
  it.each([
    ['a zero-width space', '\u200B'],
    ['a Hangul filler', '\u3164'],
    ['a word joiner', '\u2060'],
    ['a blank braille pattern', '\u2800'],
    ['a soft hyphen between spaces', ' \u00AD '],
  ])('asks for a name with something to see instead of %s', (_, name) => {
    expect(validateDisplayName(name)).toBe(NOTHING_TO_SEE);
  });

  it.each([
    ['a line break', 'An\nna'],
    ['a tab', 'An\tna'],
    ['a right-to-left override, which makes it read as something else', 'ab\u202Edetpecca'],
    ['a direction isolate', 'Anna\u2066'],
    ['a line separator', 'An\u2028na'],
  ])('refuses a name with %s', (_, name) => {
    expect(validateDisplayName(name)).toBe(NOT_PLAIN);
  });

  it('accepts the marks and joiners scripts and emoji need', () => {
    expect(validateDisplayName('\u{1F469}\u200D\u{1F467}')).toBeNull();
    expect(validateDisplayName('\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645')).toBeNull();
    expect(validateDisplayName('\u05D3\u05E0\u05D4\u200F')).toBeNull();
  });

  /** The database counts characters; JavaScript's length counts two for each emoji. */
  it('counts the characters as the database does', () => {
    expect(validateDisplayName('🦇'.repeat(40))).toBeNull();
    expect(validateDisplayName('🦇'.repeat(41))).toBe('That name is a little long.');
    expect(validateDisplayName('a'.repeat(40))).toBeNull();
  });

  it('judges the name as it is sent, without the blank space around it', () => {
    expect(validateDisplayName('\n  Anna Weber \t')).toBeNull();
    expect(validateDisplayName(` ${'a'.repeat(40)} `)).toBeNull();
  });
});
