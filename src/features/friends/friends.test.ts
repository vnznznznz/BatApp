import {
  acceptFriend,
  describeRequestOutcome,
  describeRoute,
  describeStanding,
  fetchFriendships,
  friendName,
  groupFriendships,
  removeFriend,
  requestFriend,
  toFriendship,
  type Friendship,
  type FriendshipRow,
  type RequestOutcome,
} from '@/features/friends/friends';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

const mockRpc = jest.fn();

// The module is under test, not Supabase's client: this stands in for the calls
// it makes, and keeps every test here off the network.
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

/** An accepted friend, as `list_friends()` returns one: name, city and route. */
function acceptedRow(overrides: Partial<FriendshipRow> = {}): FriendshipRow {
  return {
    friendship_id: 'friendship-anna',
    status: 'accepted',
    direction: 'outgoing',
    friend_id: 'anna-id',
    username: 'anna',
    display_name: 'Anna Weber',
    city_name: 'Munich',
    country_code: 'DE',
    distance_km: 504.6,
    flight_seconds: 22_707,
    requested_at: '2026-10-20T19:00:00.000Z',
    accepted_at: '2026-10-21T08:30:00.000Z',
    ...overrides,
  };
}

/**
 * Someone you asked who has not answered. The server withholds their name and
 * their city until they accept, so a stranger who guesses a username learns
 * only that it exists.
 */
function outgoingRow(overrides: Partial<FriendshipRow> = {}): FriendshipRow {
  return {
    friendship_id: 'friendship-ben',
    status: 'pending',
    direction: 'outgoing',
    friend_id: 'ben-id',
    username: 'ben',
    display_name: null,
    city_name: null,
    country_code: null,
    distance_km: null,
    flight_seconds: null,
    requested_at: '2026-10-30T10:00:00.000Z',
    accepted_at: null,
    ...overrides,
  };
}

/** Someone who asked you. They chose to introduce themselves, so their name is known. */
function incomingRow(overrides: Partial<FriendshipRow> = {}): FriendshipRow {
  return {
    ...outgoingRow(),
    friendship_id: 'friendship-cleo',
    direction: 'incoming',
    friend_id: 'cleo-id',
    username: 'cleo',
    display_name: 'Cleo',
    ...overrides,
  };
}

const accepted = (displayName: string) =>
  toFriendship(
    acceptedRow({
      friendship_id: `friendship-${displayName}`,
      username: displayName.toLowerCase(),
      display_name: displayName,
    }),
  );

const pending = (direction: 'incoming' | 'outgoing', id: string, requestedAt: string) =>
  toFriendship(
    (direction === 'incoming' ? incomingRow : outgoingRow)({
      friendship_id: id,
      requested_at: requestedAt,
    }),
  );

const idsOf = (list: readonly Friendship[]) => list.map((friendship) => friendship.id);

beforeEach(() => {
  mockRpc.mockReset();
});

describe('toFriendship', () => {
  it('maps an accepted friend with their city and the route to them', () => {
    expect(toFriendship(acceptedRow())).toEqual({
      id: 'friendship-anna',
      status: 'accepted',
      direction: 'outgoing',
      friend: {
        id: 'anna-id',
        username: 'anna',
        displayName: 'Anna Weber',
        city: { name: 'Munich', countryCode: 'DE' },
      },
      route: { distanceKm: 504.6, flightSeconds: 22_707 },
      requestedAt: new Date('2026-10-20T19:00:00.000Z'),
      acceptedAt: new Date('2026-10-21T08:30:00.000Z'),
    });
  });

  it('knows nothing but the username of someone you asked who has not accepted', () => {
    const friendship = toFriendship(outgoingRow());

    expect(friendship.status).toBe('pending');
    expect(friendship.direction).toBe('outgoing');
    expect(friendship.friend).toEqual({
      id: 'ben-id',
      username: 'ben',
      displayName: null,
      city: null,
    });
    expect(friendship.route).toBeNull();
    expect(friendship.acceptedAt).toBeNull();
  });

  it('knows the name, but not the city, of someone who asked you', () => {
    const friendship = toFriendship(incomingRow());

    expect(friendship.direction).toBe('incoming');
    expect(friendship.friend.displayName).toBe('Cleo');
    expect(friendship.friend.city).toBeNull();
    expect(friendship.route).toBeNull();
  });

  it('turns the server timestamps into dates', () => {
    const friendship = toFriendship(acceptedRow());

    expect(friendship.requestedAt).toBeInstanceOf(Date);
    expect(friendship.acceptedAt?.toISOString()).toBe('2026-10-21T08:30:00.000Z');
  });

  /** Two couriers in one city are zero kilometres apart, and still a route. */
  it('keeps a route of zero kilometres', () => {
    const friendship = toFriendship(acceptedRow({ distance_km: 0, flight_seconds: 1200 }));

    expect(friendship.route).toEqual({ distanceKm: 0, flightSeconds: 1200 });
  });

  it('has no route to a friend who has not chosen a city', () => {
    const friendship = toFriendship(
      acceptedRow({ city_name: null, country_code: null, distance_km: null, flight_seconds: null }),
    );

    expect(friendship.friend.city).toBeNull();
    expect(friendship.route).toBeNull();
  });

  it('has no route when either number is missing', () => {
    expect(toFriendship(acceptedRow({ distance_km: null })).route).toBeNull();
    expect(toFriendship(acceptedRow({ flight_seconds: null })).route).toBeNull();
  });

  it('has no city without both its name and its country', () => {
    expect(toFriendship(acceptedRow({ country_code: null })).friend.city).toBeNull();
    expect(toFriendship(acceptedRow({ city_name: null })).friend.city).toBeNull();
  });

  /** Only friends can write to each other, so an unknown state must not become one. */
  it('reads a status it does not know as pending, not as a friendship', () => {
    expect(toFriendship(acceptedRow({ status: 'blocked' })).status).toBe('pending');
  });
});

