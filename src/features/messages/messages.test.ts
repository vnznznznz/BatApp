import { MESSAGE_MAX_LENGTH } from '@/constants/config';
import {
  correspondentName,
  fetchBadges,
  fetchInbox,
  fetchSent,
  letterLength,
  PAGE_SIZE,
  prepareBody,
  readMessage,
  sendMessage,
  toLetter,
  toReceivedLetter,
  toSentLetter,
  validateBody,
  type InboxRow,
  type LetterRow,
  type SentRow,
} from '@/features/messages/messages';
import { REFUSALS, RpcError, type ApiError } from '@/lib/rpc-error';

const mockRpc = jest.fn();
const mockSingle = jest.fn();

// The module is under test, not Supabase's client: this stands in for the calls
// it makes, and keeps every test here off the network.
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

type Response = { data: unknown; error: ApiError | null };

/** PostgREST's answer when `.single()` is asked of anything but exactly one row. */
const NOT_ONE_ROW: ApiError = {
  message: 'JSON object requested, multiple (or no) rows returned',
  code: 'PGRST116',
  hint: null,
};

/** What `rpc()` returns: awaitable as it is, or narrowed to one row with `.single()`. */
function builder(all: Response, one: Response) {
  return Object.assign(Promise.resolve(all), {
    single: () => {
      mockSingle();
      return Promise.resolve(one);
    },
  });
}

/**
 * Answers the next calls as PostgREST does for a function returning a table:
 * every row, as an array, when the call is awaited as it is - and the one row,
 * as an object, after `.single()`. A call that forgot `.single()` would get an
 * array where it expected a row, and its mapping would fail.
 */
function answer(rows: readonly unknown[] | null) {
  mockRpc.mockImplementation(() =>
    builder(
      { data: rows, error: null },
      rows?.length === 1 ? { data: rows[0], error: null } : { data: null, error: NOT_ONE_ROW },
    ),
  );
}

function fail(error: ApiError) {
  mockRpc.mockImplementation(() => builder({ data: null, error }, { data: null, error }));
}

const inboxRow = (overrides: Partial<InboxRow> = {}): InboxRow => ({
  message_id: 'letter-1',
  sender_id: 'anna-id',
  sender_username: 'anna',
  sender_display_name: 'Anna Weber',
  origin_city_name: 'Munich',
  origin_country_code: 'DE',
  distance_km: 504.6,
  sent_at: '2026-10-30T18:00:00.000Z',
  arrived_at: '2026-10-31T00:18:00.000Z',
  opened_at: null,
  preview: 'Dear Ben, the chestnuts are out again.',
  ...overrides,
});

const sentRow = (overrides: Partial<SentRow> = {}): SentRow => ({
  message_id: 'letter-2',
  recipient_id: 'anna-id',
  recipient_username: 'anna',
  recipient_display_name: 'Anna Weber',
  destination_city_name: 'Munich',
  destination_country_code: 'DE',
  distance_km: 504.6,
  sent_at: '2026-10-31T18:00:00.000Z',
  deliver_at: '2026-11-01T00:18:00.000Z',
  delivered: false,
  preview: 'Dear Anna, thank you for the chestnuts.',
  ...overrides,
});

const letterRow = (overrides: Partial<LetterRow> = {}): LetterRow => ({
  id: 'letter-1',
  direction: 'received',
  other_id: 'anna-id',
  other_username: 'anna',
  other_display_name: 'Anna Weber',
  origin_city_name: 'Munich',
  origin_country_code: 'DE',
  destination_city_name: 'Zurich',
  destination_country_code: 'CH',
  distance_km: 241.9,
  sent_at: '2026-10-30T18:00:00.000Z',
  deliver_at: '2026-10-31T00:18:00.000Z',
  delivered: true,
  opened_at: '2026-10-31T07:45:00.000Z',
  body: 'Dear Ben,\n\nThe chestnuts are out again.\n\nAnna',
  ...overrides,
});

const UNEXPECTED: ApiError = { message: 'internal error', code: 'XX000', hint: null };

beforeEach(() => {
  mockRpc.mockReset();
  mockSingle.mockReset();
});

