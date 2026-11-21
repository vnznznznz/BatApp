import { forgetAllDrafts, keepDraft, readDraft, readSend } from '@/features/messages/drafts';
import { fetchSentLetter, sendMessage, type Dispatch } from '@/features/messages/messages';
import {
  askAfterLetter,
  askAfterLetterAt,
  onLetterOutcome,
  sendLetter,
  type Addressee,
  type Outcome,
} from '@/features/messages/sending';
import { REFUSALS, RpcError } from '@/lib/rpc-error';

// The order of things is under test - what is asked when, and what is kept -
// not the network. The two calls that reach the server are replaced; the store
// of unsent letters is the real one.
jest.mock('@/features/messages/messages', () => ({
  ...jest.requireActual('@/features/messages/messages'),
  sendMessage: jest.fn(),
  fetchSentLetter: jest.fn(),
}));

const mockedSendMessage = jest.mocked(sendMessage);
const mockedFetchSentLetter = jest.mocked(fetchSentLetter);

const NOW = new Date('2026-10-31T21:00:00Z').getTime();
const SECOND = 1000;
const HOUR = 3600 * SECOND;

const MARA = 'user-mara';
const anna: Addressee = { id: 'user-anna', name: 'Anna Weber', city: 'Munich', from: 'Berlin' };
const eva: Addressee = { id: 'user-eva', name: 'Eva Novak', city: 'Vienna', from: 'Berlin' };

const onItsWay = (): Dispatch => ({
  id: 'letter-to-anna',
  deliverAt: new Date(NOW + 6 * HOUR),
  distanceKm: 504.6,
});

/** A request that ended without the server saying anything. */
const noAnswer = () => new RpcError('No connection. Check your network and try again.', null);

/** The database's refusal of everything a suspended account asks. */
const suspended = () => new RpcError(REFUSALS.account_suspended, 'account_suspended');

/** A promise the test settles by hand, to look at things while a call is out. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Everything told about Mara's letters so far, in order: who it was for, and what became of it. */
let told: [recipientId: string, outcome: Outcome][];
let stopListening: () => void;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  forgetAllDrafts();
  mockedSendMessage.mockReset().mockImplementation(async () => onItsWay());
  mockedFetchSentLetter.mockReset().mockResolvedValue(null);
  told = [];
  stopListening = onLetterOutcome((courierId, recipientId, outcome) => {
    if (courierId === MARA) told.push([recipientId, outcome]);
  });
});

afterEach(() => {
  stopListening();
  jest.useRealTimers();
});

/** The letter is written and sent in one go, and the test waits for what became of it. */
async function writeAndSend(to: Addressee, text: string) {
  keepDraft(MARA, to.id, text);
  await sendLetter(MARA, to);
}

