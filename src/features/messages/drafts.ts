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
 * In memory only, and that is deliberate. The privacy policy says that a letter
 * you have started is gone when you close the app, and that nothing but the
 * session is stored on the device. Writing these to a file or to the keychain
 * would make both untrue.
 *
 * Kept apart for each account, under the id of whoever is signed in, so that a
 * second person using the same phone is never shown the first one's words - and
 * all of it is forgotten the moment anyone signs out.
 */

/** Each account's unsent letters, by the friend they are for. */
const letters = new Map<string, Map<string, string>>();
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

/** The words kept for a letter to this friend, exactly as written; none is ''. */
export function readDraft(courierId: string | undefined, recipientId: string | undefined): string {
  if (!courierId || !recipientId) return '';
  return letters.get(courierId)?.get(recipientId) ?? '';
}

/** Keeps the words as they now stand. Called for every change to them. */
export function keepDraft(
  courierId: string | undefined,
  recipientId: string | undefined,
  text: string,
): void {
  if (!courierId || !recipientId) return;
  listenForSignOut();
  const own = letters.get(courierId) ?? new Map<string, string>();
  own.set(recipientId, text);
  letters.set(courierId, own);
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

/**
 * The words of the unsent letter to this friend, as they are now. The store is
 * the only place they are held, so a screen showing them is always showing
 * what will still be there when it is opened again.
 */
export function useDraft(courierId: string | undefined, recipientId: string | undefined): string {
  return useSyncExternalStore(subscribeToDrafts, () => readDraft(courierId, recipientId), nothing);
}
