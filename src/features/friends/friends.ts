import { normaliseUsername } from '@/features/auth/validation';
import { describeCity } from '@/features/cities/search';
import { formatDay, formatFlightEstimate, formatOnDay } from '@/lib/format';
import { toRpcError } from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

/**
 * Friends: asking by username, answering, and parting.
 *
 * What one courier may learn about another is decided by `list_friends()` in
 * the database, not here. In particular, a person you have asked shows no name
 * until they accept, and nobody's city is shown until a request is accepted -
 * so `displayName` and `city` below are genuinely optional, not merely unloaded.
 */

export type FriendshipStatus = 'pending' | 'accepted';

/** Who asked: `outgoing` if it was you. */
export type Direction = 'incoming' | 'outgoing';

export type FriendCity = { name: string; countryCode: string };

export type Friend = {
  id: string;
  username: string;
  /** Null while they have not yet accepted a request you sent. */
  displayName: string | null;
  /** Accepted friends only, and only once they have chosen one. */
  city: FriendCity | null;
};

export type Friendship = {
  id: string;
  status: FriendshipStatus;
  direction: Direction;
  friend: Friend;
  /**
   * How far a bat flies to reach them, and for how long - the server's numbers,
   * with the time multiplier applied. Null unless you are friends and you both
   * have a city.
   */
  route: { distanceKm: number; flightSeconds: number } | null;
  requestedAt: Date;
  acceptedAt: Date | null;
};

/** One row of `list_friends()`, with the nullability the SQL actually has. */
export type FriendshipRow = {
  friendship_id: string;
  status: string;
  direction: string;
  friend_id: string;
  username: string;
  display_name: string | null;
  city_name: string | null;
  country_code: string | null;
  distance_km: number | null;
  flight_seconds: number | null;
  requested_at: string;
  accepted_at: string | null;
};

export function toFriendship(row: FriendshipRow): Friendship {
  return {
    id: row.friendship_id,
    status: row.status === 'accepted' ? 'accepted' : 'pending',
    direction: row.direction === 'outgoing' ? 'outgoing' : 'incoming',
    friend: {
      id: row.friend_id,
      username: row.username,
      displayName: row.display_name,
      city:
        row.city_name && row.country_code
          ? { name: row.city_name, countryCode: row.country_code }
          : null,
    },
    route:
      row.distance_km !== null && row.flight_seconds !== null
        ? { distanceKm: row.distance_km, flightSeconds: row.flight_seconds }
        : null,
    requestedAt: new Date(row.requested_at),
    acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
  };
}

export async function fetchFriendships(): Promise<Friendship[]> {
  const { data, error } = await supabase.rpc('list_friends');
  if (error) throw toRpcError(error, 'Your friends could not be loaded. Check your connection.');
  return ((data ?? []) as FriendshipRow[]).map(toFriendship);
}

export type FriendGroups = {
  /** Accepted, alphabetical by name. */
  friends: Friendship[];
  /** Asked you, waiting for your answer; newest first. */
  incoming: Friendship[];
  /** You asked, waiting for theirs; newest first. */
  outgoing: Friendship[];
};

export function groupFriendships(list: readonly Friendship[]): FriendGroups {
  const newestFirst = (a: Friendship, b: Friendship) =>
    b.requestedAt.getTime() - a.requestedAt.getTime();

  return {
    friends: list
      .filter((f) => f.status === 'accepted')
      .sort((a, b) =>
        friendName(a.friend).localeCompare(friendName(b.friend), undefined, {
          sensitivity: 'base',
        }),
      ),
    incoming: list
      .filter((f) => f.status === 'pending' && f.direction === 'incoming')
      .sort(newestFirst),
    outgoing: list
      .filter((f) => f.status === 'pending' && f.direction === 'outgoing')
      .sort(newestFirst),
  };
}

/** The name to show: their own, or their username until they have shared it. */
export function friendName(friend: Pick<Friend, 'displayName' | 'username'>): string {
  return friend.displayName ?? `@${friend.username}`;
}

/**
 * "Munich, DE · about 6h 18m by bat" - where a friend is and how long a bat
 * takes to get there, or why that cannot be said yet.
 */
export function describeRoute(friendship: Friendship): string {
  const { city } = friendship.friend;
  if (!city) return 'Has not chosen a city yet';
  return friendship.route
    ? `${describeCity(city)} · ${formatFlightEstimate(friendship.route.flightSeconds)} by bat`
    : describeCity(city);
}

/** "Friends since 2 Oct", "Asked to be friends on 2 Oct", "You asked yesterday". */
export function describeStanding(friendship: Friendship, now: Date = new Date()): string {
  if (friendship.status === 'accepted') {
    return `Friends since ${formatDay(friendship.acceptedAt ?? friendship.requestedAt, now)}`;
  }
  return friendship.direction === 'incoming'
    ? `Asked to be friends ${formatOnDay(friendship.requestedAt, now)}`
    : `You asked ${formatOnDay(friendship.requestedAt, now)}`;
}

/** What `request_friend` reports, when it is not a refusal. */
export type RequestOutcome = 'requested' | 'already_requested' | 'accepted' | 'already_friends';

const OUTCOMES: readonly RequestOutcome[] = [
  'requested',
  'already_requested',
  'accepted',
  'already_friends',
];

export async function requestFriend(username: string): Promise<RequestOutcome> {
  const { data, error } = await supabase.rpc('request_friend', {
    username: normaliseUsername(username),
  });
  if (error) throw toRpcError(error, 'The request could not be sent. Check your connection.');

  const outcome = data as string;
  return (OUTCOMES as readonly string[]).includes(outcome)
    ? (outcome as RequestOutcome)
    : 'requested';
}

export function describeRequestOutcome(outcome: RequestOutcome, username: string): string {
  const handle = `@${normaliseUsername(username)}`;
  switch (outcome) {
    case 'requested':
      return `Request sent. Once ${handle} accepts, you can write to each other.`;
    case 'already_requested':
      return `You have already asked ${handle}. Their answer is up to them.`;
    case 'accepted':
      return `${handle} had already asked you, so you are now friends.`;
    case 'already_friends':
      return `You and ${handle} are already friends.`;
  }
}

export async function acceptFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_friend', { friendship_id: friendshipId });
  if (error) throw toRpcError(error, 'That request could not be accepted. Try again.');
}

/** Declines a request, withdraws one, or ends a friendship - the same act. */
export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', { friendship_id: friendshipId });
  if (error) throw toRpcError(error, 'That could not be done. Try again.');
}