describe('sendLetter', () => {
  it('sends the words as they stand, trimmed, under a reference of their own', async () => {
    await writeAndSend(anna, '  Dear Anna,\n\nSee you soon.\n');

    expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    expect(mockedSendMessage).toHaveBeenCalledWith(
      'user-anna',
      'Dear Anna,\n\nSee you soon.',
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it('tells whoever is listening that it went, to whom, and when it lands', async () => {
    await writeAndSend(anna, 'Dear Anna,');

    expect(told).toEqual([
      [
        'user-anna',
        { kind: 'sent', to: anna, dispatch: onItsWay(), arrived: false, changed: false },
      ],
    ]);
  });

  it('tells nobody who has stopped listening', async () => {
    stopListening();

    await writeAndSend(anna, 'Dear Anna,');

    expect(told).toEqual([]);
  });

  it('shows the letter as on its way out, to anyone who looks, until the answer is in', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValue(sending.promise);
    keepDraft(MARA, 'user-anna', 'Dear Anna,');

    const sent = sendLetter(MARA, anna);
    expect(readSend(MARA, 'user-anna').busy).toBe(true);

    sending.reject(new RpcError(REFUSALS.no_available_bat, 'no_available_bat'));
    await sent;
    expect(readSend(MARA, 'user-anna').busy).toBe(false);
  });

  /**
   * The button's own guard against a second tap, and the reason a screen opened
   * while a letter is on its way out cannot send it again.
   */
  it('does nothing for a letter that is already on its way out', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValue(sending.promise);
    keepDraft(MARA, 'user-anna', 'Dear Anna,');
    const first = sendLetter(MARA, anna);

    await sendLetter(MARA, anna);

    expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    expect(told).toEqual([]);

    sending.resolve(onItsWay());
    await first;
    expect(told).toHaveLength(1);
  });

  it('sends a letter to someone else meanwhile: each letter is its own', async () => {
    const toAnna = deferred<Dispatch>();
    mockedSendMessage.mockReturnValueOnce(toAnna.promise);
    keepDraft(MARA, 'user-anna', 'Dear Anna,');
    const first = sendLetter(MARA, anna);

    await writeAndSend(eva, 'Dear Eva,');

    expect(mockedSendMessage).toHaveBeenCalledTimes(2);
    expect(told.map(([recipientId]) => recipientId)).toEqual(['user-eva']);

    toAnna.resolve(onItsWay());
    await first;
  });

  /**
   * Nothing here waits for a screen. Whether or not anyone is still listening,
   * what became of the letter is noted with it - which is what a screen opened
   * later goes by.
   */
  describe('with nobody left to hear of it', () => {
    beforeEach(() => stopListening());

    it('forgets the letter once it has gone', async () => {
      await writeAndSend(anna, 'Dear Anna,');

      expect(readDraft(MARA, 'user-anna')).toBe('');
      expect(readSend(MARA, 'user-anna')).toEqual({ busy: false, unanswered: null });
    });

    it('keeps the letter when the server refused it, with nothing unanswered about it', async () => {
      mockedSendMessage.mockRejectedValue(
        new RpcError(REFUSALS.no_available_bat, 'no_available_bat'),
      );

      await writeAndSend(anna, 'Dear Anna,');

      expect(readDraft(MARA, 'user-anna')).toBe('Dear Anna,');
      expect(readSend(MARA, 'user-anna')).toEqual({ busy: false, unanswered: null });
    });

    it('keeps the letter, and the reference it may have gone under, when no answer came', async () => {
      mockedSendMessage.mockRejectedValue(noAnswer());
      mockedFetchSentLetter.mockRejectedValue(noAnswer());

      await writeAndSend(anna, 'Dear Anna,  ');

      expect(readDraft(MARA, 'user-anna')).toBe('Dear Anna,  ');
      expect(readSend(MARA, 'user-anna')).toEqual({
        busy: false,
        unanswered: {
          ref: mockedSendMessage.mock.calls[0]?.[2],
          words: 'Dear Anna,',
          unknown: true,
          since: NOW,
          askAt: NOW + 2 * SECOND,
        },
      });
    });

    it('keeps the reference, no longer as unknown, when the server says that nothing went', async () => {
      mockedSendMessage.mockRejectedValue(noAnswer());

      await writeAndSend(anna, 'Dear Anna,');

      expect(readDraft(MARA, 'user-anna')).toBe('Dear Anna,');
      expect(readSend(MARA, 'user-anna').unanswered).toMatchObject({
        ref: mockedSendMessage.mock.calls[0]?.[2],
        words: 'Dear Anna,',
        unknown: false,
      });
    });
  });

  it('takes anything but a refusal for "no answer", and asks', async () => {
    mockedSendMessage.mockRejectedValue(new TypeError('Network request failed'));
    mockedFetchSentLetter.mockResolvedValue(onItsWay());

    await writeAndSend(anna, 'Dear Anna,');

    expect(mockedFetchSentLetter).toHaveBeenCalledWith(mockedSendMessage.mock.calls[0]?.[2]);
    expect(told).toEqual([
      [
        'user-anna',
        { kind: 'sent', to: anna, dispatch: onItsWay(), arrived: false, changed: false },
      ],
    ]);
  });

  /**
   * Asked after a send that got no answer, the server has no such letter. It
   * has just answered, so the connection works: what is known now is that the
   * letter did not go, and that is what is said. (Found in review: it said "No
   * connection", the failure of the send.)
   */
  it('says that the letter did not go when the server, asked, has no such letter', async () => {
    mockedSendMessage.mockRejectedValueOnce(noAnswer());

    await writeAndSend(anna, 'Dear Anna,');

    expect(mockedFetchSentLetter).toHaveBeenCalledTimes(1);
    expect(told).toEqual([
      ['user-anna', { kind: 'held', message: 'Your letter did not go. It is still here to send.' }],
    ]);
  });

  /**
   * The letter is on its way out until its send ends, and nothing here ends
   * it: a request nobody answers is given up by the client's own fetch, after
   * twenty seconds, with what React Native's fetch throws for a request that
   * never arrived. Never given up, it kept the letter read-only and the button
   * spinning, on every screen, for as long as the app ran. (Found in review.)
   * Given up, it is a send without an answer like any other.
   */
  it('lets go of a letter whose send was given up, and keeps the reference it may have gone under', async () => {
    const LIMIT = 20 * SECOND;
    const givenUp = () =>
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new TypeError('Network request timed out')), LIMIT);
      });
    mockedSendMessage.mockImplementationOnce(givenUp);
    // Nor does asking what became of it get through.
    mockedFetchSentLetter.mockImplementationOnce(givenUp);
    keepDraft(MARA, 'user-anna', 'Dear Anna,');

    const sent = sendLetter(MARA, anna);
    await jest.advanceTimersByTimeAsync(2 * LIMIT - 1);
    expect(readSend(MARA, 'user-anna').busy).toBe(true);
    await jest.advanceTimersByTimeAsync(1);
    await sent;

    const ref = mockedSendMessage.mock.calls[0]?.[2];
    expect(mockedFetchSentLetter).toHaveBeenCalledWith(ref);
    expect(told).toEqual([['user-anna', { kind: 'unknown' }]]);
    expect(readSend(MARA, 'user-anna')).toEqual({
      busy: false,
      unanswered: {
        ref,
        words: 'Dear Anna,',
        unknown: true,
        since: NOW + LIMIT,
        // Half as long again as the question has been open by then.
        askAt: NOW + 2 * LIMIT + LIMIT / 2,
      },
    });

    // The same words can go again at once, as the same letter.
    await sendLetter(MARA, anna);
    expect(mockedSendMessage).toHaveBeenCalledTimes(2);
    expect(mockedSendMessage).toHaveBeenLastCalledWith('user-anna', 'Dear Anna,', ref);
  });

  /**
   * Other words went out before without an answer, and what became of them
   * still cannot be found out. These do not go - they could be a second letter
   * behind the courier's back - and whoever pressed Send is told that they were
   * held back, not merely that something is not known. (Found in review: the
   * screen could not tell such a press from nothing having happened.)
   */
  it('holds changed words back, and says so, while it cannot find out what became of the first', async () => {
    mockedSendMessage.mockRejectedValueOnce(noAnswer());
    mockedFetchSentLetter.mockRejectedValue(noAnswer());
    await writeAndSend(anna, 'Dear Anna,');
    const first = readSend(MARA, 'user-anna').unanswered!;
    told = [];
    jest.setSystemTime(NOW + 10 * SECOND);

    await writeAndSend(anna, 'Dear Anna, one more thing.');

    expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    expect(mockedFetchSentLetter).toHaveBeenLastCalledWith(first.ref);
    expect(told).toEqual([['user-anna', { kind: 'withheld' }]]);
    expect(readDraft(MARA, 'user-anna')).toBe('Dear Anna, one more thing.');
    // Still the first letter's question, asked again later.
    expect(readSend(MARA, 'user-anna')).toEqual({
      busy: false,
      unanswered: { ...first, askAt: NOW + 15 * SECOND },
    });
  });

  /**
   * A refusal answers what was open, too: the server looks for a letter under
   * the reference before anything else, and would have answered with it.
   */
  it('knows, after a refusal, that the earlier try under the same reference did not go either', async () => {
    mockedSendMessage.mockRejectedValueOnce(noAnswer());
    mockedFetchSentLetter.mockRejectedValue(noAnswer());
    await writeAndSend(anna, 'Dear Anna,');
    expect(readSend(MARA, 'user-anna').unanswered?.unknown).toBe(true);

    mockedSendMessage.mockRejectedValueOnce(
      new RpcError(REFUSALS.no_available_bat, 'no_available_bat'),
    );
    await sendLetter(MARA, anna);

    expect(told.at(-1)).toEqual([
      'user-anna',
      { kind: 'held', message: REFUSALS.no_available_bat },
    ]);
    expect(readSend(MARA, 'user-anna').unanswered).toMatchObject({
      ref: mockedSendMessage.mock.calls[0]?.[2],
      unknown: false,
    });
  });

  /**
   * Refused, the question has an answer of a kind: the server will not say
   * what became of the letter, for a reason of its own, and asking again would
   * only be refused again. A suspended account was asked after without end,
   * and never told why. (Found in the merged tree.)
   */
  it('says why, and keeps the letter in doubt, when asking after a send without an answer is refused', async () => {
    mockedSendMessage.mockRejectedValueOnce(noAnswer());
    mockedFetchSentLetter.mockRejectedValue(suspended());

    await writeAndSend(anna, 'Dear Anna,');

    expect(told).toEqual([['user-anna', { kind: 'held', message: REFUSALS.account_suspended }]]);
    // Noted as any letter in doubt is: asked after once more, a moment later,
    // by the screen showing it. Refused again, it is left as it is (see
    // askAfterLetter).
    expect(readSend(MARA, 'user-anna').unanswered).toEqual({
      ref: mockedSendMessage.mock.calls[0]?.[2],
      words: 'Dear Anna,',
      unknown: true,
      since: NOW,
      askAt: NOW + 2 * SECOND,
    });
  });

  /**
   * A suspended account is refused before the server looks for the letter's
   * reference at all (private.caller(), in send_message's declarations), so the
   * refusal says nothing about a letter that may have gone under it. Taken for
   * "nothing went", the letter stopped being in doubt: its words went back to
   * being merely unsent, and nothing asked after it again. (Found in review,
   * on the real server: once the suspension was lifted, the same reference
   * was answered with the letter that had gone.)
   */
  it('keeps a letter in doubt when the same words are refused for a suspended account', async () => {
    mockedSendMessage.mockRejectedValueOnce(noAnswer());
    mockedFetchSentLetter.mockRejectedValue(suspended());
    await writeAndSend(anna, 'Dear Anna,');
    const inDoubt = readSend(MARA, 'user-anna').unanswered;
    told = [];

    mockedSendMessage.mockRejectedValueOnce(suspended());
    await sendLetter(MARA, anna);

    expect(mockedSendMessage.mock.calls[1]?.[2]).toBe(inDoubt?.ref);
    expect(told).toEqual([['user-anna', { kind: 'held', message: REFUSALS.account_suspended }]]);
    // As it was: still in doubt, and with no new time to ask after it.
    expect(readSend(MARA, 'user-anna').unanswered).toBe(inDoubt);
  });

  it('notes nothing unanswered when the words of a new letter are refused for a suspended account', async () => {
    mockedSendMessage.mockRejectedValueOnce(suspended());

    await writeAndSend(anna, 'Dear Anna,');

    expect(told).toEqual([['user-anna', { kind: 'held', message: REFUSALS.account_suspended }]]);
    expect(readSend(MARA, 'user-anna').unanswered).toBeNull();
  });

  it('holds changed words back with the reason when asking after the first letter is refused', async () => {
    mockedSendMessage.mockRejectedValueOnce(noAnswer());
    mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
    await writeAndSend(anna, 'Dear Anna,');
    const first = readSend(MARA, 'user-anna').unanswered!;
    told = [];
    mockedFetchSentLetter.mockRejectedValue(suspended());

    await writeAndSend(anna, 'Dear Anna, one more thing.');

    expect(mockedSendMessage).toHaveBeenCalledTimes(1);
    expect(told).toEqual([['user-anna', { kind: 'held', message: REFUSALS.account_suspended }]]);
    expect(readDraft(MARA, 'user-anna')).toBe('Dear Anna, one more thing.');
    // Still in doubt, and not set to be asked after again.
    expect(readSend(MARA, 'user-anna').unanswered).toBe(first);
  });

  /**
   * A sign-out clears every unsent letter. An answer that comes back after it
   * must not bring one back, for an account that has left the phone.
   */
  it('brings nothing back when the answer comes after a sign-out', async () => {
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValue(sending.promise);
    mockedFetchSentLetter.mockRejectedValue(noAnswer());
    keepDraft(MARA, 'user-anna', 'Dear Anna,');
    const sent = sendLetter(MARA, anna);

    forgetAllDrafts();
    sending.reject(noAnswer());
    await sent;

    expect(readDraft(MARA, 'user-anna')).toBe('');
    expect(readSend(MARA, 'user-anna')).toEqual({ busy: false, unanswered: null });
  });
});

