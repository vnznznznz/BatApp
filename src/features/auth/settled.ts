/** What became of a promise: the value it brought, or what it failed with. */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Waits for `promise` and says what became of it, without a try statement.
 *
 * For the forms and the auth provider, which have to let go of a request in
 * flight however it ends. The React Compiler takes no try statement with a
 * `finally`, or without a `catch`, and leaves the whole component as it is,
 * unmemoised, when it meets one. (Found in review: the reset screen, the code
 * screen and the auth provider had all stopped being compiled.)
 */
export function settled<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

/** The words of whatever a request failed with. */
export const wordsOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';