describe('letterLength', () => {
  it('counts plain text by its characters', () => {
    expect(letterLength('Dear Anna,')).toBe(10);
    expect(letterLength('Grüße aus Zürich')).toBe(16);
  });

  /**
   * Postgres counts characters; JavaScript's `length` counts UTF-16 units and
   * says 2 for one bat. The counter on screen has to agree with the server.
   */
  it('counts an emoji as one character, as the database does', () => {
    expect('🦇'.length).toBe(2);
    expect(letterLength('🦇')).toBe(1);
    expect(letterLength('Good night 🌙🦇')).toBe(13);
  });

  /** `char_length` counts code points, so a joined emoji costs each of its parts. */
  it('counts a joined emoji by its code points, as the database does', () => {
    expect(letterLength('👩‍👩‍👧')).toBe(5);
  });

  it('is zero for nothing', () => {
    expect(letterLength('')).toBe(0);
  });
});

describe('prepareBody', () => {
  it('drops blank space before and after the letter', () => {
    expect(prepareBody('  \n\tDear Anna,\n\nSee you soon.\n\n  ')).toBe(
      'Dear Anna,\n\nSee you soon.',
    );
  });

  it('keeps everything between as it was written', () => {
    const letter = 'Dear Anna,\n\n   a poem:\n\troses   are red\n\nBen';

    expect(prepareBody(`   ${letter}   `)).toBe(letter);
  });
});

describe('validateBody', () => {
  it('refuses an empty letter', () => {
    expect(validateBody('')).toBe('Write something first.');
  });

  it('refuses a letter of nothing but blank space', () => {
    expect(validateBody('   \n\t \n ')).toBe('Write something first.');
  });

  it('accepts a single word', () => {
    expect(validateBody('Hello')).toBeNull();
  });

  it('accepts a letter of exactly the maximum length', () => {
    expect(validateBody('a'.repeat(MESSAGE_MAX_LENGTH))).toBeNull();
  });

  it('refuses one character more', () => {
    expect(validateBody('a'.repeat(MESSAGE_MAX_LENGTH + 1))).toBe(
      `A letter can be at most ${MESSAGE_MAX_LENGTH} characters.`,
    );
  });

  /** Twice the limit in UTF-16 units, exactly the limit in characters. */
  it('measures a letter full of emoji in characters, not in UTF-16 units', () => {
    expect(validateBody('🦇'.repeat(MESSAGE_MAX_LENGTH))).toBeNull();
    expect(validateBody('🦇'.repeat(MESSAGE_MAX_LENGTH + 1))).not.toBeNull();
  });

  it('measures the letter as it will be sent, without the blank space around it', () => {
    expect(validateBody(`  \n${'a'.repeat(MESSAGE_MAX_LENGTH)}\n  `)).toBeNull();
  });

  it('uses the same words as the database when it refuses', () => {
    expect(validateBody('')).toBe(REFUSALS.empty_message);
    expect(validateBody('a'.repeat(MESSAGE_MAX_LENGTH + 1))).toBe(REFUSALS.message_too_long);
  });
});

describe('toReceivedLetter', () => {
  it('maps every column, with the times as dates', () => {
    expect(toReceivedLetter(inboxRow({ opened_at: '2026-10-31T07:45:00.000Z' }))).toEqual({
      id: 'letter-1',
      sender: { id: 'anna-id', username: 'anna', displayName: 'Anna Weber' },
      origin: { name: 'Munich', countryCode: 'DE' },
      distanceKm: 504.6,
      sentAt: new Date('2026-10-30T18:00:00.000Z'),
      arrivedAt: new Date('2026-10-31T00:18:00.000Z'),
      openedAt: new Date('2026-10-31T07:45:00.000Z'),
      preview: 'Dear Ben, the chestnuts are out again.',
    });
  });

  it('marks a letter that has not been opened', () => {
    expect(toReceivedLetter(inboxRow()).openedAt).toBeNull();
  });
});

describe('toSentLetter', () => {
  it('maps every column, with the times as dates', () => {
    expect(toSentLetter(sentRow())).toEqual({
      id: 'letter-2',
      recipient: { id: 'anna-id', username: 'anna', displayName: 'Anna Weber' },
      destination: { name: 'Munich', countryCode: 'DE' },
      distanceKm: 504.6,
      sentAt: new Date('2026-10-31T18:00:00.000Z'),
      deliverAt: new Date('2026-11-01T00:18:00.000Z'),
      delivered: false,
      preview: 'Dear Anna, thank you for the chestnuts.',
    });
  });

  /**
   * No read receipts. Even if a row ever carried an opened time, a sent letter
   * has nowhere to put it, so no screen can show it.
   */
  it('carries nothing about whether the letter was opened', () => {
    const row = { ...sentRow({ delivered: true }), opened_at: '2026-11-01T07:00:00.000Z' };

    expect(toSentLetter(row)).not.toHaveProperty('openedAt');
  });
});