describe('askAfterLetter', () => {
  /** Leaves Mara's letter to Anna as a send that was never answered, and could not be asked after. */
  async function leaveUnanswered() {
    mockedSendMessage.mockRejectedValueOnce(noAnswer());
    mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
    await writeAndSend(anna, 'Dear Anna,');
    mockedFetchSentLetter.mockClear();
    told = [];
  }

  it('asks nothing about a letter with nothing unanswered', async () => {
    keepDraft(MARA, 'user-anna', 'Dear Anna,');

    await askAfterLetter(MARA, anna);

    expect(mockedFetchSentLetter).not.toHaveBeenCalled();
  });

  it('asks nothing once the server has said that nothing went', async () => {
    mockedSendMessage.mockRejectedValueOnce(noAnswer());
    await writeAndSend(anna, 'Dear Anna,');
    mockedFetchSentLetter.mockClear();

    await askAfterLetter(MARA, anna);

    expect(mockedFetchSentLetter).not.toHaveBeenCalled();
  });

  /** The send that is out will find out for itself; its answer is the answer. */
  it('asks nothing while the letter is on its way out again', async () => {
    await leaveUnanswered();
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValueOnce(sending.promise);
    const sent = sendLetter(MARA, anna);

    await askAfterLetter(MARA, anna);

    expect(mockedFetchSentLetter).not.toHaveBeenCalled();

    sending.resolve(onItsWay());
    await sent;
  });

  it('knows from then on that the letter did not go, when the server has none', async () => {
    await leaveUnanswered();
    const { ref } = readSend(MARA, 'user-anna').unanswered!;
    mockedFetchSentLetter.mockResolvedValue(null);

    await askAfterLetter(MARA, anna);

    expect(told).toEqual([
      [
        'user-anna',
        { kind: 'held', message: 'Your letter did not go after all. It is still here to send.' },
      ],
    ]);
    expect(readDraft(MARA, 'user-anna')).toBe('Dear Anna,');
    // No longer in doubt, and the reference is kept for sending the same words again.
    expect(readSend(MARA, 'user-anna').unanswered).toMatchObject({ ref, unknown: false });
  });

  it('asks by the reference the letter went out under, and forgets a letter that went', async () => {
    await leaveUnanswered();
    mockedFetchSentLetter.mockResolvedValue(onItsWay());

    await askAfterLetter(MARA, anna);

    expect(mockedFetchSentLetter).toHaveBeenCalledWith(mockedSendMessage.mock.calls[0]?.[2]);
    expect(told).toEqual([
      [
        'user-anna',
        { kind: 'sent', to: anna, dispatch: onItsWay(), arrived: false, changed: false },
      ],
    ]);
    expect(readDraft(MARA, 'user-anna')).toBe('');
  });

  it('keeps words changed since as a letter of their own, with nothing left unanswered', async () => {
    await leaveUnanswered();
    keepDraft(MARA, 'user-anna', 'Dear Anna, one more thing.');
    mockedFetchSentLetter.mockResolvedValue(onItsWay());

    await askAfterLetter(MARA, anna);

    expect(told).toEqual([
      [
        'user-anna',
        { kind: 'sent', to: anna, dispatch: onItsWay(), arrived: false, changed: true },
      ],
    ]);
    expect(readDraft(MARA, 'user-anna')).toBe('Dear Anna, one more thing.');
    expect(readSend(MARA, 'user-anna')).toEqual({ busy: false, unanswered: null });
  });

  it.each([
    ['with blank space added', 'Dear Anna,\n  '],
    ['taken out altogether', ''],
  ])('does not count words %s as changed', async (_, written) => {
    await leaveUnanswered();
    keepDraft(MARA, 'user-anna', written);
    mockedFetchSentLetter.mockResolvedValue(onItsWay());

    await askAfterLetter(MARA, anna);

    expect(told).toEqual([
      ['user-anna', expect.objectContaining({ kind: 'sent', changed: false })],
    ]);
    expect(readDraft(MARA, 'user-anna')).toBe('');
  });

  it('says a letter found after its landing time has arrived', async () => {
    await leaveUnanswered();
    const landed = { ...onItsWay(), deliverAt: new Date(NOW) };
    mockedFetchSentLetter.mockResolvedValue(landed);

    await askAfterLetter(MARA, anna);

    expect(told).toEqual([['user-anna', expect.objectContaining({ kind: 'sent', arrived: true })]]);
  });

  it('sets a later time to ask next when it still cannot ask', async () => {
    await leaveUnanswered();
    mockedFetchSentLetter.mockRejectedValue(noAnswer());
    jest.setSystemTime(NOW + 10 * SECOND);

    await askAfterLetter(MARA, anna);

    expect(told).toEqual([]);
    expect(readSend(MARA, 'user-anna').unanswered).toMatchObject({
      unknown: true,
      since: NOW,
      // Half as long again as the question has been open.
      askAt: NOW + 15 * SECOND,
    });
  });

  /**
   * The server refuses to say - the account has been suspended - and would
   * refuse again: the courier is told why, and the letter stays as it was, in
   * doubt, with no later time to ask. It was asked after every minute for as
   * long as it was on screen, without a word. (Found in the merged tree.)
   */
  it('says why, and sets no time to ask again, when the server refuses to answer', async () => {
    await leaveUnanswered();
    const before = readSend(MARA, 'user-anna').unanswered;
    mockedFetchSentLetter.mockRejectedValue(suspended());
    jest.setSystemTime(NOW + 10 * SECOND);

    await askAfterLetter(MARA, anna);

    expect(told).toEqual([['user-anna', { kind: 'held', message: REFUSALS.account_suspended }]]);
    expect(readSend(MARA, 'user-anna').unanswered).toBe(before);
  });

  it('asks once at a time, however many are waiting to know', async () => {
    await leaveUnanswered();
    const asked = deferred<Dispatch | null>();
    mockedFetchSentLetter.mockReturnValue(asked.promise);

    const first = askAfterLetter(MARA, anna);
    const second = askAfterLetter(MARA, anna);
    asked.resolve(onItsWay());
    await Promise.all([first, second]);

    expect(mockedFetchSentLetter).toHaveBeenCalledTimes(1);
    expect(told).toHaveLength(1);

    // And again, once that asking is over and there is still something to ask.
    await leaveUnanswered();
    await askAfterLetter(MARA, anna);
    expect(mockedFetchSentLetter).toHaveBeenCalledTimes(1);
  });

  /**
   * "No such letter" is true for the moment it was asked. If the letter has
   * been sent again since, that answer is out of date, and passing it on could
   * call a letter unsent that is in the air.
   */
  it('throws away an answer that a new send has overtaken', async () => {
    await leaveUnanswered();
    const asked = deferred<Dispatch | null>();
    mockedFetchSentLetter.mockReturnValueOnce(asked.promise);
    const asking = askAfterLetter(MARA, anna);

    // Meanwhile the courier presses Send again. No answer again, and no way to ask.
    mockedSendMessage.mockRejectedValueOnce(noAnswer());
    mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
    await sendLetter(MARA, anna);
    expect(told).toEqual([['user-anna', { kind: 'unknown' }]]);

    asked.resolve(null);
    await asking;

    expect(told).toEqual([['user-anna', { kind: 'unknown' }]]);
    expect(readSend(MARA, 'user-anna').unanswered?.unknown).toBe(true);
  });

  it('throws away an answer that comes while the letter is on its way out again', async () => {
    await leaveUnanswered();
    const asked = deferred<Dispatch | null>();
    mockedFetchSentLetter.mockReturnValueOnce(asked.promise);
    const asking = askAfterLetter(MARA, anna);
    const sending = deferred<Dispatch>();
    mockedSendMessage.mockReturnValueOnce(sending.promise);
    const sent = sendLetter(MARA, anna);

    asked.resolve(null);
    await asking;

    expect(told).toEqual([]);
    expect(readSend(MARA, 'user-anna')).toMatchObject({
      busy: true,
      unanswered: { unknown: true },
    });

    sending.resolve(onItsWay());
    await sent;
  });
});

