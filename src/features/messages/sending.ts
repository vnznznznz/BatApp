import {
  forgetDraft,
  noteSend,
  readDraft,
  readSend,
  type Unanswered,
} from '@/features/messages/drafts';
import {
  fetchSentLetter,
  prepareBody,
  sendMessage,
  type Dispatch,
} from '@/features/messages/messages';
import { roostChanged } from '@/features/roost/roost';
import { RpcError } from '@/lib/rpc-error';
import { randomUuid } from '@/lib/uuid';

/**
 * Sending a letter, from the press of the button to knowing what became of it.
 *
 * This does not live in the compose screen, because a send can outlast it: the
 * courier may leave while the button is still spinning. What became of the
 * letter is noted with its words (see drafts.ts) and told to whoever is
 * listening, which is every screen showing that letter - the one that started
 * the send, if it is still there, and one opened since.
 *
 * A send that fails without a refusal from the server - the connection was
 * lost, the answer took too long - has not failed: nobody knows what became of
 * it. The letter may be stored and on its way. Telling the courier it did not
 * go is how a corrected letter left as a second one, on a second bat. (Found
 * in review.) So the server is asked what went out under the letter's
 * reference: straight after such a failure, and again before any other words
 * may go out under a reference of their own. Until it has answered, no new
 * reference is made.
 */

/**
 * Who a letter is for and where it travels, in the words the confirmation
 * uses. Fixed when the send starts, so that the confirmation can still name
 * them if the list of friends has changed by the time the answer comes.
 */
export type Addressee = {
  id: string;
  name: string;
  /** Their city, and the one the bat leaves from; null where it is not known. */
  city: string | null;
  from: string | null;
};

export type Outcome =
  | {
      /** The letter went. `dispatch` is the server's answer for it. */
      kind: 'sent';
      to: Addressee;
      dispatch: Dispatch;
      /**
       * True when the letter had left on an earlier attempt and its landing time
       * has passed. Never for a letter sent this moment, whatever the phone's
       * clock makes of its landing time.
       */
      arrived: boolean;
      /** True when the words now written are not the ones that went. They are kept. */
      changed: boolean;
    }
  /** The letter did not go. `message` says why, or that it did not. */
  | { kind: 'held'; message: string }
  /** No answer, and no way of asking yet. It is noted with the letter as unanswered. */
  | { kind: 'unknown' };

type Listener = (courierId: string, recipientId: string, outcome: Outcome) => void;

const listeners = new Set<Listener>();