describe('toLetter', () => {
  it('maps a received letter in full, with the times as dates', () => {
    expect(toLetter(letterRow())).toEqual({
      id: 'letter-1',
      direction: 'received',
      other: { id: 'anna-id', username: 'anna', displayName: 'Anna Weber' },
      origin: { name: 'Munich', countryCode: 'DE' },
      destination: { name: 'Zurich', countryCode: 'CH' },
      distanceKm: 241.9,
      sentAt: new Date('2026-10-30T18:00:00.000Z'),
      deliverAt: new Date('2026-10-31T00:18:00.000Z'),
      delivered: true,
      openedAt: new Date('2026-10-31T07:45:00.000Z'),
      body: 'Dear Ben,\n\nThe chestnuts are out again.\n\nAnna',
    });
  });

  it('maps a letter you sent, which the server never says was opened', () => {
    const letter = toLetter(letterRow({ direction: 'sent', delivered: false, opened_at: null }));

    expect(letter.direction).toBe('sent');
    expect(letter.delivered).toBe(false);
    expect(letter.openedAt).toBeNull();
  });

  it('keeps the words exactly as they were written', () => {
    const body = '  Dear Anna,\n\n\tsee you at dusk.  ';

    expect(toLetter(letterRow({ body })).body).toBe(body);
  });
});

describe('correspondentName', () => {
  it('uses their name', () => {
    expect(correspondentName({ displayName: 'Anna Weber', username: 'anna' })).toBe('Anna Weber');
  });

  it('falls back to their username when there is no name to show', () => {
    expect(correspondentName({ displayName: '', username: 'anna' })).toBe('@anna');
  });
});

describe('sendMessage', () => {
  const dispatched = {
    message_id: 'letter-9',
    deliver_at: '2026-11-01T00:18:00.000Z',
    distance_km: 504.6,
  };

  /**
   * Which bat, how far, and when it lands are the server's decisions. The
   * client names a recipient and supplies the words - and nothing else.
   */
  it('sends only the recipient and the trimmed words, in one call', async () => {
    answer([dispatched]);

    await sendMessage('anna-id', '\n  Dear Anna,\n\nSee you soon.  \n');

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('send_message', {
      recipient_id: 'anna-id',
      body: 'Dear Anna,\n\nSee you soon.',
    });
  });

  it('reports when the letter will land, as the server worked it out', async () => {
    answer([dispatched]);

    const dispatch = await sendMessage('anna-id', 'Dear Anna,');

    expect(mockSingle).toHaveBeenCalledTimes(1);
    expect(dispatch).toEqual({
      id: 'letter-9',
      deliverAt: new Date('2026-11-01T00:18:00.000Z'),
      distanceKm: 504.6,
    });
  });

  it('explains that every bat is out', async () => {
    const error: ApiError = {
      message: 'every bat is out',
      code: 'P0001',
      hint: 'no_available_bat',
    };
    fail(error);

    const sending = sendMessage('anna-id', 'Dear Anna,');

    await expect(sending).rejects.toBeInstanceOf(RpcError);
    await expect(sending).rejects.toMatchObject({
      message: REFUSALS.no_available_bat,
      reason: 'no_available_bat',
      cause: error,
    });
  });

  it('explains that letters only go to friends', async () => {
    fail({ message: 'not friends', code: 'P0001', hint: 'not_friends' });

    await expect(sendMessage('stranger-id', 'Hello')).rejects.toMatchObject({
      message: REFUSALS.not_friends,
      reason: 'not_friends',
    });
  });

  it('says the letter could not be sent when anything else goes wrong', async () => {
    fail(UNEXPECTED);

    await expect(sendMessage('anna-id', 'Dear Anna,')).rejects.toMatchObject({
      message: 'Your letter could not be sent. Check your connection.',
      reason: null,
    });
  });
});

