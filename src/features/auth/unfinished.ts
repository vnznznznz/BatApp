import type { User } from '@supabase/supabase-js';

import { authStorage } from '@/lib/session-store';

/**
 * What a code from an email that has signed the courier in is for, and is
 * left to do: the account a sign-up's code confirmed, to be set up as the
 * courier typed it; or the new password of a reset - unless the reset's code
 * confirmed an account nobody had confirmed before, which is to be removed.
 */
export type Unfinished =
  | { flow: 'sign-up'; email: string; username: string; displayName: string }
  | { flow: 'reset'; email: string; remove?: boolean };

/**
 * Kept in the keychain beside the session, under a name of its own: the
 * session a code brings is kept on the device the moment the code is
 * answered, and an app closed before what it was for was done opened in the
 * roost - after a sign-up, perhaps with a password somebody else had set for
 * the account. Never the password: the screen asks for it again.
 */
const UNFINISHED_KEY = 'night-courier.unfinished';

/** One change at a time, in the order asked: a removal must not land after a later write. */
let changes: Promise<unknown> = Promise.resolve();

function inTurn(change: () => Promise<void>): Promise<void> {
  const turn = changes.then(change, change);
  changes = turn.catch(() => {});
  return turn;
}

/**
 * Keeps what is left to do on the device. Rejects if the keychain will not
 * take it; the code can still be checked then, as before there was this.
 */
export function keepUnfinished(unfinished: Unfinished): Promise<void> {
  return inTurn(() => authStorage.setItem(UNFINISHED_KEY, JSON.stringify(unfinished)));
}

/** Forgets it: done, given up, or no longer the device's to do. Never rejects. */
export function forgetUnfinished(): Promise<void> {
  return inTurn(() => authStorage.removeItem(UNFINISHED_KEY)).catch(() => {});
}

/**
 * What was left to do when the app was last open, or null: nothing was, or it
 * cannot be read - which leaves the app as it was before there was this.
 * Never rejects.
 */
export async function readUnfinished(): Promise<Unfinished | null> {
  await changes;
  try {
    const value = await authStorage.getItem(UNFINISHED_KEY);
    return value === null ? null : toUnfinished(JSON.parse(value));
  } catch {
    return null;
  }
}

function toUnfinished(value: unknown): Unfinished | null {
  if (typeof value !== 'object' || value === null) return null;
  const { flow, email, username, displayName, remove } = value as Record<string, unknown>;
  if (typeof email !== 'string') return null;
  if (flow === 'sign-up' && typeof username === 'string' && typeof displayName === 'string') {
    return { flow, email, username, displayName };
  }
  if (flow === 'reset') return { flow, email, remove: remove === true };
  return null;
}

/** Whether two addresses are the same, as the auth server compares them. */
export const sameAddress = (one: string | undefined, other: string | undefined) =>
  one !== undefined &&
  other !== undefined &&
  one.trim().toLowerCase() === other.trim().toLowerCase();

/**
 * Whether the code of a password reset is what confirmed the account's
 * address. The auth server confirms an address with a reset's code too
 * (GoTrue v2.197), so an account a sign-up left waiting for its code - with
 * that sign-up's password, username and name, whoever it was - becomes a
 * confirmed account by it.
 *
 * It does so in the request that signs in with the code: the address is
 * confirmed in the moment of that sign-in, milliseconds before it (2 ms on
 * the local server). Not "after the code was sent": a reset's code lives a
 * day, and the auth server keeps it when a sign-up's code confirms the account
 * meanwhile - typed once that account was finished and in use, it had it
 * removed. (Found in review.) A renewal of the session leaves the time of its
 * sign-in as it was, so this holds for a session kept on the device as well.
 */
export function confirmedByResetCode(
  user: Partial<Pick<User, 'email_confirmed_at' | 'last_sign_in_at'>>,
) {
  const confirmed = instant(user.email_confirmed_at);
  const signedIn = instant(user.last_sign_in_at);
  return Math.abs(signedIn - confirmed) <= SAME_REQUEST_MS;
}

/**
 * How far apart the two may be and still have come from one request: hundreds
 * of times what the server takes between them, and less than anyone takes to
 * use a second code after a first. The app itself, driven by a script, signed
 * up, finished the account, used it and signed out in two seconds, and the
 * reset's code typed then counted as what had confirmed it at five.
 */
const SAME_REQUEST_MS = 1000;

/**
 * A time from the auth server, in milliseconds; NaN for none. It writes up to
 * nine digits after the second, and only the first three are read: more is
 * not part of the format JavaScript engines must accept.
 */
const instant = (value: string | undefined) =>
  Date.parse((value ?? '').replace(/(\.\d{3})\d+/, '$1'));
