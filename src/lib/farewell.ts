/**
 * A word for the welcome screen once this device's account has been deleted.
 *
 * Deleting the account signs the device out, and the app lands on the welcome
 * screen as it does after any sign-out: with nothing to say that the deletion
 * went through. (Found in the browser.) The word is left before the session is
 * let go of, so the welcome screen finds it when it opens, and it says it once.
 * In memory only, like everything else the app keeps about an account.
 */

export const ACCOUNT_DELETED = 'Your account has been deleted.';

let due = false;

/** For the deletion, before the device is signed out. */
export function noteAccountDeleted(): void {
  due = true;
}

/** Whether the welcome screen has something to say. */
export function isFarewellDue(): boolean {
  return due;
}

/** Once it has been said. */
export function forgetFarewell(): void {
  due = false;
}
