import { useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Letters that have been started and not sent.
 *
 * The words of a letter used to live in the compose screen alone, so every way
 * out of it threw them away without a question: the header's arrow, a swipe
 * from the edge, Android's back button - and going back to read once more the
 * letter being answered. They are kept here instead, one unsent letter for each
 * friend, for as long as the app stays open. (Found in review.)
 *
 * Beside the words is kept how the sending of them stands, because a send can
 * end without an answer and the screen that started it can be gone by then.
 * Whichever screen shows the letter next has to know that it may already have
 * left, and under which reference, or it would send it again as a new letter.
 *
 * In memory only, and that is deliberate. The privacy policy says that a letter
 * you have started is gone when you close the app, and that nothing but the
 * session is stored on the device. Writing these to a file or to the keychain
 * would make both untrue.
 *
 * Kept apart for each account, under the id of whoever is signed in, so that a
 * second person using the same phone is never shown the first one's words - and
 * all of it is forgotten the moment anyone signs out.
 */

/**
 * A send that ended without the server saying what became of it: the connection
 * was lost, or the answer took too long. The letter may have gone all the same.
 */
export type Unanswered = {
  /** The reference it went out under. If it went, the server knows it by this. */
  ref: string;
  /** Its words, as they were sent. */
  words: string;
  /**
   * True until the server could be asked what became of it. False once it has
   * said that no letter went out under `ref` - and the record is kept even
   * then: the same words go out under the same reference again, and it is asked
   * after once more before other words go out under a new one.
   */
  unknown: boolean;
  /** When the send ended without an answer. */
  since: number;
  /** While unknown: when to ask next. */
  askAt: number;
};

/** How the sending of an unsent letter stands. */
export type SendState = {
  /** True while a send of it, or the asking that comes before one, is under way. */
  busy: boolean;
  unanswered: Unanswered | null;
};

type UnsentLetter = { text: string; send: SendState };

const IDLE: SendState = Object.freeze({ busy: false, unanswered: null });

/** Each account's unsent letters, by the friend they are for. */
const letters = new Map<string, Map<string, UnsentLetter>>();
const listeners = new Set<() => void>();
let listening = false;

function changed() {
  listeners.forEach((notify) => notify());
}

/**
 * Asks the client, once, to say when someone signs out. Not done on import: a
 * module that only holds words should not reach for the session until there is
 * a word to forget.
 */
function listenForSignOut() {
  if (listening) return;
  listening = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') forgetAllDrafts();
  });
}

function find(
  courierId: string | undefined,
  recipientId: string | undefined,
): UnsentLetter | undefined {
  if (!courierId || !recipientId) return undefined;
  return letters.get(courierId)?.get(recipientId);
}

/** The words kept for a letter to this friend, exactly as written; none is ''. */
export function readDraft(courierId: string | undefined, recipientId: string | undefined): string {
  return find(courierId, recipientId)?.text ?? '';
}

/** Keeps the words as they now stand. Called for every change to them. */
export function keepDraft(
  courierId: string | undefined,
  recipientId: string | undefined,
  text: string,
): void {
  if (!courierId || !recipientId) return;
  listenForSignOut();
  const own = letters.get(courierId) ?? new Map<string, UnsentLetter>();
  own.set(recipientId, { text, send: own.get(recipientId)?.send ?? IDLE });
  letters.set(courierId, own);
  changed();
}

/**
 * How the sending of the letter to this friend stands. The same object each
 * time until something about it changes, and the very record of an unanswered
 * send that was noted: whoever is waiting for an answer recognises by it that
 * nothing has happened to the letter meanwhile.
 */
export function readSend(
  courierId: string | undefined,
  recipientId: string | undefined,
): SendState {
  return find(courierId, recipientId)?.send ?? IDLE;
}

/**
 * Notes a change in how the sending stands. Only for a letter that is still
 * kept: an answer can come back after a sign-out has cleared everything, and
 * must not bring a letter back for an account that has left.
 */
export function noteSend(courierId: string, recipientId: string, change: Partial<SendState>): void {
  const letter = find(courierId, recipientId);
  if (!letter) return;
  letters.get(courierId)?.set(recipientId, { ...letter, send: { ...letter.send, ...change } });
  changed();
}

/** For a letter that has been sent: there is nothing unsent left of it. */
export function forgetDraft(courierId: string | undefined, recipientId: string | undefined): void {
  if (!courierId || !recipientId) return;
  letters.get(courierId)?.delete(recipientId);
  changed();
}

/** Every unsent letter of every account. For a sign-out; tests start clean with it too. */
export function forgetAllDrafts(): void {
  letters.clear();
  changed();
}

/** Calls `listener` whenever any unsent letter changes or goes, until the returned function is called. */
export function subscribeToDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const nothing = () => '';
const idle = () => IDLE;

/**
 * The words of the unsent letter to this friend, as they are now. The store is
 * the only place they are held, so a screen showing them is always showing
 * what will still be there when it is opened again.
 */
export function useDraft(courierId: string | undefined, recipientId: string | undefined): string {
  return useSyncExternalStore(subscribeToDrafts, () => readDraft(courierId, recipientId), nothing);
}

/**
 * How the sending of the letter to this friend stands, as it is now - whichever
 * screen started the send. A screen opened while a letter is still on its way
 * out shows it so, rather than offering to send it again.
 */
export function useSend(courierId: string | undefined, recipientId: string | undefined): SendState {
  return useSyncExternalStore(subscribeToDrafts, () => readSend(courierId, recipientId), idle);
}