describe('groupFriendships', () => {
  it('puts each friendship in exactly one group', () => {
    const groups = groupFriendships([
      toFriendship(acceptedRow()),
      toFriendship(outgoingRow()),
      toFriendship(incomingRow()),
    ]);

    expect(idsOf(groups.friends)).toEqual(['friendship-anna']);
    expect(idsOf(groups.outgoing)).toEqual(['friendship-ben']);
    expect(idsOf(groups.incoming)).toEqual(['friendship-cleo']);
  });

  it('lists friends alphabetically, whatever the case of their names', () => {
    const groups = groupFriendships([accepted('bob'), accepted('Carol'), accepted('alice')]);

    expect(groups.friends.map((f) => friendName(f.friend))).toEqual(['alice', 'bob', 'Carol']);
  });

  it('does not send accented names to the end of the list', () => {
    const groups = groupFriendships([accepted('Zoe'), accepted('Émile'), accepted('Eva')]);

    expect(groups.friends.map((f) => friendName(f.friend))).toEqual(['Émile', 'Eva', 'Zoe']);
  });

  it('lists requests to you newest first', () => {
    const groups = groupFriendships([
      pending('incoming', 'older', '2026-10-01T10:00:00.000Z'),
      pending('incoming', 'newest', '2026-10-30T10:00:00.000Z'),
      pending('incoming', 'middle', '2026-10-15T10:00:00.000Z'),
    ]);

    expect(idsOf(groups.incoming)).toEqual(['newest', 'middle', 'older']);
  });

  it('lists your own requests newest first', () => {
    const groups = groupFriendships([
      pending('outgoing', 'older', '2026-10-01T10:00:00.000Z'),
      pending('outgoing', 'newest', '2026-10-30T10:00:00.000Z'),
      pending('outgoing', 'middle', '2026-10-15T10:00:00.000Z'),
    ]);

    expect(idsOf(groups.outgoing)).toEqual(['newest', 'middle', 'older']);
  });

  it('leaves the list it was given in the order it was given', () => {
    const list = [accepted('bob'), accepted('alice')];

    groupFriendships(list);

    expect(list.map((f) => f.friend.displayName)).toEqual(['bob', 'alice']);
  });

  it('has three empty groups for someone with no friends yet', () => {
    expect(groupFriendships([])).toEqual({ friends: [], incoming: [], outgoing: [] });
  });
});

describe('friendName', () => {
  it('uses the name they chose, once they have shared it', () => {
    expect(friendName({ displayName: 'Anna Weber', username: 'anna' })).toBe('Anna Weber');
  });

  it('shows only the username of someone who has not accepted yet', () => {
    expect(friendName(toFriendship(outgoingRow()).friend)).toBe('@ben');
  });
});

describe('describeStanding', () => {
  /** Local-time dates, so these hold in any time zone the tests run in. */
  const now = new Date(2026, 10, 2, 12, 0);
  const at = (month: number, day: number) => new Date(2026, month, day, 9, 30).toISOString();

  /** "since" takes a bare day: "Friends since on 2 Oct" was a bug found in review. */
  it('says since when two couriers have been friends', () => {
    const friendship = toFriendship(acceptedRow({ accepted_at: at(9, 2) }));

    expect(describeStanding(friendship, now)).toBe('Friends since 2 Oct');
  });

  it('says today and yesterday in words', () => {
    expect(describeStanding(toFriendship(acceptedRow({ accepted_at: at(10, 2) })), now)).toBe(
      'Friends since today',
    );
    expect(describeStanding(toFriendship(incomingRow({ requested_at: at(10, 1) })), now)).toBe(
      'Asked to be friends yesterday',
    );
  });

  it('says on which day someone asked, or the courier did', () => {
    expect(describeStanding(toFriendship(incomingRow({ requested_at: at(9, 28) })), now)).toBe(
      'Asked to be friends on 28 Oct',
    );
    expect(describeStanding(toFriendship(outgoingRow({ requested_at: at(9, 28) })), now)).toBe(
      'You asked on 28 Oct',
    );
  });
});

describe('describeRoute', () => {
  it('says where a friend is and how long a bat takes', () => {
    expect(describeRoute(toFriendship(acceptedRow()))).toMatch(/^.+, [A-Z]{2} · about .+ by bat$/);
  });

  it('says so when a friend has not chosen a city', () => {
    const friendship = toFriendship(
      acceptedRow({ city_name: null, country_code: null, distance_km: null, flight_seconds: null }),
    );

    expect(describeRoute(friendship)).toBe('Has not chosen a city yet');
  });
});

