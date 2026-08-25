import * as SecureStore from 'expo-secure-store';

/**
 * Session storage for Supabase, backed by the device keychain.
 *
 * Auth tokens are bearer credentials: anyone holding one is the user until it
 * expires. They belong in the keychain, not in AsyncStorage, which is plain
 * text on disk.
 *
 * SecureStore becomes unreliable above roughly 2 KB per entry, and a Supabase
 * session — two JWTs plus user metadata — routinely exceeds that. Values are
 * therefore split across numbered entries, with the primary key holding a
 * manifest. The alternative, silently dropping to AsyncStorage, would trade a
 * visible failure for an invisible one.
 */

const CHUNK_SIZE = 1600;
const MANIFEST_PREFIX = 'ncchunks:';

const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function clearChunks(key: string, from: number, to: number): Promise<void> {
  for (let i = from; i < to; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    // Loose equality on purpose: the declared type is `string | null`, but the
    // native module resolves `undefined` for a missing key on some platforms,
    // and a strict null check would then call `startsWith` on it.
    if (head == null) return null;
    if (!head.startsWith(MANIFEST_PREFIX)) return head;

    const total = Number.parseInt(head.slice(MANIFEST_PREFIX.length), 10);
    if (!Number.isInteger(total) || total < 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < total; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // A partially written value is unusable; treat it as absent so the user
      // is asked to sign in again rather than handed a corrupt token.
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const previous = await SecureStore.getItemAsync(key);
    const previousCount = previous?.startsWith(MANIFEST_PREFIX)
      ? Number.parseInt(previous.slice(MANIFEST_PREFIX.length), 10) || 0
      : 0;

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      await clearChunks(key, 0, previousCount);
      return;
    }

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    // Chunks first, manifest last: if this is interrupted, the old manifest
    // still points at a complete set rather than at a half-written one.
    for (const [index, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(chunkKey(key, index), chunk);
    }
    await SecureStore.setItemAsync(key, `${MANIFEST_PREFIX}${chunks.length}`);
    await clearChunks(key, chunks.length, previousCount);
  },

  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(key);
    const total = head?.startsWith(MANIFEST_PREFIX)
      ? Number.parseInt(head.slice(MANIFEST_PREFIX.length), 10) || 0
      : 0;

    await SecureStore.deleteItemAsync(key);
    await clearChunks(key, 0, total);
  },
};
