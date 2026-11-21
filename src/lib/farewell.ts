/**
 * A word for the welcome screen once this device's account has been deleted,
 * or its session has ended because the account is suspended, or was ended
 * elsewhere.
 *
 * Deleting the account signs the device out, and the app lands on the welcome
 * screen as it does after any sign-out: with nothing to say that the deletion
 * went through. (Found in the browser.) A suspended account is signed out as
 * silently, by the renewal the auth server refuses - at the app's start, when
 * the session is over an hour old - and learnt why only by signing in again.
 * (Found in the browser.) So was a session ended elsewhere: a sign-out on
 * another device, the tidy-up of a session unused for 90 days, a new password
 * set elsewhere. (Found in review.) The word is left before the session is
 * let go of, so the welcome screen finds it when it opens, and it says it
 * once. In memory only, like everything else the app keeps about an account.
 */

export const ACCOUNT_DELETED = 'Your account has been deleted.';

/**
 * Said of a session ended elsewhere. The auth server answers each way of
 * ending it alike, and a deletion on another device too, so the words are
 * true of all of them, and say the one thing to do.
 */
export const SIGNED_OUT_ELSEWHERE = 'You were signed out. Sign in again to go on.';

export type Farewell = 'deleted' | 'suspended' | 'ended';

let due: Farewell | null = null;

/** For the deletion, before the device is signed out. */
export function noteAccountDeleted(): void {
  due = 'deleted';
}

/** For a renewal the auth server refused because the account is suspended. */
export function noteAccountSuspended(): void {
  due = 'suspended';
}

/**
 * For a renewal of the session on this device that the auth server refused
 * because the session is over. A deletion or a suspension noted already says
 * more, and stays.
 */
export function noteSessionEnded(): void {
  if (due === null) due = 'ended';
}

/**
 * For a sign-out the courier made on this device: they know of it, and a
 * session ended elsewhere meanwhile is no news to them.
 */
export function forgetSessionEnded(): void {
  if (due === 'ended') due = null;
}

/** For a renewal that went through: whatever suspension was noted is over. */
export function forgetSuspension(): void {
  if (due === 'suspended') due = null;
}

/** What the welcome screen has to say, if anything. */
export function farewellDue(): Farewell | null {
  return due;
}

/** Whether the welcome screen has something to say. */
export function isFarewellDue(): boolean {
  return due !== null;
}

/** Once it has been said. */
export function forgetFarewell(): void {
  due = null;
}
