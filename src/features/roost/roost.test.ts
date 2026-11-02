import {
  countAtHome,
  fetchRoost,
  nextHomecoming,
  toBat,
  type Bat,
  type RoostRow,
} from '@/features/roost/roost';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

const mockRpc = jest.fn();

// The module is under test, not Supabase's client: this stands in for the one
// call it makes, and keeps every test here off the network.
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

/** A bat at home, as `get_roost()` returns one: every flight column null. */
function homeRow(slot: number): RoostRow {
  return {
    bat_id: `bat-${slot}`,
    slot,
    status: 'available',
    message_id: null,
    recipient_id: null,
    recipient_username: null,
    recipient_display_name: null,
    sent_at: null,
    deliver_at: null,
    distance_km: null,
  };
}

/** A bat in the air, carrying a letter to Anna. */
function flyingRow(slot: number, overrides: Partial<RoostRow> = {}): RoostRow {
  return {
    bat_id: `bat-${slot}`,
    slot,
    status: 'flying',
    message_id: `letter-${slot}`,
    recipient_id: 'anna-id',
    recipient_username: 'anna',
    recipient_display_name: 'Anna Weber',
    sent_at: '2026-10-31T18:00:00.000Z',
    deliver_at: '2026-11-01T00:18:00.000Z',
    distance_km: 504.6,
    ...overrides,
  };
}

const atHome = (slot: number): Bat => toBat(homeRow(slot));
const landingAt = (slot: number, deliverAt: string): Bat =>
  toBat(flyingRow(slot, { deliver_at: deliverAt }));

beforeEach(() => {
  mockRpc.mockReset();
});

describe('toBat', () => {
  it('gives a bat at home no flight', () => {
    expect(toBat(homeRow(2))).toEqual({ id: 'bat-2', slot: 2, status: 'available', flight: null });
  });

  it('maps every detail of a flight, with its times as dates', () => {
    expect(toBat(flyingRow(1))).toEqual({
      id: 'bat-1',
      slot: 1,
      status: 'flying',
      flight: {
        messageId: 'letter-1',
        recipient: { id: 'anna-id', username: 'anna', displayName: 'Anna Weber' },
        sentAt: new Date('2026-10-31T18:00:00.000Z'),
        deliverAt: new Date('2026-11-01T00:18:00.000Z'),
        distanceKm: 504.6,
      },
    });
  });

  /** The landing time is the server's answer. The client only reads it. */
  it('lands the bat exactly when the server said it would', () => {
    const flight = toBat(flyingRow(1, { deliver_at: '2026-11-02T03:07:41.250Z' })).flight;

    expect(flight?.deliverAt).toBeInstanceOf(Date);
    expect(flight?.deliverAt.toISOString()).toBe('2026-11-02T03:07:41.250Z');
  });

  /** As for someone the courier has blocked, whose own name is withheld. */
  it('falls back to the @username when the recipient has no name to show', () => {
    const flight = toBat(flyingRow(1, { recipient_display_name: null })).flight;

    expect(flight?.recipient.displayName).toBe('@anna');
  });

  it('reads a missing distance as zero rather than as no number at all', () => {
    expect(toBat(flyingRow(1, { distance_km: null })).flight?.distanceKm).toBe(0);
  });

  it.each<keyof RoostRow>(['message_id', 'recipient_id', 'sent_at', 'deliver_at'])(
    'does not make up a flight when %s is missing',
    (column) => {
      expect(toBat(flyingRow(1, { [column]: null })).flight).toBeNull();
    },
  );

  /**
   * Cannot happen while the database's invariants hold. If it ever did, the bat
   * must not be offered as home and ready to carry a letter just because its
   * flight could not be read.
   */
  it('keeps a flying bat flying even when its flight cannot be read', () => {
    const bat = toBat({ ...homeRow(3), status: 'flying' });

    expect(bat.status).toBe('flying');
    expect(bat.flight).toBeNull();
  });

  it('reads a status it does not know as one of the two the app has, with no flight', () => {
    expect(toBat({ ...homeRow(1), status: 'resting' })).toMatchObject({
      status: 'available',
      flight: null,
    });
  });
});

