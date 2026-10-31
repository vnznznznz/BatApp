import { MESSAGE_MAX_LENGTH } from '@/constants/config';
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
  displayName: string;
};

export type Place = { name: string; countryCode: string };

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

/** Letters per page in either list. The server caps a page at 100. */
export const PAGE_SIZE = 30;

/* -------------------------------------------------------------------------- */
/* Rows, with the nullability the SQL actually has                             */
/* -------------------------------------------------------------------------- */

export type InboxRow = {
  message_id: string;
  sender_id: string;
  sender_username: string;
  sender_display_name: string;
  origin_city_name: string;
  origin_country_code: string;
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
  recipient_display_name: string;
  destination_city_name: string;
  destination_country_code: string;
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
  other_display_name: string;
  origin_city_name: string;
  origin_country_code: string;
  destination_city_name: string;
  destination_country_code: string;
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
    origin: { name: row.origin_city_name, countryCode: row.origin_country_code },
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
    destination: { name: row.destination_city_name, countryCode: row.destination_country_code },
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
    origin: { name: row.origin_city_name, countryCode: row.origin_country_code },
    destination: { name: row.destination_city_name, countryCode: row.destination_country_code },
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

/** Mirrors the database's checks, so a mistake is caught before a round trip. */
export function validateBody(text: string): string | null {
  const body = prepareBody(text);
  if (!body) return 'Write something first.';
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

export async function sendMessage(recipientId: string, text: string): Promise<Dispatch> {
  const { data, error } = await supabase
    .rpc('send_message', { recipient_id: recipientId, body: prepareBody(text) })
    .single();
  if (error) throw toRpcError(error, 'Your letter could not be sent. Check your connection.');

  const row = data as { message_id: string; deliver_at: string; distance_km: number };
  return {
    id: row.message_id,
    deliverAt: new Date(row.deliver_at),
    distanceKm: row.distance_km,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/** One page of landed letters, newest first. Pass the last id for the next page. */
export async function fetchInbox(olderThan?: string): Promise<ReceivedLetter[]> {
  const { data, error } = await supabase.rpc('list_inbox', {
    max_results: PAGE_SIZE,
    older_than: olderThan,
  });
  if (error) throw toRpcError(error, 'Your letters could not be loaded. Check your connection.');
  return ((data ?? []) as InboxRow[]).map(toReceivedLetter);
}

/** One page of the letters you sent, in the air and landed, newest first. */
export async function fetchSent(olderThan?: string): Promise<SentLetter[]> {
  const { data, error } = await supabase.rpc('list_sent', {
    max_results: PAGE_SIZE,
    older_than: olderThan,
  });
  if (error) throw toRpcError(error, 'Your letters could not be loaded. Check your connection.');
  return ((data ?? []) as SentRow[]).map(toSentLetter);
}

/** A whole letter. Reading a received one marks it opened, for your inbox only. */
export async function readMessage(id: string): Promise<Letter> {
  const { data, error } = await supabase.rpc('read_message', { message_id: id }).single();
  if (error) throw toRpcError(error, 'That letter could not be opened. Check your connection.');
  return toLetter(data as LetterRow);
}

export async function fetchBadges(): Promise<Badges> {
  const { data, error } = await supabase.rpc('get_badges').single();
  if (error) throw toRpcError(error, 'Could not check for new letters.');
  const row = data as { unread_messages: number; friend_requests: number };
  return { unreadLetters: row.unread_messages, friendRequests: row.friend_requests };
}

/** "Anna" - or their username if, somehow, they have no name to show. */
export function correspondentName(person: Pick<Correspondent, 'displayName' | 'username'>): string {
  return person.displayName || `@${person.username}`;
}