describe('describeRequestOutcome', () => {
  it.each<[RequestOutcome, string]>([
    ['requested', 'Request sent. Once @anna accepts, you can write to each other.'],
    ['already_requested', 'You have already asked @anna. Their answer is up to them.'],
    ['accepted', '@anna had already asked you, so you are now friends.'],
    ['already_friends', 'You and @anna are already friends.'],
  ])('explains "%s" in words', (outcome, words) => {
    expect(describeRequestOutcome(outcome, 'anna')).toBe(words);
  });

  it('names the username as it was sent, not as it was typed', () => {
    expect(describeRequestOutcome('requested', '  AnnaWeber ')).toBe(
      'Request sent. Once @annaweber accepts, you can write to each other.',
    );
  });
});

describe('requestFriend', () => {
  it('normalises the username before asking', async () => {
    mockRpc.mockResolvedValue({ data: 'requested', error: null });

    await requestFriend('  AnnaWeber ');

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('request_friend', { username: 'annaweber' });
  });

  it.each<RequestOutcome>(['requested', 'already_requested', 'accepted', 'already_friends'])(
    'reports "%s" as the server did',
    async (outcome) => {
      mockRpc.mockResolvedValue({ data: outcome, error: null });

      await expect(requestFriend('anna')).resolves.toBe(outcome);
    },
  );

  it('reads an outcome it does not know as a request sent', async () => {
    mockRpc.mockResolvedValue({ data: 'something_new', error: null });

    await expect(requestFriend('anna')).resolves.toBe('requested');
  });

  it('explains a username nobody has', async () => {
    const error = { message: 'no such courier', code: 'P0001', hint: 'unknown_username' };
    mockRpc.mockResolvedValue({ data: null, error });

    const request = requestFriend('anan');

    await expect(request).rejects.toBeInstanceOf(RpcError);
    await expect(request).rejects.toMatchObject({
      message: REFUSALS.unknown_username,
      reason: 'unknown_username',
      cause: error,
    });
  });

  it('explains that you cannot befriend yourself', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'that is you', code: 'P0001', hint: 'cannot_befriend_self' },
    });

    await expect(requestFriend('me')).rejects.toMatchObject({
      message: REFUSALS.cannot_befriend_self,
      reason: 'cannot_befriend_self',
    });
  });

  it('says the request could not be sent when anything else goes wrong', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'internal error', code: 'XX000', hint: null },
    });

    await expect(requestFriend('anna')).rejects.toMatchObject({
      message: 'The request could not be sent. Check your connection.',
      reason: null,
    });
  });
});

describe('acceptFriend', () => {
  it('accepts the request by its friendship id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(acceptFriend('friendship-cleo')).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledWith('accept_friend', { friendship_id: 'friendship-cleo' });
  });

  it('explains a request that is no longer waiting', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'no such request', code: 'P0001', hint: 'request_not_found' },
    });

    await expect(acceptFriend('friendship-cleo')).rejects.toMatchObject({
      message: REFUSALS.request_not_found,
      reason: 'request_not_found',
    });
  });

  it('says the request could not be accepted when anything else goes wrong', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'internal error', code: 'XX000', hint: null },
    });

    await expect(acceptFriend('friendship-cleo')).rejects.toMatchObject({
      message: 'That request could not be accepted. Try again.',
    });
  });
});

describe('removeFriend', () => {
  it('declines, withdraws or ends a friendship by its id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(removeFriend('friendship-anna')).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledWith('remove_friend', { friendship_id: 'friendship-anna' });
  });

  it('explains a friendship that has already ended', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'no such friendship', code: 'P0001', hint: 'friendship_not_found' },
    });

    await expect(removeFriend('friendship-anna')).rejects.toMatchObject({
      message: REFUSALS.friendship_not_found,
      reason: 'friendship_not_found',
    });
  });

  it('says it could not be done when anything else goes wrong', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'TypeError: Network request failed', code: '', hint: '' },
    });

    await expect(removeFriend('friendship-anna')).rejects.toMatchObject({
      message: 'No connection. Check your network and try again.',
    });
  });
});

describe('fetchFriendships', () => {
  it('asks for the list and maps every row', async () => {
    mockRpc.mockResolvedValue({ data: [acceptedRow(), outgoingRow(), incomingRow()], error: null });

    const list = await fetchFriendships();

    expect(mockRpc).toHaveBeenCalledWith('list_friends');
    expect(list).toEqual([
      toFriendship(acceptedRow()),
      toFriendship(outgoingRow()),
      toFriendship(incomingRow()),
    ]);
  });

  it('reads no rows as no friends', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(fetchFriendships()).resolves.toEqual([]);
  });

  it('says the friends could not be loaded when the call fails', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'internal error', code: 'XX000', hint: null },
    });

    await expect(fetchFriendships()).rejects.toMatchObject({
      message: 'Your friends could not be loaded. Check your connection.',
    });
  });
});
