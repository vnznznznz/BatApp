import { REPORT_NOTE_MAX_LENGTH, REPORT_REASONS } from '@/constants/config';
import {
  blockCourier,
  fetchBlocked,
  noteLength,
  prepareNote,
  REASON_LABELS,
  reportCourier,
  reportLetter,
  toBlockedCourier,
  unblockCourier,
  validateNote,
  type BlockedRow,
  type BlockOutcome,
  type Report,
  type ReportOutcome,
} from '@/features/safety/safety';
import { REFUSALS, RpcError, type ApiError, type RefusalReason } from '@/lib/rpc-error';

const mockRpc = jest.fn();

// The module is under test, not Supabase's client: this stands in for the calls
// it makes, and keeps every test here off the network.
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

/** A refusal as PostgREST reports one: SQLSTATE P0001 with a machine-readable hint. */
const refusal = (hint: RefusalReason): ApiError => ({
  message: 'refused by the database',
  code: 'P0001',
  hint,
});

const UNEXPECTED: ApiError = { message: 'internal error', code: 'XX000', hint: null };

/** What the next call answers. */
const answer = (data: unknown) => mockRpc.mockResolvedValue({ data, error: null });
const fail = (error: ApiError) => mockRpc.mockResolvedValue({ data: null, error });

/** The arguments the last call sent, as they go to the database. */
const sentArguments = (): Record<string, unknown> => mockRpc.mock.lastCall?.[1];

/** Ben, as `list_blocked()` returns him: by username only. */
const blockedRow = (overrides: Partial<BlockedRow> = {}): BlockedRow => ({
  courier_id: 'ben-id',
  username: 'ben',
  blocked_at: '2026-11-02T14:00:00.000Z',
  ...overrides,
});

/** A report as the report screen hands it over, before its note is prepared. */
const report = (overrides: Partial<Report> = {}): Report => ({
  reason: 'harassment',
  note: '',
  alsoBlock: true,
  ...overrides,
});

beforeEach(() => {
  mockRpc.mockReset();
});

describe('REASON_LABELS', () => {
  /** A reason without words could not be offered; words without a reason would be refused. */
  it('has words for exactly the reasons the database records', () => {
    expect(Object.keys(REASON_LABELS).sort()).toEqual([...REPORT_REASONS].sort());
  });

  /** Two reasons that read alike would send the operator one the reporter did not mean. */
  it('gives every reason words of its own', () => {
    const labels = Object.values(REASON_LABELS);

    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(REPORT_REASONS.length);
  });
});

describe('toBlockedCourier', () => {
  it('maps a blocked courier, with when they were blocked as a date', () => {
    expect(toBlockedCourier(blockedRow())).toEqual({
      id: 'ben-id',
      username: 'ben',
      blockedAt: new Date('2026-11-02T14:00:00.000Z'),
    });
  });

  /**
   * A display name is the other person's to change, and the list of the people
   * you have shut out is the last place to show whatever they changed it to.
   * Even if a row ever carried one, a blocked courier has nowhere to put it.
   */
  it('keeps no display name, even if a row carried one', () => {
    const row = { ...blockedRow(), display_name: 'Read this, Mara' };

    expect(toBlockedCourier(row)).not.toHaveProperty('displayName');
    expect(toBlockedCourier(row)).toEqual(toBlockedCourier(blockedRow()));
  });
});

describe('blockCourier', () => {
  it('blocks by the courier’s id, in one call', async () => {
    answer('blocked');

    await blockCourier('ben-id');

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('block_courier', { courier_id: 'ben-id' });
  });

  it.each<BlockOutcome>(['blocked', 'already_blocked'])(
    'reports "%s" as the server did',
    async (outcome) => {
      answer(outcome);

      await expect(blockCourier('ben-id')).resolves.toBe(outcome);
    },
  );

  it('reads an outcome it does not know as blocked', async () => {
    answer('something_new');

    await expect(blockCourier('ben-id')).resolves.toBe('blocked');
  });

  it.each<RefusalReason>(['cannot_block_self', 'courier_not_found'])(
    'explains the refusal "%s" in the app’s words',
    async (hint) => {
      const error = refusal(hint);
      fail(error);

      const blocking = blockCourier('ben-id');

      await expect(blocking).rejects.toBeInstanceOf(RpcError);
      await expect(blocking).rejects.toMatchObject({
        message: REFUSALS[hint],
        reason: hint,
        cause: error,
      });
    },
  );

  it('says the courier could not be blocked when anything else goes wrong', async () => {
    fail(UNEXPECTED);

    await expect(blockCourier('ben-id')).rejects.toMatchObject({
      message: 'That courier could not be blocked. Try again.',
      reason: null,
      cause: UNEXPECTED,
    });
  });
});

