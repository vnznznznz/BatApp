/**
 * A random version 4 UUID.
 *
 * Used for the `client_ref` that makes a repeated send safe, which needs only to
 * be unlikely to repeat - not to be unguessable: the server scopes it to the
 * sender, so another courier's ref can never match. The platform's generator is
 * used where it exists (the web, newer engines); elsewhere Math.random is ample.
 */
export function randomUuid(): string {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (native) return native.call(globalThis.crypto);

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
