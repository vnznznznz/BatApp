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

/**
 * On this device only, and only while it is unlocked: a backup restored to
 * another phone does not bring a live session with it. A new phone signs in
 * again. (iOS; Android leaves these entries out of backups altogether - the
 * expo-secure-store plugin's default backup rules.)
 */
export const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const CHUNK_SIZE = 1600;
const MANIFEST_PREFIX = 'ncchunks:';

/**
 * A chunked value is written to one of two sets of entries in turn, never over
 * the set the manifest names. The manifest - one entry, so one write - is what
 * switches from the old set to the new, which is how a write that stops half
 * way leaves the previous value whole.
 */
const GENERATIONS = ['a', 'b'] as const;
type Generation = (typeof GENERATIONS)[number];

/**
 * `generation` is null for a value written before there were generations; its
 * chunks sit directly under the key.
 */
type Manifest = { count: number; generation: Generation | null };

/**
 * How many chunks of each set to clear when the manifest that would say how
 * many there are cannot be read. Several times what a session needs.
 */
const MAX_UNKNOWN_CHUNKS = 8;

const chunkKey = (key: string, generation: Generation | null, index: number) =>
  generation === null ? `${key}.${index}` : `${key}.${generation}.${index}`;

function parseManifest(head: string): Manifest | null {
  // Three digits at most: far more chunks than any value has, and few enough
  // that an entry gone wrong cannot send a write or a removal after millions.
  const match = /^ncchunks:(\d{1,3})(?::([ab]))?$/.exec(head);
  if (!match) return null;
  return { count: Number(match[1]), generation: (match[2] as Generation | undefined) ?? null };
}

/**
 * The manifest now under `key`: null when the entry is empty or holds a small
 * value, undefined when the keychain would not say.
 */
async function readManifest(key: string): Promise<Manifest | null | undefined> {
  try {
    const head = await SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS);
    return head == null ? null : parseManifest(head);
  } catch {
    return undefined;
  }
}

/** The chunk entries `manifest` names; every one there could be when it is unknown. */
function chunkKeys(key: string, manifest: Manifest | null | undefined): string[] {
  if (manifest === null) return [];
  if (manifest === undefined) {
    return [null, ...GENERATIONS].flatMap((generation) =>
      Array.from({ length: MAX_UNKNOWN_CHUNKS }, (_, index) => chunkKey(key, generation, index)),
    );
  }
  return Array.from({ length: manifest.count }, (_, index) =>
    chunkKey(key, manifest.generation, index),
  );
}

async function clear(keys: string[]): Promise<void> {
  for (const key of keys) {
    // Best effort: a chunk no manifest names is never read again, so one that
    // will not delete must not fail the write or the removal it follows.
    await SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS).catch(() => {});
  }
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const head = await SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS);
      // Loose equality on purpose: the declared type is `string | null`, but the
      // native module resolves `undefined` for a missing key on some platforms,
      // and a strict null check would then call `startsWith` on it.
      if (head == null) return null;
      if (!head.startsWith(MANIFEST_PREFIX)) return head;

      const manifest = parseManifest(head);
      if (!manifest) return null;

      const parts: string[] = [];
      for (let i = 0; i < manifest.count; i++) {
        const part = await SecureStore.getItemAsync(
          chunkKey(key, manifest.generation, i),
          KEYCHAIN_OPTIONS,
        );
        if (part == null) {
          // The chunk may be gone because a write has just switched to the
          // other set and cleared this one away: the manifest has then changed
          // too, and says where the value is now.
          const now = await SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS);
          if (now !== head) return await secureStorage.getItem(key);
          // A partially written value is unusable; treat it as absent so the
          // user is asked to sign in again rather than handed a corrupt token.
          return null;
        }
        parts.push(part);
      }
      return parts.join('');
    } catch {
      // The keychain refused the read: a value that no longer decrypts, or a
      // keychain not available at this moment. Nothing usable is there now, and
      // saying so lets the app start; the entry is left alone, because the next
      // read may succeed.
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    // Unknown when the read is refused. The write goes ahead all the same, so
    // that signing in again can replace an entry that can no longer be read.
    const previous = await readManifest(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS);
      await clear(chunkKeys(key, previous));
      return;
    }

    const generation: Generation = previous?.generation === 'a' ? 'b' : 'a';
    const written: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      const chunk = chunkKey(key, generation, written.length);
      await SecureStore.setItemAsync(chunk, value.slice(i, i + CHUNK_SIZE), KEYCHAIN_OPTIONS);
      written.push(chunk);
    }

    // Chunks first, manifest last: until this one write, the old manifest still
    // points at the previous value, none of whose chunks have been touched.
    await SecureStore.setItemAsync(
      key,
      `${MANIFEST_PREFIX}${written.length}:${generation}`,
      KEYCHAIN_OPTIONS,
    );
    await clear(chunkKeys(key, previous).filter((chunk) => !written.includes(chunk)));
  },

  async removeItem(key: string): Promise<void> {
    const previous = await readManifest(key);

    await SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS);
    await clear(chunkKeys(key, previous));
  },
};