describe('fetchInbox', () => {
  it('asks for the first page without a cursor', async () => {
    answer([]);

    await fetchInbox();

    expect(mockRpc).toHaveBeenCalledWith('list_inbox', {
      max_results: PAGE_SIZE,
      older_than: undefined,
    });
  });

  it('asks for the next page after the last letter held', async () => {
    answer([]);

    await fetchInbox('letter-30');

    expect(mockRpc).toHaveBeenCalledWith('list_inbox', {
      max_results: PAGE_SIZE,
      older_than: 'letter-30',
    });
  });

  it('returns the page in the order the server sent it', async () => {
    answer([inboxRow({ message_id: 'newer' }), inboxRow({ message_id: 'older' })]);

    const letters = await fetchInbox();

    expect(letters.map((letter) => letter.id)).toEqual(['newer', 'older']);
    expect(letters[0]).toEqual(toReceivedLetter(inboxRow({ message_id: 'newer' })));
    expect(mockSingle).not.toHaveBeenCalled();
  });

  it('reads no rows as an empty inbox', async () => {
    answer(null);

    await expect(fetchInbox()).resolves.toEqual([]);
  });

  it('says the letters could not be loaded when the call fails', async () => {
    fail(UNEXPECTED);

    await expect(fetchInbox()).rejects.toMatchObject({
      message: 'Your letters could not be loaded. Check your connection.',
    });
  });
});

describe('fetchSent', () => {
  it('asks for the first page without a cursor', async () => {
    answer([]);

    await fetchSent();

    expect(mockRpc).toHaveBeenCalledWith('list_sent', {
      max_results: PAGE_SIZE,
      older_than: undefined,
    });
  });

  it('asks for the next page after the last letter held', async () => {
    answer([]);

    await fetchSent('letter-30');

    expect(mockRpc).toHaveBeenCalledWith('list_sent', {
      max_results: PAGE_SIZE,
      older_than: 'letter-30',
    });
  });

  it('maps every letter on the page', async () => {
    answer([
      sentRow({ message_id: 'in-the-air' }),
      sentRow({ message_id: 'landed', delivered: true }),
    ]);

    const letters = await fetchSent();

    expect(letters).toEqual([
      toSentLetter(sentRow({ message_id: 'in-the-air' })),
      toSentLetter(sentRow({ message_id: 'landed', delivered: true })),
    ]);
    expect(mockSingle).not.toHaveBeenCalled();
  });

  it('says the letters could not be loaded when the call fails', async () => {
    fail(UNEXPECTED);

    await expect(fetchSent()).rejects.toMatchObject({
      message: 'Your letters could not be loaded. Check your connection.',
    });
  });
});

describe('PAGE_SIZE', () => {
  /**
   * A short page is how the list knows it has reached the end. Asking for more
   * than the server will return in one page would make every full page look
   * short, and the list would stop after the first.
   */
  it('never asks for more letters per page than the server returns', () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
    expect(PAGE_SIZE).toBeLessThanOrEqual(100);
  });
});

describe('readMessage', () => {
  it('asks for the one letter by its id', async () => {
    answer([letterRow()]);

    const letter = await readMessage('letter-1');

    expect(mockRpc).toHaveBeenCalledWith('read_message', { message_id: 'letter-1' });
    expect(mockSingle).toHaveBeenCalledTimes(1);
    expect(letter).toEqual(toLetter(letterRow()));
  });

  it('explains a letter that cannot be found', async () => {
    fail({ message: 'no such letter', code: 'P0001', hint: 'message_not_found' });

    await expect(readMessage('letter-1')).rejects.toMatchObject({
      message: REFUSALS.message_not_found,
      reason: 'message_not_found',
    });
  });

  it('says the letter could not be opened when anything else goes wrong', async () => {
    fail(UNEXPECTED);

    await expect(readMessage('letter-1')).rejects.toMatchObject({
      message: 'That letter could not be opened. Check your connection.',
    });
  });
});

describe('fetchBadges', () => {
  it('reports unread letters and waiting friend requests', async () => {
    answer([{ unread_messages: 2, friend_requests: 1 }]);

    await expect(fetchBadges()).resolves.toEqual({ unreadLetters: 2, friendRequests: 1 });
    expect(mockRpc).toHaveBeenCalledWith('get_badges');
    expect(mockSingle).toHaveBeenCalledTimes(1);
  });

  it('reports zero as zero', async () => {
    answer([{ unread_messages: 0, friend_requests: 0 }]);

    await expect(fetchBadges()).resolves.toEqual({ unreadLetters: 0, friendRequests: 0 });
  });

  it('says it could not check when the call fails', async () => {
    fail(UNEXPECTED);

    await expect(fetchBadges()).rejects.toMatchObject({
      message: 'Could not check for new letters.',
    });
  });
});
