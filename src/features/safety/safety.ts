import { REPORT_NOTE_MAX_LENGTH, REPORT_REASONS } from '@/constants/config';
import { toRpcError } from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

/**
 * Blocking and reporting.
 *
 * What a block does is decided by the database (see the safety migration): it
 * ends whatever was between the two, keeps the blocked courier from asking
 * again, and hides their letters from the blocker until it is lifted. Nothing
 * tells the blocked courier. A report goes to the people who run the service,
 * with a copy of what it is about.
 */

export type ReportReason = (typeof REPORT_REASONS)[number];

/** How each reason reads on the report screen, in the order it is offered. */
export const REASON_LABELS: Readonly<Record<ReportReason, string>> = {
  spam: 'Spam or a scam',
  harassment: 'Harassment or bullying',
  hate: 'Hate speech',
  sexual: 'Sexual content',
  violence: 'Threats or violence',
  other: 'Something else',
};

export type BlockedCourier = {
  id: string;
  username: string;
  blockedAt: Date;
};

export type BlockedRow = {
  courier_id: string;
  username: string;
  blocked_at: string;
};

export function toBlockedCourier(row: BlockedRow): BlockedCourier {
  return { id: row.courier_id, username: row.username, blockedAt: new Date(row.blocked_at) };
}

export type BlockOutcome = 'blocked' | 'already_blocked';
export type ReportOutcome = 'reported' | 'already_reported';

export async function blockCourier(courierId: string): Promise<BlockOutcome> {
  const { data, error } = await supabase.rpc('block_courier', { courier_id: courierId });
  if (error) throw toRpcError(error, 'That courier could not be blocked. Try again.');
  return data === 'already_blocked' ? 'already_blocked' : 'blocked';
}

/** Lifts a block. Lifting one that is not there does nothing, and is no error. */
export async function unblockCourier(courierId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_courier', { courier_id: courierId });
  if (error) throw toRpcError(error, 'That courier could not be unblocked. Try again.');
}

export async function fetchBlocked(): Promise<BlockedCourier[]> {
  const { data, error } = await supabase.rpc('list_blocked');
  if (error) throw toRpcError(error, 'Your blocked couriers could not be loaded.');
  return ((data ?? []) as BlockedRow[]).map(toBlockedCourier);
}

export type Report = {
  reason: ReportReason;
  /** What the reporter typed; prepared before it is sent. */
  note: string;
  alsoBlock: boolean;
};

/** Reports a letter that has landed for the caller. */
export async function reportLetter(letterId: string, report: Report): Promise<ReportOutcome> {
  const { data, error } = await supabase.rpc('report_letter', {
    message_id: letterId,
    reason: report.reason,
    ...noteArgument(report.note),
    also_block: report.alsoBlock,
  });
  if (error) throw toRpcError(error, 'The report could not be sent. Check your connection.');
  return data === 'already_reported' ? 'already_reported' : 'reported';
}

/** Reports a courier: a request from a stranger, a name chosen to hurt. */
export async function reportCourier(courierId: string, report: Report): Promise<ReportOutcome> {
  const { data, error } = await supabase.rpc('report_courier', {
    courier_id: courierId,
    reason: report.reason,
    ...noteArgument(report.note),
    also_block: report.alsoBlock,
  });
  if (error) throw toRpcError(error, 'The report could not be sent. Check your connection.');
  return data === 'already_reported' ? 'already_reported' : 'reported';
}

/** The note as it is sent: trimmed, and left out when there is nothing in it. */
export function prepareNote(text: string): string {
  return text.trim();
}

function noteArgument(text: string): { note?: string } {
  const note = prepareNote(text);
  return note ? { note } : {};
}

/** Counted in code points, as the database's char_length counts them. */
export function noteLength(text: string): number {
  return [...prepareNote(text)].length;
}

export function validateNote(text: string): string | null {
  return noteLength(text) > REPORT_NOTE_MAX_LENGTH
    ? `A note can be at most ${REPORT_NOTE_MAX_LENGTH} characters.`
    : null;
}