describe('askAfterLetterAt', () => {
  beforeEach(async () => {
    mockedSendMessage.mockRejectedValueOnce(noAnswer());
    mockedFetchSentLetter.mockRejectedValueOnce(noAnswer());
    await writeAndSend(anna, 'Dear Anna,');
    mockedFetchSentLetter.mockClear();
    mockedFetchSentLetter.mockResolvedValue(onItsWay());
  });

  it('asks when the time comes, and not before', async () => {
    askAfterLetterAt(NOW + 2 * SECOND, MARA, anna);

    await jest.advanceTimersByTimeAsync(2 * SECOND - 1);
    expect(mockedFetchSentLetter).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(mockedFetchSentLetter).toHaveBeenCalledTimes(1);
  });

  it('asks at once when the time has passed', async () => {
    askAfterLetterAt(NOW - HOUR, MARA, anna);

    await jest.advanceTimersByTimeAsync(0);

    expect(mockedFetchSentLetter).toHaveBeenCalledTimes(1);
  });

  it('does not ask once it has been called off', async () => {
    const callOff = askAfterLetterAt(NOW + 2 * SECOND, MARA, anna);

    callOff();
    await jest.advanceTimersByTimeAsync(HOUR);

    expect(mockedFetchSentLetter).not.toHaveBeenCalled();
  });
});
