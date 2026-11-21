import { MESSAGE_MAX_LENGTH, VISIBLE_CHARACTER_PATTERN } from '@/constants/config';
import { toRpcError } from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

/**
 * Letters: sending one, and reading the ones that have landed.
 *
 * The client names a recipient and supplies the words. Everything else - which
 * bat, how far, when it lands - is decided by `send_message` in the database
 * and only reported back here. Reading goes through functions that return
 * exactly what each side of a letter may see: the recipient sees nothing until
 * it lands, and the sender never learns whether it has been opened.
 *
 * In the interface these are letters; in the schema, messages.
 */

export type Correspondent = {
  id: string;
  username: string;
  /** Null when withheld: someone you have blocked is shown by username alone. */
  displayName: string | null;
};

export type Place = {
  name: string;
  countryCode: string;
  /** Where it is, if another town in the country has its name: "near Augsburg". */
  qualifier?: string | null;
};

export type ReceivedLetter = {
  id: string;
  sender: Correspondent;
  origin: Place;
  distanceKm: number;
  sentAt: Date;
  /** When the bat landed - the scheduled arrival, not when the server noticed. */
  arrivedAt: Date;
  /** For the recipient's own unread marker. Never shown to the sender. */
  openedAt: Date | null;
  preview: string;
};

export type SentLetter = {
  id: string;
  recipient: Correspondent;
  destination: Place;
  distanceKm: number;
  sentAt: Date;
  deliverAt: Date;
  delivered: boolean;
  preview: string;
};

export type Letter = {
  id: string;
  direction: 'received' | 'sent';
  /** The other person: the sender of a received letter, the recipient of a sent one. */
  other: Correspondent;
  origin: Place;
  destination: Place;
  distanceKm: number;
  sentAt: Date;
  deliverAt: Date;
  delivered: boolean;
  /** Received letters only. Always null on a letter you sent. */
  openedAt: Date | null;
  body: string;
};

export type Badges = {
  unreadLetters: number;
  friendRequests: number;
};

/** Letters per page in either list. */
export const PAGE_SIZE = 30;

/** The most letters one request returns: `max_results` is capped at this in SQL. */
export const MAX_PAGE_SIZE = 100;

/** How much of a letter a list shows: the lists cut `preview` here in SQL. */
export const PREVIEW_LENGTH = 200;

/* -------------------------------------------------------------------------- */
/* Rows, with the nullability the SQL actually has                             */
/* -------------------------------------------------------------------------- */

// Each `..._qualifier` is null for a city whose name is its own in its
// country, and absent from a database older than the city qualifiers
// migration.

export type InboxRow = {
  message_id: string;
  sender_id: string;
  sender_username: string;
  sender_display_name: string;
  origin_city_name: string;
  origin_country_code: string;
  origin_qualifier?: string | null;
  distance_km: number;
  sent_at: string;
  arrived_at: string;
  opened_at: string | null;
  preview: string;
};

export type SentRow = {
  message_id: string;
  recipient_id: string;
  recipient_username: string;
  /** Null for a recipient the caller has blocked. */
  recipient_display_name: string | null;
  destination_city_name: string;
  destination_country_code: string;
  destination_qualifier?: string | null;
  distance_km: number;
  sent_at: string;
  deliver_at: string;
  delivered: boolean;
  preview: string;
};

export type LetterRow = {
  id: string;
  direction: string;
  other_id: string;
  other_username: string;
  /** Null for someone the caller has blocked. */
  other_display_name: string | null;
  origin_city_name: string;
  origin_country_code: string;
  origin_qualifier?: string | null;
  destination_city_name: string;
  destination_country_code: string;
  destination_qualifier?: string | null;
  distance_km: number;
  sent_at: string;
  deliver_at: string;
  delivered: boolean;
  opened_at: string | null;
  body: string;
};

