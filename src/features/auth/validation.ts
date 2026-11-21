import {
  DISPLAY_NAME_FORBIDDEN_PATTERN,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  VISIBLE_CHARACTER_PATTERN,
} from '@/constants/config';

/**
 * Client-side validation, mirroring the database constraints in
 * `supabase/migrations`, and the limits of the auth server.
 *
 * The server is the authority. These exist only so a mistake is caught before
 * a round trip and reported next to the field that caused it, rather than as a
 * Postgres constraint name in a toast.
 */

/** Supabase's own minimum. Raising it here would only lock users out of signup. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * The auth server's maximum, in bytes as UTF-8 writes them, not in characters:
 * it hashes passwords with bcrypt, which reads no further. A letter such as ä
 * takes two bytes, an emoji four.
 */
export const PASSWORD_MAX_BYTES = 72;

/** The longest display name, in characters: profiles_display_name_length in the database. */
const DISPLAY_NAME_MAX_LENGTH = 40;

/**
 * Said for an address the auth server does not take, whether it is the app
 * that sees it first or the server that refuses it.
 */
export const EMAIL_NOT_ACCEPTED =
  'That email address was not accepted. Check it for mistakes - letters such as ä or é ' +
  'cannot be used.';

/** Said for a password the auth server does not take for its length, wherever that is seen. */
export const PASSWORD_TOO_LONG =
  `Passwords can be at most ${PASSWORD_MAX_BYTES} characters long. Letters such as ä or é ` +
  'count as two, and emoji as four.';

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  // Deliberately permissive: the only reliable test of an address is sending to
  // it, and signup does exactly that.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That does not look like an email address.';
  // But the auth server refuses an address with any letter outside ASCII, in
  // the name or the domain, as "invalid format" - only the xn-- spelling of
  // such a domain gets through.
  if (/[^\u0000-\u007F]/.test(email)) return EMAIL_NOT_ACCEPTED;
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Choose a password.';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Passwords need at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (utf8Length(value) > PASSWORD_MAX_BYTES) return PASSWORD_TOO_LONG;
  return null;
}

export function validateUsername(value: string): string | null {
  const username = normaliseUsername(value);
  if (!username) return 'Choose a username.';
  if (username.length < USERNAME_MIN_LENGTH) {
    return `Usernames need at least ${USERNAME_MIN_LENGTH} characters.`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Usernames can be at most ${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Usernames can use lowercase letters, numbers and underscores only.';
  }
  return null;
}

/**
 * The database's rules for a name, exactly (see the visible names migration):
 * plain text, something in it to see, and at most 40 characters as it counts
 * them. Judged as it is sent, without the blank space around it. A name the
 * database refuses at sign-up comes back from the auth server as the same
 * error as a taken username, so it has to be caught here.
 */
export function validateDisplayName(value: string): string | null {
  const name = value.trim();
  if (DISPLAY_NAME_FORBIDDEN_PATTERN.test(name)) {
    return 'A name cannot contain line breaks or hidden characters.';
  }
  if (!VISIBLE_CHARACTER_PATTERN.test(name)) return 'Enter a name your friends will recognise.';
  // Characters as the database counts them, not UTF-16 units: one emoji is two
  // of those, and a name of 21 emoji was refused here and taken there.
  if ([...name].length > DISPLAY_NAME_MAX_LENGTH) return 'That name is a little long.';
  return null;
}

/**
 * Applied before validating and before sending, so both agree on the value.
 * The app writes every username with an @, and tells people to share it that
 * way; the one in front is dropped.
 */
export function normaliseUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

/**
 * The length of `value` in UTF-8, as the auth server receives it. A lone half
 * of a surrogate pair arrives as U+FFFD, three bytes.
 */
function utf8Length(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