describe('unblockCourier', () => {
  it('lifts the block by the courier’s id, in one call', async () => {
    answer(null);

    await expect(unblockCourier('ben-id')).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('unblock_courier', { courier_id: 'ben-id' });
  });

  it('asks the courier to sign in again when their session has ended', async () => {
    fail({ message: 'not authenticated', code: '28000', hint: null });

    await expect(unblockCourier('ben-id')).rejects.toMatchObject({
      message: 'Your session has ended. Sign in again.',
      reason: null,
    });
  });

  it('says the courier could not be unblocked when anything else goes wrong', async () => {
    fail(UNEXPECTED);

    await expect(unblockCourier('ben-id')).rejects.toMatchObject({
      message: 'That courier could not be unblocked. Try again.',
      reason: null,
    });
  });
});

describe('fetchBlocked', () => {
  it('asks for the list and maps every row, in the order the server sent it', async () => {
    const newer = blockedRow();
    const older = blockedRow({
      courier_id: 'cleo-id',
      username: 'cleo',
      blocked_at: '2026-10-28T09:30:00.000Z',
    });
    answer([newer, older]);

    const blocked = await fetchBlocked();

    expect(mockRpc).toHaveBeenCalledWith('list_blocked');
    expect(blocked).toEqual([toBlockedCourier(newer), toBlockedCourier(older)]);
  });

  it('reads no rows as nobody blocked', async () => {
    answer(null);

    await expect(fetchBlocked()).resolves.toEqual([]);
  });

  it('says there is no connection when the request never reached the server', async () => {
    fail({ message: 'TypeError: Network request failed', code: '', hint: '' });

    await expect(fetchBlocked()).rejects.toMatchObject({
      message: 'No connection. Check your network and try again.',
    });
  });

  it('says the blocked couriers could not be loaded when anything else goes wrong', async () => {
    fail(UNEXPECTED);

    await expect(fetchBlocked()).rejects.toMatchObject({
      message: 'Your blocked couriers could not be loaded.',
      reason: null,
    });
  });
});

/** Everything a report of a letter and a report of a courier have in common. */
describe.each([
  {
    name: 'reportLetter',
    send: (what: Report) => reportLetter('letter-1', what),
    rpc: 'report_letter',
    about: { message_id: 'letter-1' } as Record<string, string>,
  },
  {
    name: 'reportCourier',
    send: (what: Report) => reportCourier('ben-id', what),
    rpc: 'report_courier',
    about: { courier_id: 'ben-id' } as Record<string, string>,
  },
])('$name', ({ send, rpc, about }) => {
  it('sends what is reported, the reason, the trimmed note and whether to block, in one call', async () => {
    answer('reported');

    await send(report({ note: '  \nHe writes every night, after I asked him to stop.\n  ' }));

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(rpc, {
      ...about,
      reason: 'harassment',
      note: 'He writes every night, after I asked him to stop.',
      also_block: true,
    });
  });

  /** Left out, the note takes the database's default: no note, rather than one of blank space. */
  it.each([
    ['empty', ''],
    ['nothing but blank space', ' \n\t  \n '],
  ])('leaves the note out entirely when it is %s', async (_, note) => {
    answer('reported');

    await send(report({ note }));

    expect(sentArguments()).not.toHaveProperty('note');
    expect(mockRpc).toHaveBeenCalledWith(rpc, { ...about, reason: 'harassment', also_block: true });
  });

  /** Blocking in the same step is the default; turning it off has to reach the database. */
  it.each([
    [true, 'on'],
    [false, 'off'],
  ])('sends also_block: %s when blocking is turned %s', async (alsoBlock) => {
    answer('reported');

    await send(report({ alsoBlock }));

    expect(sentArguments()).toHaveProperty('also_block', alsoBlock);
  });

  /**
   * 'limit_reached' is an answer rather than a refusal: the day's reports are
   * used up, and the block asked for with this one has still been made. A
   * refusal would have rolled the block back. (Found in review.)
   */
  it.each<ReportOutcome>(['reported', 'already_reported', 'limit_reached'])(
    'reports "%s" as the server did',
    async (outcome) => {
      answer(outcome);

      await expect(send(report())).resolves.toBe(outcome);
    },
  );

  it('reads an outcome it does not know as reported', async () => {
    answer('something_new');

    await expect(send(report())).resolves.toBe('reported');
  });

  it.each<RefusalReason>(['unknown_reason', 'note_too_long'])(
    'explains the refusal "%s" in the app’s words',
    async (hint) => {
      const error = refusal(hint);
      fail(error);

      const sending = send(report());

      await expect(sending).rejects.toBeInstanceOf(RpcError);
      await expect(sending).rejects.toMatchObject({
        message: REFUSALS[hint],
        reason: hint,
        cause: error,
      });
    },
  );

  it('says the report could not be sent when anything else goes wrong', async () => {
    fail(UNEXPECTED);

    await expect(send(report())).rejects.toMatchObject({
      message: 'The report could not be sent. Check your connection.',
      reason: null,
      cause: UNEXPECTED,
    });
  });
});

