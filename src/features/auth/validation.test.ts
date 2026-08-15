import {
  normaliseUsername,
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
});

describe('normaliseUsername', () => {
  it('lower-cases and trims, matching what the database stores', () => {
    expect(normaliseUsername('  AnnaWeber  ')).toBe('annaweber');
  });
});

describe('validateDisplayName', () => {
  it('accepts an ordinary name', () => {
    expect(validateDisplayName('Anna Weber')).toBeNull();
  });

  it('asks for one when the field is empty', () => {
    expect(validateDisplayName('  ')).not.toBeNull();
  });

  it('rejects an unreasonably long one', () => {
    expect(validateDisplayName('a'.repeat(41))).not.toBeNull();
  });
});
