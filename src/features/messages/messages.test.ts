import { MESSAGE_MAX_LENGTH } from '@/constants/config';
import {
  asOneLine,
  correspondentName,
  fetchBadges,
  fetchInbox,
  fetchSent,
  fetchSentLetter,
  letterLength,
  letterOpened,
  onLetterOpened,
  PAGE_SIZE,
  prepareBody,
  PREVIEW_LENGTH,
  previewOf,
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

/** Said of a letter with a character in it that cannot be sent, wherever that is found. */
const UNSENDABLE =
  'Your letter has a character in it that cannot be sent: half of an emoji, or a hidden one ' +
  'that came with pasted text. Delete it, or type that part again yourself.';

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

describe('previewOf', () => {
  it('is the whole of a short letter, without the blank space around it', () => {
    expect(previewOf('  \nDear Anna,\n\nSee you soon.\n ')).toBe('Dear Anna,\n\nSee you soon.');
  });

  it('is nothing for a letter of nothing but blank space', () => {
    expect(previewOf('  \n\t ')).toBe('');
  });

  /** `list_inbox` and `list_sent` cut theirs with left(body, 200). */
  it('is cut where the server cuts the preview of a letter that was sent', () => {
    expect(PREVIEW_LENGTH).toBe(200);
    expect(previewOf('a'.repeat(PREVIEW_LENGTH))).toBe('a'.repeat(PREVIEW_LENGTH));
    expect(previewOf('a'.repeat(PREVIEW_LENGTH + 1))).toBe('a'.repeat(PREVIEW_LENGTH));
  });

  /** Cut by UTF-16 units, the two hundredth bat would be half a bat. */
  it('counts characters as the database does, never cutting one in half', () => {
    expect(previewOf('🦇'.repeat(PREVIEW_LENGTH + 50))).toBe('🦇'.repeat(PREVIEW_LENGTH));
  });
});

describe('asOneLine', () => {
  /** Kept as written, a two-line preview would show the greeting and then nothing. */
  it('runs the greeting, the blank line and what follows together', () => {
    expect(asOneLine('Dear Ben,\n\nthe chestnuts are out again.')).toBe(
      'Dear Ben, the chestnuts are out again.',
    );
  });

  it('makes one space of any run of blank space, and none at either end', () => {
    expect(asOneLine('  Dear Ben, \t\n  how   are you?\n')).toBe('Dear Ben, how are you?');
  });

  it('is nothing for nothing but blank space', () => {
    expect(asOneLine(' \n\t ')).toBe('');
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

  /**
   * JavaScript's trim keeps these, so a letter of nothing else passed here
   * and was refused by the server, which asks for something to see.
   */
  it.each([
    ['a zero-width space', '\u200B'],
    ['a soft hyphen', '\u00AD'],
    ['a blank braille pattern', '\u2800'],
    ['all three, between line breaks', '\n\u200B\u00AD\u2800\n'],
  ])('refuses a letter of nothing but %s, in the same words', (_, body) => {
    expect(validateBody(body)).toBe(REFUSALS.empty_message);
  });

  it('accepts a letter with something to see among them', () => {
    expect(validateBody('\u200BDear Ben,\u2800\n\nThe bats are well.\u00AD')).toBeNull();
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

  /**
   * The database cannot hold a NUL, and PostgREST cannot read half of an
   * emoji on its own: such a letter was refused before send_message saw it,
   * taken for a lost answer, and the courier told only that it did not go -
   * a letter that would never go, however often it was sent. (Tried on the
   * local stack.)
   */
  it.each([
    ['a NUL', 'Dear Ben,\u0000 the bats are well.'],
    ['the first half of an emoji alone', 'Dear Ben, \uD83E the bats are well.'],
    ['the second half of an emoji alone', 'Dear Ben, \uDD87 the bats are well.'],
    ['an emoji cut off at the end', 'Dear Ben, the bats are well. \uD83E'],
  ])('refuses a letter with %s, and says what to do', (_, body) => {
    const said = validateBody(body);

    expect(said).toBe(UNSENDABLE);
    expect(said).not.toMatch(/connection/i);
  });

  it('takes an emoji whole, however many halves it has', () => {
    expect(validateBody('Dear Ben, 🦇👩‍👧 the bats are well.')).toBeNull();
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

  const REF = '0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f';

  /**
   * Which bat, how far, and when it lands are the server's decisions. The
   * client names a recipient, supplies the words, and names the letter so a
   * retry is recognised - and nothing else.
   */
  it('sends only the recipient, the trimmed words and the letter’s ref, in one call', async () => {
    answer([dispatched]);

    await sendMessage('anna-id', '\n  Dear Anna,\n\nSee you soon.  \n', REF);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('send_message', {
      recipient_id: 'anna-id',
      body: 'Dear Anna,\n\nSee you soon.',
      client_ref: REF,
    });
  });

  it('reports when the letter will land, as the server worked it out', async () => {
    answer([dispatched]);

    const dispatch = await sendMessage('anna-id', 'Dear Anna,', REF);

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

    const sending = sendMessage('anna-id', 'Dear Anna,', REF);

    await expect(sending).rejects.toBeInstanceOf(RpcError);
    await expect(sending).rejects.toMatchObject({
      message: REFUSALS.no_available_bat,
      reason: 'no_available_bat',
      cause: error,
    });
  });

  it('explains that letters only go to friends', async () => {
    fail({ message: 'not friends', code: 'P0001', hint: 'not_friends' });

    await expect(sendMessage('stranger-id', 'Hello', REF)).rejects.toMatchObject({
      message: REFUSALS.not_friends,
      reason: 'not_friends',
    });
  });

  /**
   * What the local stack answered for such a letter, before send_message ran:
   * Postgres for a NUL, PostgREST for half of an emoji. Each is a refusal of
   * the words, not a lost answer - the letter did not go, and asking whether
   * it did, or sending it again, would change nothing.
   */
  it.each<[string, ApiError]>([
    [
      'a NUL, which the database cannot hold',
      {
        code: '22P05',
        message: 'unsupported Unicode escape sequence',
        hint: null,
      },
    ],
    [
      'half of an emoji, which PostgREST cannot read',
      { code: 'PGRST102', message: 'Empty or invalid json', hint: null },
    ],
  ])('says what to do when the server refuses %s', async (_, error) => {
    fail(error);

    const sending = sendMessage('anna-id', 'Dear Anna,', REF);

    await expect(sending).rejects.toBeInstanceOf(RpcError);
    await expect(sending).rejects.toMatchObject({
      message: UNSENDABLE,
      reason: 'unsendable_character',
      cause: error,
    });
  });

  it('says the letter could not be sent when anything else goes wrong', async () => {
    fail(UNEXPECTED);

    await expect(sendMessage('anna-id', 'Dear Anna,', REF)).rejects.toMatchObject({
      message: 'Your letter could not be sent. Check your connection.',
      reason: null,
    });
  });

  /**
   * What the client answers with when its fetch gives up on a request nobody
   * answered, after twenty seconds: postgrest-js turns the TypeError thrown
   * into this. It is no refusal - the letter may have gone - so it must not
   * come back with a reason, or the letter would be taken for one that did not.
   */
  it('says there is no connection, and gives no reason, when the request was given up', async () => {
    fail({ message: 'TypeError: Network request timed out', code: '', hint: '' });

    const sending = sendMessage('anna-id', 'Dear Anna,', REF);

    await expect(sending).rejects.toBeInstanceOf(RpcError);
    await expect(sending).rejects.toMatchObject({
      message: 'No connection. Check your network and try again.',
      reason: null,
    });
  });
});

/**
 * What became of a send that was never answered. The one mistake this must
 * never make is to say "nothing went" when it only could not find out: the
 * app would then let the same letter go a second time, on a second bat.
 */
describe('fetchSentLetter', () => {
  const REF = '0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f';

  const held = {
    message_id: 'letter-9',
    deliver_at: '2026-11-01T00:18:00.000Z',
    distance_km: 504.6,
  };

  it('asks for the letter that went out under a reference, in one call', async () => {
    answer([]);

    await fetchSentLetter(REF);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('sent_letter', { client_ref: REF });
  });

  it('reports the letter as a send would have: which it is, when it lands, how far', async () => {
    answer([held]);

    await expect(fetchSentLetter(REF)).resolves.toEqual({
      id: 'letter-9',
      deliverAt: new Date('2026-11-01T00:18:00.000Z'),
      distanceKm: 504.6,
    });
    // Awaited as it is: asked for exactly one row, "none" would come back as an error.
    expect(mockSingle).not.toHaveBeenCalled();
  });

  it.each([
    ['no rows', []],
    ['nothing at all', null],
  ])('says nothing went out under it when the server answers with %s', async (_, rows) => {
    answer(rows);

    await expect(fetchSentLetter(REF)).resolves.toBeNull();
  });

  it('fails, rather than say nothing went, when there is no connection to ask over', async () => {
    fail({ message: 'TypeError: Network request failed', code: '', hint: '' });

    const asking = fetchSentLetter(REF);

    await expect(asking).rejects.toBeInstanceOf(RpcError);
    await expect(asking).rejects.toMatchObject({
      message: 'No connection. Check your network and try again.',
      reason: null,
    });
  });

  it('fails, rather than say nothing went, when the server answers with an error', async () => {
    fail(UNEXPECTED);

    await expect(fetchSentLetter(REF)).rejects.toMatchObject({
      message: 'Could not find out whether your letter went.',
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

  /**
   * The inbox takes the unread mark off a letter when it hears that the letter
   * was read. It has to hear it from here, where the server's answer arrives:
   * a tap on the row is not a letter read. (Found in review.)
   */
  describe('telling whoever is listening that a letter was opened', () => {
    const heard = jest.fn();
    let stop: () => void;

    beforeEach(() => {
      heard.mockReset();
      stop = onLetterOpened(heard);
    });

    afterEach(() => stop());

    it('says so of a received letter, once the server has answered with it', async () => {
      answer([letterRow({ id: 'letter-7' })]);

      const reading = readMessage('letter-7');
      expect(heard).not.toHaveBeenCalled();
      await reading;

      expect(heard).toHaveBeenCalledTimes(1);
      expect(heard).toHaveBeenCalledWith('letter-7');
    });

    // The server never says whether a letter you sent was opened, and reading
    // your own letter opens nothing.
    it('says nothing of a letter you sent', async () => {
      answer([letterRow({ direction: 'sent', opened_at: null })]);

      await readMessage('letter-1');

      expect(heard).not.toHaveBeenCalled();
    });

    it('says nothing of a letter that could not be read', async () => {
      fail({ message: 'TypeError: Network request failed' });
      await expect(readMessage('letter-1')).rejects.toBeInstanceOf(RpcError);

      fail({ message: 'no such letter', code: 'P0001', hint: 'message_not_found' });
      await expect(readMessage('letter-1')).rejects.toBeInstanceOf(RpcError);

      expect(heard).not.toHaveBeenCalled();
    });
  });
});

describe('onLetterOpened', () => {
  it('tells everyone listening which letter it was, each time', () => {
    const inbox = jest.fn();
    const other = jest.fn();
    const stopInbox = onLetterOpened(inbox);
    const stopOther = onLetterOpened(other);

    letterOpened('letter-1');
    letterOpened('letter-2');

    expect(inbox.mock.calls).toEqual([['letter-1'], ['letter-2']]);
    expect(other.mock.calls).toEqual([['letter-1'], ['letter-2']]);
    stopInbox();
    stopOther();
  });

  it('tells nobody who has stopped listening, and still tells the others', () => {
    const inbox = jest.fn();
    const other = jest.fn();
    const stopInbox = onLetterOpened(inbox);
    const stopOther = onLetterOpened(other);

    stopOther();
    letterOpened('letter-1');

    expect(other).not.toHaveBeenCalled();
    expect(inbox).toHaveBeenCalledTimes(1);
    stopInbox();
  });

  it('does nothing when nobody is listening', () => {
    expect(() => letterOpened('letter-1')).not.toThrow();
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
