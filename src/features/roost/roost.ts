import { toRpcError } from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

/**
 * The roost: the courier's three bats, and where the ones in the air are going.
 *
 * Nothing here decides anything. Which bat flies, and when it lands, are the
 * server's answers; this module only reads them. `get_roost` also lands any
 * letter of the caller's whose time has come before it answers, so a countdown
 * that has reached zero is resolved by fetching again.
 */

export type BatStatus = 'available' | 'flying';

export type Person = {
  id: string;
  username: string;
  displayName: string;
};

export type Flight = {
  messageId: string;
  recipient: Person;
  sentAt: Date;
  /** When the bat lands. Set by the server when the letter was sent. */
  deliverAt: Date;
  distanceKm: number;
};

export type Bat = {
  id: string;
  /** 1, 2 or 3. Stable, so a bat keeps its place in the roost. */
  slot: number;
  status: BatStatus;
  /** Present exactly when the bat is flying. */
  flight: Flight | null;
};

/** One row of `get_roost()`, with the nullability the SQL actually has. */
export type RoostRow = {
  bat_id: string;
  slot: number;
  status: string;
  message_id: string | null;
  recipient_id: string | null;
  recipient_username: string | null;
  recipient_display_name: string | null;
  sent_at: string | null;
  deliver_at: string | null;
  distance_km: number | null;
};

export function toBat(row: RoostRow): Bat {
  const flight =
    row.message_id && row.recipient_id && row.sent_at && row.deliver_at
      ? {
          messageId: row.message_id,
          recipient: {
            id: row.recipient_id,
            username: row.recipient_username ?? '',
            // Withheld for someone the courier has blocked: their username, then.
            displayName:
              row.recipient_display_name ??
              (row.recipient_username ? `@${row.recipient_username}` : ''),
          },
          sentAt: new Date(row.sent_at),
          deliverAt: new Date(row.deliver_at),
          distanceKm: row.distance_km ?? 0,
        }
      : null;

  return {
    id: row.bat_id,
    slot: row.slot,
    // The two states the schema allows. A flying bat whose flight is missing
    // cannot happen while the database's invariants hold; if it ever did, it is
    // shown as flying with no detail rather than as home and sendable.
    status: row.status === 'flying' ? 'flying' : 'available',
    flight,
  };
}

export async function fetchRoost(): Promise<Bat[]> {
  const { data, error } = await supabase.rpc('get_roost');
  if (error) throw toRpcError(error, 'Your roost could not be loaded. Check your connection.');
  return ((data ?? []) as RoostRow[]).map(toBat).sort((a, b) => a.slot - b.slot);
}

export function countAtHome(bats: readonly Bat[]): number {
  return bats.filter((bat) => bat.status === 'available').length;
}

/** When the next bat lands, or null if none is in the air. */
export function nextHomecoming(bats: readonly Bat[]): Date | null {
  let soonest: Date | null = null;
  for (const bat of bats) {
    const landing = bat.flight?.deliverAt;
    if (landing && (!soonest || landing < soonest)) soonest = landing;
  }
  return soonest;
}