describe('reportLetter', () => {
  /**
   * Only a letter that has landed for the reporter can be reported - what they
   * have read, nothing else - and any other is refused as one that is not there.
   */
  it('says the letter could not be found when it has not landed for the reporter', async () => {
    fail(refusal('message_not_found'));

    await expect(reportLetter('letter-1', report())).rejects.toMatchObject({
      message: REFUSALS.message_not_found,
      reason: 'message_not_found',
    });
  });
});

describe('reportCourier', () => {
  it.each<RefusalReason>(['cannot_report_self', 'courier_not_found'])(
    'explains the refusal "%s" in the app’s words',
    async (hint) => {
      fail(refusal(hint));

      await expect(reportCourier('ben-id', report())).rejects.toMatchObject({
        message: REFUSALS[hint],
        reason: hint,
      });
    },
  );
});

describe('prepareNote', () => {
  it('drops blank space before and after the note, and keeps the rest as it was typed', () => {
    expect(prepareNote('\n  He wrote:\n\n  "you will see"  \n')).toBe(
      'He wrote:\n\n  "you will see"',
    );
  });
});

describe('noteLength', () => {
  it('counts plain text by its characters', () => {
    expect(noteLength('Spam')).toBe(4);
    expect(noteLength('Grüße aus Zürich')).toBe(16);
  });

  /**
   * Postgres counts characters; JavaScript's `length` counts UTF-16 units and
   * says 2 for one bat. The limit on screen has to be the one the server keeps.
   */
  it('counts an emoji as one character, as the database does', () => {
    expect('🦇'.length).toBe(2);
    expect(noteLength('🦇')).toBe(1);
    expect(noteLength('Stop 🛑🦇')).toBe(7);
  });

  /** `char_length` counts code points, so a joined emoji costs each of its parts. */
  it('counts a joined emoji by its code points, as the database does', () => {
    expect(noteLength('👩‍👩‍👧')).toBe(5);
  });

  it('counts the note as it will be sent, without the blank space around it', () => {
    expect(noteLength('  \n spam \t ')).toBe(4);
  });

  it('is zero for nothing, and for nothing but blank space', () => {
    expect(noteLength('')).toBe(0);
    expect(noteLength(' \n\t ')).toBe(0);
  });
});

describe('validateNote', () => {
  /** The note is optional: a report says what is wrong by its reason alone. */
  it('accepts no note at all', () => {
    expect(validateNote('')).toBeNull();
    expect(validateNote('   ')).toBeNull();
  });

  it('accepts a note of exactly the maximum length', () => {
    expect(validateNote('a'.repeat(REPORT_NOTE_MAX_LENGTH))).toBeNull();
  });

  it('refuses one character more', () => {
    expect(validateNote('a'.repeat(REPORT_NOTE_MAX_LENGTH + 1))).toBe(
      `A note can be at most ${REPORT_NOTE_MAX_LENGTH} characters.`,
    );
  });

  /** Twice the limit in UTF-16 units, exactly the limit in characters. */
  it('measures a note full of emoji in characters, not in UTF-16 units', () => {
    expect(validateNote('🦇'.repeat(REPORT_NOTE_MAX_LENGTH))).toBeNull();
    expect(validateNote('🦇'.repeat(REPORT_NOTE_MAX_LENGTH + 1))).not.toBeNull();
  });

  it('measures the note as it will be sent, without the blank space around it', () => {
    expect(validateNote(`  \n${'a'.repeat(REPORT_NOTE_MAX_LENGTH)}\n  `)).toBeNull();
  });

  it('uses the same words as the database when it refuses', () => {
    expect(validateNote('a'.repeat(REPORT_NOTE_MAX_LENGTH + 1))).toBe(REFUSALS.note_too_long);
  });
});
