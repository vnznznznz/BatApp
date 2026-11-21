import {
  EMAIL_CODE_LENGTH,
  EMAIL_NOT_ACCEPTED,
  EMAIL_TOO_LONG,
  normaliseUsername,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  validateDisplayName,
  validateEmail,
  validateEmailCode,
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

  /**
   * The auth server takes an address only in one shape (GoTrue v2.197's
   * pattern, read from the server itself): before the @ the letters a to z,
   * digits and the signs . ! # $ % & ' * + / = ? ^ _ ` { | } ~ -, and after
   * it labels of letters and digits, with hyphens only inside them and at
   * most 63 long, between dots. These it refused as "invalid format" while
   * the form let them through (tried on the local stack).
   */
  it.each([
    ['an underscore in the domain', 'anna@x_y.com'],
    ['a hyphen at the start of the domain', 'anna@-x.com'],
    ['a hyphen at the end of a label', 'anna@example-.com'],
    ['two dots in a row in the domain', 'anna@example..com'],
    ['a label longer than 63', `anna@${'a'.repeat(64)}.com`],
    ['a later label longer than 63', `anna@mail.${'a'.repeat(64)}.com`],
    ['quotes around the name', '"anna"@example.com'],
    ['brackets in the name', 'anna(work)@example.com'],
    ['a comma in the name', 'anna,weber@example.com'],
  ])('refuses an address with %s, as the auth server would', (_, address) => {
    expect(validateEmail(address)).toBe(EMAIL_NOT_ACCEPTED);
  });

  it.each([
    ['dots and a plus in the name', 'anna.weber+bats@example.com'],
    ['every sign the auth server takes in the name', "a!#$%&'*+/=?^_`{|}~-z@example.com"],
    ['hyphens inside the domain', 'anna@my-mail.example.co.uk'],
    ['capitals', 'Anna@Example.COM'],
    ['labels of 63', `anna@${'a'.repeat(63)}.${'b'.repeat(63)}.com`],
  ])('accepts an address with %s', (_, address) => {
    expect(validateEmail(address)).toBeNull();
  });

  /** "An email address is too long" past 255 characters, from the auth server. */
  it('refuses an address longer than the auth server takes', () => {
    const longest = `${'a'.repeat(243)}@example.com`;
    expect(longest).toHaveLength(255);

    expect(validateEmail(longest)).toBeNull();
    expect(validateEmail(`a${longest}`)).toBe(EMAIL_TOO_LONG);
    expect(validateEmail(`  ${longest}  `)).toBeNull();
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
   * The auth server counts the shortest in bytes too, as UTF-8 writes them:
   * four umlauts, or two emoji, are a password it takes (GoTrue v2.197 at
   * minimum_password_length 8, tried on the local stack). The form refused
   * them, counting characters - and twice as many for an emoji.
   */
  it.each([
    ['four umlauts, which take two bytes each', 'ä'.repeat(4)],
    ['three euro signs, which take three', '€'.repeat(3)],
    ['two emoji, which take four', '😀'.repeat(2)],
  ])('accepts a password as short as the auth server takes it, in %s', (_, password) => {
    expect(validatePassword(password)).toBeNull();
  });

  it.each([
    ['three umlauts', 'ä'.repeat(3)],
    ['two euro signs', '€'.repeat(2)],
    ['one emoji and three letters', '😀abc'],
  ])('refuses one the auth server finds too short, in %s', (_, password) => {
    expect(validatePassword(password)).toBe('Passwords need at least 8 characters.');
  });

  /**
   * The auth server takes at most 72 bytes of a password, and an umlaut takes
   * two: 40 of them were refused as "longer than 72 characters".
   */
  it('accepts a password of the longest the auth server takes', () => {
    expect(PASSWORD_MAX_BYTES).toBe(72);
    expect(validatePassword('a'.repeat(72))).toBeNull();
    expect(validatePassword('ä'.repeat(36))).toBeNull();
    expect(validatePassword('€'.repeat(24))).toBeNull();
    expect(validatePassword('🦇'.repeat(18))).toBeNull();
  });

  it.each([
    ['letters', 'a'.repeat(73)],
    ['umlauts, which take two bytes each', 'ä'.repeat(37)],
    ['the 40 umlauts the server refused', 'ä'.repeat(40)],
    ['euro signs, which take three', '€'.repeat(25)],
    ['emoji, which take four', '🦇'.repeat(19)],
  ])('refuses one longer than that, in %s, and says why', (_, password) => {
    const said = validatePassword(password);
    expect(said).toMatch(/at most 72/);
    expect(said).toMatch(/ä or é count as two/);
  });

  /**
   * Half an emoji on its own - pasted from somewhere that cut one in two -
   * travels in the request as an escape, and the auth server reads it as the
   * replacement character, which takes three bytes.
   */
  it('counts half an emoji on its own as the three bytes the server makes of it', () => {
    expect(validatePassword(`${'a'.repeat(69)}\uD83E`)).toBeNull();
    expect(validatePassword(`${'a'.repeat(70)}\uD83E`)).toMatch(/at most 72/);
    expect(validatePassword(`${'a'.repeat(70)}\uDD87`)).toMatch(/at most 72/);
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

describe('validateEmailCode', () => {
  it('asks for the code when there is none', () => {
    expect(validateEmailCode('')).toBe('Enter the code from the email.');
  });

  it('takes a code of exactly as many digits as the emails have', () => {
    expect(EMAIL_CODE_LENGTH).toBe(8);
    expect(validateEmailCode('12345678')).toBeNull();
    expect(validateEmailCode('00000000')).toBeNull();
  });

  /** Asking the server about a code that cannot be one only uses up an attempt. */
  it.each(['1234567', '123456', '123456789', '1234 5678', '1234567a'])(
    'refuses %p, which is not a code',
    (code) => {
      expect(validateEmailCode(code)).toBe('The code has 8 digits.');
    },
  );
});
