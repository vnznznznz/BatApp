/**
 * Reads and validates the Supabase configuration.
 *
 * Expo inlines `EXPO_PUBLIC_*` variables into the bundle at build time, which is
 * correct for the anon key — it is designed to be public and is protected by row
 * level security — and catastrophic for the service-role key, which bypasses RLS
 * entirely. `assertNotAServiceKey` exists to make that specific mistake
 * impossible rather than merely discouraged.
 */

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

const SETUP_HINT =
  'Copy .env.example to .env and fill in the values from your Supabase project ' +
  'under Project Settings → API, then restart the dev server.';

export function readSupabaseConfig(env: Record<string, string | undefined>): SupabaseConfig {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

  const missing: string[] = [];
  if (!url) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!anonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (missing.length > 0) {
    throw new SupabaseConfigError(`Missing ${missing.join(' and ')}. ${SETUP_HINT}`);
  }

  if (!/^https:\/\/[^\s]+$/.test(url!)) {
    throw new SupabaseConfigError(
      `EXPO_PUBLIC_SUPABASE_URL must be an https URL, got "${url}". ${SETUP_HINT}`,
    );
  }

  assertNotAServiceKey(anonKey!);

  return { url: url!, anonKey: anonKey! };
}

/**
 * Throws if the value looks like a key that bypasses row level security.
 *
 * Supabase issues keys in two shapes. The newer ones are prefixed — `sb_secret_`
 * is privileged, `sb_publishable_` is not. The legacy ones are JWTs carrying a
 * `role` claim of either `anon` or `service_role`.
 */
export function assertNotAServiceKey(key: string): void {
  if (key.startsWith('sb_secret_')) {
    throw new SupabaseConfigError(
      'EXPO_PUBLIC_SUPABASE_ANON_KEY is a secret key. Secret keys bypass row level ' +
        'security and must never be shipped in an app bundle. Use the publishable key.',
    );
  }

  const role = jwtRole(key);
  if (role === 'service_role') {
    throw new SupabaseConfigError(
      'EXPO_PUBLIC_SUPABASE_ANON_KEY is the service_role key. It bypasses row level ' +
        'security and must never be shipped in an app bundle. Use the anon key.',
    );
  }
}

/** Reads the `role` claim from a Supabase JWT without verifying it. */
function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    // Not a JWT, or not one we can read. The prefix check above still applies,
    // and an unreadable key will fail loudly on the first request either way.
    return null;
  }
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return globalThis.atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
}
