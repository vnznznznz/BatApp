import { MESSAGE_MAX_LENGTH, REPORT_NOTE_MAX_LENGTH } from '@/constants/config';

/**
 * Errors from the database functions, in words a person can act on.
 *
 * The functions in `supabase/migrations` refuse business-rule violations with
 * SQLSTATE P0001 and a stable, machine-readable `hint` - `no_available_bat`,
 * `not_friends` - rather than with prose. The prose lives here, with the rest of
 * the app's voice, and the database stays free to phrase its own messages for
 * whoever reads the logs.
 */

export const REFUSALS = {
  // Also the answer to someone who has been blocked, so it must be true for both.
  unknown_username: 'Nobody by that username can be asked. Check the spelling with your friend.',
  cannot_befriend_self: 'That is your own username.',
  request_not_found: 'That request is no longer waiting for you.',
  friendship_not_found: 'That friendship has already ended.',
  empty_message: 'Write something first.',
  message_too_long: `A letter can be at most ${MESSAGE_MAX_LENGTH} characters.`,
  not_friends: 'Letters can only go to friends.',
  sender_has_no_city: 'Choose your city first. Your bats need to know where home is.',
  recipient_has_no_city: 'Your friend has not chosen a city yet, so no bat can find them.',
  no_available_bat: 'All your bats are out flying. One will be home soon.',
  message_not_found: 'That letter could not be found.',
  // Handled by starting the list again; the words show only if that fails too.
  cursor_not_found: 'Your letters have changed. Pull down to see them again.',
  courier_blocked: 'You have blocked that courier. Unblock them in your profile first.',
  courier_not_found: 'That courier could not be found.',
  cannot_block_self: 'That is you.',
  cannot_report_self: 'That is you.',
  unknown_reason: 'Choose what is wrong first.',
  note_too_long: `A note can be at most ${REPORT_NOTE_MAX_LENGTH} characters.`,
  try_again: 'That did not go through. Try again.',
} as const;

export type RefusalReason = keyof typeof REFUSALS;

export class RpcError extends Error {
  /** Why the database refused, when it said; null for anything unexpected. */
  readonly reason: RefusalReason | null;

  constructor(message: string, reason: RefusalReason | null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RpcError';
    this.reason = reason;
  }
}

/** The shape of a PostgREST error, which is all this needs from it. */
export type ApiError = {
  message: string;
  code?: string | null;
  hint?: string | null;
};

function isRefusal(hint: string | null | undefined): hint is RefusalReason {
  // An own-property check, so a hint of "toString" is not mistaken for a reason.
  return typeof hint === 'string' && Object.prototype.hasOwnProperty.call(REFUSALS, hint);
}

/**
 * Turns an API error into one whose message can be shown as it is.
 *
 * `fallback` describes what failed, in the terms of the screen that asked -
 * "Your letters could not be loaded." - and is used for anything that is not a
 * refusal the app knows. The original error is kept as `cause`, so an
 * unexpected failure is still diagnosable from a debugger.
 */
export function toRpcError(error: ApiError, fallback: string): RpcError {
  if (isRefusal(error.hint)) {
    return new RpcError(REFUSALS[error.hint], error.hint, { cause: error });
  }

  const message = error.message.toLowerCase();
  if (message.includes('network') || message.includes('fetch')) {
    return new RpcError('No connection. Check your network and try again.', null, {
      cause: error,
    });
  }
  // `not authenticated` from the database, or an expired token from PostgREST.
  if (error.code === '28000' || error.code === 'PGRST301' || message.includes('jwt')) {
    return new RpcError('Your session has ended. Sign in again.', null, { cause: error });
  }

  return new RpcError(fallback, null, { cause: error });
}

/** A message for anything thrown, whatever it turned out to be. */
export function messageOf(error: unknown, fallback = 'Something went wrong.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
