/**
 * A word for the welcome screen once this device's account has been deleted,
 * or its session has ended because the account is suspended.
 *
 * Deleting the account signs the device out, and the app lands on the welcome
 * screen as it does after any sign-out: with nothing to say that the deletion
 * went through. (Found in the browser.) A suspended account is signed out as
 * silently, by the renewal the auth server refuses - at the app's start, when
 * the session is over an hour old - and learnt why only by signing in again.
 * (Found in the browser.) The word is left before the session is let go of,
 * so the welcome screen finds it when it opens, and it says it once. In
 * memory only, like everything else the app keeps about an account.
 */

export const ACCOUNT_DELETED = 'Your account has been deleted.';

export type Farewell = 'deleted' | 'suspended';

let due: Farewell | null = null;

/** For the deletion, before the device is signed out. */
export function noteAccountDeleted(): void {
  due = 'deleted';
}

/** For a renewal the auth server refused because the account is suspended. */
export function noteAccountSuspended(): void {
  due = 'suspended';
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