/** Calls `listener` with what became of each send, until the returned function is called. */
export function onLetterOutcome(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function tell(courierId: string, recipientId: string, outcome: Outcome) {
  listeners.forEach((listener) => listener(courierId, recipientId, outcome));
}

/** Bounds on the pause before asking again what became of an unanswered send. */
const MIN_PAUSE_MS = 2000;
const MAX_PAUSE_MS = 60_000;

/**
 * When to ask next: after a pause that grows with how long the question has
 * been open, from two seconds to a minute. Soon enough to notice a connection
 * that is back at once, and seldom enough for a phone left underground.
 */
function nextAsk(since: number): number {
  const now = Date.now();
  return now + Math.min(Math.max(Math.round((now - since) / 2), MIN_PAUSE_MS), MAX_PAUSE_MS);
}

const COULD_NOT_ASK = Symbol('could not ask');

/** The letter that went out under `ref`, null if none did - or that it could not be asked. */
async function ask(ref: string): Promise<Dispatch | null | typeof COULD_NOT_ASK> {
  try {
    return await fetchSentLetter(ref);
  } catch {
    return COULD_NOT_ASK;
  }
}

const hasLanded = (dispatch: Dispatch) => dispatch.deliverAt.getTime() <= Date.now();

/** Whether what is written now is another letter than the one that went: not the same, and not nothing. */
const isAnotherLetter = (written: string, sent: string) => written !== '' && written !== sent;

/**
 * Sends the letter to `to` as it now stands, and tells whoever is listening
 * what became of it. Returns once that is known, or known not to be knowable
 * yet.
 */
export async function sendLetter(courierId: string, to: Addressee): Promise<void> {
  const before = readSend(courierId, to.id);
  // The button disables itself while busy, but a second tap can land in the
  // same frame as the first, and another screen may have this very letter on
  // its way out. A letter costs a bat; this makes sure it is one.
  if (before.busy) return;

  const words = prepareBody(readDraft(courierId, to.id));
  noteSend(courierId, to.id, { busy: true });
  let outcome: Outcome | null = null;
  let unanswered = before.unanswered;
  try {
    ({ outcome, unanswered } = await carry(to, words, before.unanswered));
  } finally {
    // Noted whether or not any screen is still there to hear of it: a letter
    // that went is no longer unsent, and one that may have gone keeps its
    // reference for whoever opens it next.
    if (outcome?.kind === 'sent' && !outcome.changed) {
      forgetDraft(courierId, to.id);
    } else {
      noteSend(courierId, to.id, { busy: false, unanswered });
    }
    // And the roost is told, however it ended: a bat has left, or may have,
    // or one that looked free was not. The screen underneath has usually
    // asked already, a moment too early.
    roostChanged();
  }
  tell(courierId, to.id, outcome);
}

/**
 * The send itself: what became of the letter, and what is left unanswered
 * about it. `earlier` is a send of this letter that never was answered.
 */
async function carry(
  to: Addressee,
  words: string,
  earlier: Unanswered | null,
): Promise<{ outcome: Outcome; unanswered: Unanswered | null }> {
  let open = earlier;

  // Other words went out before and were never answered. Before these may go
  // under a reference of their own, find out what became of those - again,
  // even if the server said earlier that it had no such letter: asked straight
  // after a failure, it may not have had it yet.
  if (open && open.words !== words) {
    const found = await ask(open.ref);
    if (found === COULD_NOT_ASK) {
      return {
        outcome: { kind: 'unknown' },
        unanswered: { ...open, unknown: true, askAt: nextAsk(open.since) },
      };
    }
    if (found) {
      return {
        outcome: {
          kind: 'sent',
          to,
          dispatch: found,
          arrived: hasLanded(found),
          changed: isAnotherLetter(words, open.words),
        },
        unanswered: null,
      };
    }
    // It did not go. These words are a different letter, and owe it nothing.
    open = null;
  }

  // The same reference for the same words: the server answers a reference it
  // knows with the letter that went, instead of sending a copy on a second bat.
  const ref = open?.ref ?? randomUuid();
  try {
    const dispatch = await sendMessage(to.id, words, ref);
    return {
      outcome: {
        kind: 'sent',
        to,
        dispatch,
        // Only a reference used before can be answered with an older letter.
        arrived: open !== null && hasLanded(dispatch),
        changed: false,
      },
      unanswered: null,
    };
  } catch (caught) {
    if (caught instanceof RpcError && caught.reason !== null) {
      // Refused, with a reason: the server looked, and made no letter of this.
      // That also answers whatever was open about the same reference.
      return {
        outcome: { kind: 'held', message: caught.message },
        unanswered: open ? { ...open, unknown: false } : null,
      };
    }

    // No answer. The letter may have gone all the same, so ask.
    const since = Date.now();
    const found = await ask(ref);
    if (found === COULD_NOT_ASK) {
      return {
        outcome: { kind: 'unknown' },
        unanswered: { ref, words, unknown: true, since, askAt: nextAsk(since) },
      };
    }
    if (found) {
      return {
        outcome: { kind: 'sent', to, dispatch: found, arrived: hasLanded(found), changed: false },
        unanswered: null,
      };
    }
    // It did not go. That is what is said, not how the send failed: the server
    // has just answered, so "No connection" would no longer be true. (Found in
    // review.) The reference is kept: the same words go out under it again,
    // and it is asked after once more before other words go.
    return {
      outcome: { kind: 'held', message: 'Your letter did not go. It is still here to send.' },
      unanswered: { ref, words, unknown: false, since, askAt: since },
    };
  }
}

/** The letters being asked after at this moment, so that each is asked after once at a time. */
const asking = new Set<string>();

/**
 * Asks again what became of a send that was never answered, without anything
 * on screen waiting for it. Does nothing unless that is still not known.
 */
export async function askAfterLetter(courierId: string, to: Addressee): Promise<void> {
  const { busy, unanswered } = readSend(courierId, to.id);
  if (busy || !unanswered?.unknown || asking.has(unanswered.ref)) return;

  asking.add(unanswered.ref);
  const found = await ask(unanswered.ref);
  asking.delete(unanswered.ref);

  // Only if nothing has happened to the letter meanwhile. A send started since
  // makes this answer out of date - "no such letter" from before it could be
  // untrue by now - and that send will find out for itself.
  const now = readSend(courierId, to.id);
  if (now.busy || now.unanswered !== unanswered) return;

  if (found === COULD_NOT_ASK) {
    noteSend(courierId, to.id, {
      unanswered: { ...unanswered, askAt: nextAsk(unanswered.since) },
    });
    return;
  }

  if (!found) {
    noteSend(courierId, to.id, { unanswered: { ...unanswered, unknown: false } });
    tell(courierId, to.id, {
      kind: 'held',
      message: 'Your letter did not go after all. It is still here to send.',
    });
    return;
  }

  // It went. Words changed since stay as a letter of their own, for the
  // courier to decide about.
  const changed = isAnotherLetter(prepareBody(readDraft(courierId, to.id)), unanswered.words);
  if (changed) {
    noteSend(courierId, to.id, { unanswered: null });
  } else {
    forgetDraft(courierId, to.id);
  }
  roostChanged();
  tell(courierId, to.id, {
    kind: 'sent',
    to,
    dispatch: found,
    arrived: hasLanded(found),
    changed,
  });
}

/**
 * Asks after the letter at `when`, or at once if that has passed - as it has
 * when a screen is opened onto the letter some time later. Returns a way to
 * call it off, for a screen that is leaving.
 */
export function askAfterLetterAt(when: number, courierId: string, to: Addressee): () => void {
  const timer = setTimeout(
    () => void askAfterLetter(courierId, to),
    Math.max(0, when - Date.now()),
  );
  return () => clearTimeout(timer);
}