describe('countAtHome', () => {
  it('counts the bats that are home', () => {
    expect(countAtHome([atHome(1), toBat(flyingRow(2)), atHome(3)])).toBe(2);
  });

  it('is three for a roost with every bat home', () => {
    expect(countAtHome([atHome(1), atHome(2), atHome(3)])).toBe(3);
  });

  it('is zero when every bat is out', () => {
    expect(countAtHome([toBat(flyingRow(1)), toBat(flyingRow(2)), toBat(flyingRow(3))])).toBe(0);
  });

  it('does not count a flying bat whose flight could not be read as home', () => {
    expect(countAtHome([toBat({ ...homeRow(1), status: 'flying' }), atHome(2)])).toBe(1);
  });

  it('is zero for a roost that has not loaded', () => {
    expect(countAtHome([])).toBe(0);
  });
});

describe('nextHomecoming', () => {
  it('is null when no bat is in the air', () => {
    expect(nextHomecoming([atHome(1), atHome(2), atHome(3)])).toBeNull();
    expect(nextHomecoming([])).toBeNull();
  });

  it('is the landing time of the only bat out', () => {
    expect(
      nextHomecoming([atHome(1), landingAt(2, '2026-11-01T00:18:00.000Z'), atHome(3)]),
    ).toEqual(new Date('2026-11-01T00:18:00.000Z'));
  });

  it('is the soonest landing, whatever order the bats are in', () => {
    const bats = [
      landingAt(1, '2026-11-03T09:00:00.000Z'),
      landingAt(2, '2026-11-01T00:18:00.000Z'),
      landingAt(3, '2026-11-02T12:00:00.000Z'),
    ];

    expect(nextHomecoming(bats)).toEqual(new Date('2026-11-01T00:18:00.000Z'));
    expect(nextHomecoming([...bats].reverse())).toEqual(new Date('2026-11-01T00:18:00.000Z'));
  });

  it('ignores a flying bat whose flight could not be read', () => {
    expect(
      nextHomecoming([
        toBat({ ...homeRow(1), status: 'flying' }),
        landingAt(2, '2026-11-01T00:18:00.000Z'),
      ]),
    ).toEqual(new Date('2026-11-01T00:18:00.000Z'));
  });
});

describe('fetchRoost', () => {
  it('asks the database for the roost and nothing else', async () => {
    mockRpc.mockResolvedValue({ data: [homeRow(1), homeRow(2), homeRow(3)], error: null });

    await fetchRoost();

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_roost');
  });

  it('returns the bats in slot order, so each keeps its place in the roost', async () => {
    mockRpc.mockResolvedValue({ data: [homeRow(3), flyingRow(1), homeRow(2)], error: null });

    const bats = await fetchRoost();

    expect(bats.map((bat) => bat.slot)).toEqual([1, 2, 3]);
    expect(bats[0]).toEqual(toBat(flyingRow(1)));
  });

  it('reads no rows as an empty roost', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(fetchRoost()).resolves.toEqual([]);
  });

  it('asks the courier to sign in again when the session has ended', async () => {
    const error = { message: 'not authenticated', code: '28000', hint: null };
    mockRpc.mockResolvedValue({ data: null, error });

    const failure = fetchRoost();

    await expect(failure).rejects.toBeInstanceOf(RpcError);
    await expect(failure).rejects.toMatchObject({
      message: 'Your session has ended. Sign in again.',
      reason: null,
      cause: error,
    });
  });

  it('names the reason when the database gives one', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'could not serialize', code: '40001', hint: 'try_again' },
    });

    await expect(fetchRoost()).rejects.toMatchObject({
      message: REFUSALS.try_again,
      reason: 'try_again',
    });
  });

  it('says the roost could not be loaded when anything else goes wrong', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'internal error', code: 'XX000', hint: null },
    });

    await expect(fetchRoost()).rejects.toMatchObject({
      message: 'Your roost could not be loaded. Check your connection.',
      reason: null,
    });
  });
});
