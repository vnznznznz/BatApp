import { MESSAGE_MAX_LENGTH } from '@/constants/config';
import {
  messageOf,
  REFUSALS,
  RpcError,
  toRpcError,
  type ApiError,
  type RefusalReason,
} from '@/lib/rpc-error';

const FALLBACK = 'Your letters could not be loaded. Check your connection.';
const NO_CONNECTION = 'No connection. Check your network and try again.';
const SESSION_ENDED = 'Your session has ended. Sign in again.';

/** A refusal as PostgREST reports one: SQLSTATE P0001 with a machine-readable hint. */
const refusal = (hint: string): ApiError => ({
  message: 'refused by the database',
  code: 'P0001',
  hint,
});

const reasons = Object.keys(REFUSALS) as RefusalReason[];

// Jest runs this file as CommonJS under Node, which supplies these. The
// project's types are React Native's and do not declare Node's, so the little
// that is needed is typed here rather than pulled in for every file.
declare const __dirname: string;
const { readdirSync, readFileSync } = jest.requireActual<{
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const { join } = jest.requireActual<{ join: (...paths: string[]) => string }>('path');

describe('toRpcError', () => {
  it.each(reasons)('gives the refusal "%s" its own words and names the reason', (reason) => {
    const error = refusal(reason);

    const result = toRpcError(error, FALLBACK);

    expect(result).toBeInstanceOf(RpcError);
    expect(result.message).toBe(REFUSALS[reason]);
    expect(result.reason).toBe(reason);
    expect(result.cause).toBe(error);
  });

  it('states the letter limit the database enforces', () => {
    expect(toRpcError(refusal('message_too_long'), FALLBACK).message).toBe(
      `A letter can be at most ${MESSAGE_MAX_LENGTH} characters.`,
    );
  });

  /**
   * `request_friend` asks for a retry with SQLSTATE 40001 rather than P0001 when
   * two people ask each other at the same moment. The hint is what counts.
   */
  it('reads the hint whatever the error code', () => {
    const result = toRpcError(
      { message: 'could not serialize access', code: '40001', hint: 'try_again' },
      FALLBACK,
    );

    expect(result.message).toBe(REFUSALS.try_again);
    expect(result.reason).toBe('try_again');
  });

  it('does not count a hint it has no words for as a refusal', () => {
    const result = toRpcError(refusal('bat_needs_a_nap'), FALLBACK);

    expect(result.message).toBe(FALLBACK);
    expect(result.reason).toBeNull();
  });

  /**
   * The lookup is into a plain object, which inherits from Object.prototype. A
   * hint that happens to name an inherited member must not be mistaken for a
   * reason - nor show the source of a function as the error message.
   */
  it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf'])(
    'does not mistake the inherited name "%s" for a refusal',
    (hint) => {
      const result = toRpcError(refusal(hint), FALLBACK);

      expect(result.message).toBe(FALLBACK);
      expect(result.reason).toBeNull();
    },
  );

  it('ignores an empty or missing hint', () => {
    expect(toRpcError({ message: 'boom', code: 'XX000', hint: '' }, FALLBACK).reason).toBeNull();
    expect(toRpcError({ message: 'boom', code: 'XX000', hint: null }, FALLBACK).reason).toBeNull();
    expect(toRpcError({ message: 'boom' }, FALLBACK).message).toBe(FALLBACK);
  });

  /**
   * What supabase-js reports when the request never reached the server: React
   * Native's fetch says "Network request failed", a browser's "Failed to fetch".
   */
  it.each([
    'TypeError: Network request failed',
    'TypeError: Network request timed out',
    'TypeError: Failed to fetch',
    'FetchError: request to https://example.supabase.co failed',
  ])('says there is no connection for "%s"', (message) => {
    const error: ApiError = { message, code: '', hint: '' };

    const result = toRpcError(error, FALLBACK);

    expect(result.message).toBe(NO_CONNECTION);
    expect(result.reason).toBeNull();
    expect(result.cause).toBe(error);
  });

  it.each<[string, ApiError]>([
    ['the database does not know the caller', { message: 'not authenticated', code: '28000' }],
    [
      'PostgREST cannot read the token',
      { message: 'JWSError JWSInvalidSignature', code: 'PGRST301' },
    ],
    ['the token has expired', { message: 'JWT expired', code: 'PGRST303' }],
    ['the message mentions the token in any case', { message: 'invalid jwt claims', code: null }],
  ])('asks the user to sign in again when %s', (_, error) => {
    const result = toRpcError(error, FALLBACK);

    expect(result.message).toBe(SESSION_ENDED);
    expect(result.reason).toBeNull();
    expect(result.cause).toBe(error);
  });

  it('uses the words of the screen that asked for anything else, keeping the original', () => {
    const error: ApiError = {
      message: 'duplicate key value violates unique constraint "messages_pkey"',
      code: '23505',
      hint: null,
    };

    const result = toRpcError(error, FALLBACK);

    expect(result.message).toBe(FALLBACK);
    expect(result.reason).toBeNull();
    expect(result.cause).toBe(error);
  });

  /** The database phrases its messages for whoever reads the logs, not for the courier. */
  it("shows the app's words for a refusal, not the database's", () => {
    const error: ApiError = {
      message: 'every bat is out flying',
      code: 'P0001',
      hint: 'no_available_bat',
    };

    expect(toRpcError(error, FALLBACK).message).toBe(
      'All your bats are out flying. One will be home soon.',
    );
  });

  /**
   * A hint the migrations raise but this file has no words for is not an error
   * anywhere - the person is simply shown the generic fallback instead of being
   * told what to do. Reading the migrations makes adding one without the other
   * fail here.
   */
  it('has words for every refusal the migrations can raise', () => {
    const migrations = join(__dirname, '..', '..', 'supabase', 'migrations');
    const raised = readdirSync(migrations)
      .filter((file) => file.endsWith('.sql'))
      .flatMap((file) =>
        Array.from(
          readFileSync(join(migrations, file), 'utf8').matchAll(/\bhint\s*=\s*'([a-z_]+)'/g),
          (match) => match[1],
        ),
      );

    expect(raised.length).toBeGreaterThan(0);
    expect(raised.filter((hint) => !reasons.includes(hint as RefusalReason))).toEqual([]);
  });
});

describe('RpcError', () => {
  it('is an Error that names itself', () => {
    const error = new RpcError('That letter could not be found.', 'message_not_found');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RpcError);
    expect(error.name).toBe('RpcError');
    expect(error.message).toBe('That letter could not be found.');
    expect(error.reason).toBe('message_not_found');
  });
});

describe('messageOf', () => {
  it("returns an error's own message", () => {
    expect(messageOf(new Error('Nobody has that username.'))).toBe('Nobody has that username.');
    expect(messageOf(toRpcError(refusal('not_friends'), FALLBACK))).toBe(REFUSALS.not_friends);
  });

  it('falls back for an error with nothing to say', () => {
    expect(messageOf(new Error(''))).toBe('Something went wrong.');
  });

  it('falls back for anything thrown that is not an Error', () => {
    expect(messageOf('a string')).toBe('Something went wrong.');
    expect(messageOf({ message: 'looks like an error, is not one' })).toBe('Something went wrong.');
    expect(messageOf(undefined)).toBe('Something went wrong.');
    expect(messageOf(null)).toBe('Something went wrong.');
  });

  it('uses the fallback it is given', () => {
    expect(messageOf(null, FALLBACK)).toBe(FALLBACK);
  });
});