export function toReceivedLetter(row: InboxRow): ReceivedLetter {
  return {
    id: row.message_id,
    sender: {
      id: row.sender_id,
      username: row.sender_username,
      displayName: row.sender_display_name,
    },
    origin: {
      name: row.origin_city_name,
      countryCode: row.origin_country_code,
      qualifier: row.origin_qualifier,
    },
    distanceKm: row.distance_km,
    sentAt: new Date(row.sent_at),
    arrivedAt: new Date(row.arrived_at),
    openedAt: row.opened_at ? new Date(row.opened_at) : null,
    preview: row.preview,
  };
}

export function toSentLetter(row: SentRow): SentLetter {
  return {
    id: row.message_id,
    recipient: {
      id: row.recipient_id,
      username: row.recipient_username,
      displayName: row.recipient_display_name,
    },
    destination: {
      name: row.destination_city_name,
      countryCode: row.destination_country_code,
      qualifier: row.destination_qualifier,
    },
    distanceKm: row.distance_km,
    sentAt: new Date(row.sent_at),
    deliverAt: new Date(row.deliver_at),
    delivered: row.delivered,
    preview: row.preview,
  };
}

export function toLetter(row: LetterRow): Letter {
  return {
    id: row.id,
    direction: row.direction === 'sent' ? 'sent' : 'received',
    other: {
      id: row.other_id,
      username: row.other_username,
      displayName: row.other_display_name,
    },
    origin: {
      name: row.origin_city_name,
      countryCode: row.origin_country_code,
      qualifier: row.origin_qualifier,
    },
    destination: {
      name: row.destination_city_name,
      countryCode: row.destination_country_code,
      qualifier: row.destination_qualifier,
    },
    distanceKm: row.distance_km,
    sentAt: new Date(row.sent_at),
    deliverAt: new Date(row.deliver_at),
    delivered: row.delivered,
    openedAt: row.opened_at ? new Date(row.opened_at) : null,
    body: row.body,
  };
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The length the database measures. Postgres counts characters, JavaScript's
 * `length` counts UTF-16 units, and the two disagree on every emoji; counting
 * code points here makes the counter on screen agree with the server's limit.
 */
export function letterLength(text: string): number {
  return Array.from(text).length;
}

/** Leading and trailing blank space is dropped; everything between is kept as written. */
export function prepareBody(text: string): string {
  return text.trim();
}

/**
 * The opening of a letter not sent yet, cut as the server cuts the preview of
 * one that was - by characters as the database counts them, so never through
 * the middle of an emoji.
 */
export function previewOf(text: string): string {
  return Array.from(prepareBody(text)).slice(0, PREVIEW_LENGTH).join('');
}

/**
 * A letter's opening, run together for a two-line preview. Letters start with
 * "Dear Ben," and a blank line; kept as written, the preview would show the
 * greeting and then nothing.
 */
export function asOneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Mirrors the database's checks, so a mistake is caught before a round trip. */
export function validateBody(text: string): string | null {
  const body = prepareBody(text);
  // Something to see, as the database asks: trimming leaves a zero-width
  // space, a soft hyphen or a blank braille pattern, and a letter of nothing
  // else passed here only to be refused by the server.
  if (!VISIBLE_CHARACTER_PATTERN.test(body)) return 'Write something first.';
  if (letterLength(body) > MESSAGE_MAX_LENGTH) {
    return `A letter can be at most ${MESSAGE_MAX_LENGTH} characters.`;
  }
  return null;
}

export type Dispatch = {
  id: string;
  /** When it will land, as the server computed it. */
  deliverAt: Date;
  distanceKm: number;
};

/** What `send_message` and `sent_letter` both answer with. */
type DispatchRow = { message_id: string; deliver_at: string; distance_km: number };

function toDispatch(row: DispatchRow): Dispatch {
  return {
    id: row.message_id,
    deliverAt: new Date(row.deliver_at),
    distanceKm: row.distance_km,
  };
}

/**
 * Sends a letter. `clientRef` names this letter rather than this attempt: pass
 * the same one when retrying the same letter, so that a send whose answer was
 * lost - but which went - is answered with the letter that went instead of
 * spending a second bat on a copy.
 */
export async function sendMessage(
  recipientId: string,
  text: string,
  clientRef: string,
): Promise<Dispatch> {
  const { data, error } = await supabase
    .rpc('send_message', {
      recipient_id: recipientId,
      body: prepareBody(text),
      client_ref: clientRef,
    })
    .single();
  if (error) throw toRpcError(error, 'Your letter could not be sent. Check your connection.');
  return toDispatch(data as DispatchRow);
}

/**
 * The letter that went out under `clientRef`, or null if none did: what became
 * of a send that was never answered. The database waits for a send under the
 * same reference that is still running, so null means that none went, not that
 * one is about to.
 *
 * Throws when it could not ask. That must never be read as null: "could not
 * find out" taken for "nothing went" is how one letter leaves on two bats.
 */
export async function fetchSentLetter(clientRef: string): Promise<Dispatch | null> {
  const { data, error } = await supabase.rpc('sent_letter', { client_ref: clientRef });
  if (error) throw toRpcError(error, 'Could not find out whether your letter went.');

  const [row] = (data ?? []) as DispatchRow[];
  return row ? toDispatch(row) : null;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/** One page of landed letters, newest first. Pass the last id for the next page. */
export async function fetchInbox(
  olderThan?: string,
  limit: number = PAGE_SIZE,
): Promise<ReceivedLetter[]> {
  const { data, error } = await supabase.rpc('list_inbox', {
    max_results: limit,
    older_than: olderThan,
  });
  if (error) throw toRpcError(error, 'Your letters could not be loaded. Check your connection.');
  return ((data ?? []) as InboxRow[]).map(toReceivedLetter);
}

/** One page of the letters you sent, in the air and landed, newest first. */
export async function fetchSent(
  olderThan?: string,
  limit: number = PAGE_SIZE,
): Promise<SentLetter[]> {
  const { data, error } = await supabase.rpc('list_sent', {
    max_results: limit,
    older_than: olderThan,
  });
  if (error) throw toRpcError(error, 'Your letters could not be loaded. Check your connection.');
  return ((data ?? []) as SentRow[]).map(toSentLetter);
}

/**
 * A whole letter. Reading a received one marks it opened, for your inbox only -
 * and whoever is listening is told so (see `onLetterOpened`), once the server
 * has answered that it is.
 */
export async function readMessage(id: string): Promise<Letter> {
  const { data, error } = await supabase.rpc('read_message', { message_id: id }).single();
  if (error) throw toRpcError(error, 'That letter could not be opened. Check your connection.');

  const letter = toLetter(data as LetterRow);
  // Only a received letter ever comes back opened.
  if (letter.openedAt) letterOpened(letter.id);
  return letter;
}

const readers = new Set<(id: string) => void>();

/**
 * Calls `listener` with the id of each received letter the server has marked
 * opened, until the returned function is called.
 *
 * The inbox asks again when it comes back into view, but only for its newest
 * hundred letters; for one read farther down, this is how it learns that the
 * letter is no longer unread. It used to assume so when the row was tapped,
 * and a letter that then failed to open lost its mark while the server, and
 * the roost's count, still had it as unread. (Found in review.)
 */
export function onLetterOpened(listener: (id: string) => void): () => void {
  readers.add(listener);
  return () => {
    readers.delete(listener);
  };
}

/** Says that the server has marked this received letter opened. */
export function letterOpened(id: string): void {
  readers.forEach((notify) => notify(id));
}

export async function fetchBadges(): Promise<Badges> {
  const { data, error } = await supabase.rpc('get_badges').single();
  if (error) throw toRpcError(error, 'Could not check for new letters.');
  const row = data as { unread_messages: number; friend_requests: number };
  return { unreadLetters: row.unread_messages, friendRequests: row.friend_requests };
}

/** "Anna" - or "@anna" when there is no name to show, as for someone you have blocked. */
export function correspondentName(person: Pick<Correspondent, 'displayName' | 'username'>): string {
  return person.displayName || `@${person.username}`;
}
