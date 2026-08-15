import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from '@/constants/config';

/**
 * Client-side validation, mirroring the database constraints in
 * `supabase/migrations`.
 *
 * The database is the authority. These exist only so a mistake is caught before
 * a round trip and reported next to the field that caused it, rather than as a
 * Postgres constraint name in a toast.
 */

/** Supabase's own minimum. Raising it here would only lock users out of signup. */
export const PASSWORD_MIN_LENGTH = 8;

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  // Deliberately permissive: the only reliable test of an address is sending to
  // it, and signup does exactly that.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That does not look like an email address.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Choose a password.';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Passwords need at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
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

export function validateDisplayName(value: string): string | null {
  const name = value.trim();
  if (!name) return 'Enter a name your friends will recognise.';
  if (name.length > 40) return 'That name is a little long.';
  return null;
}

/** Applied before validating and before sending, so both agree on the value. */
export function normaliseUsername(value: string): string {
  return value.trim().toLowerCase();
}
