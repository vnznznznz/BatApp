import { assertNotAServiceKey, readSupabaseConfig, SupabaseConfigError } from '@/lib/env';

/** Builds an unsigned JWT carrying the given `role` claim. */
function jwt(role: string): string {
  const encode = (o: unknown) =>
    globalThis.btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase' })}.signature`;
}

const ANON_KEY = jwt('anon');
const URL = 'https://abcdefgh.supabase.co';

describe('readSupabaseConfig', () => {
  it('returns the configuration when both values are present', () => {
    expect(
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: URL,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      }),
    ).toEqual({ url: URL, anonKey: ANON_KEY });
  });

  it('trims surrounding whitespace, which survives a copy and paste', () => {
    expect(
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: `  ${URL}  `,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: `\n${ANON_KEY}\n`,
      }),
    ).toEqual({ url: URL, anonKey: ANON_KEY });
  });

  it('names every missing variable at once rather than one per attempt', () => {
    expect(() => readSupabaseConfig({})).toThrow(/EXPO_PUBLIC_SUPABASE_URL and .*ANON_KEY/);
  });

  it('treats an empty string as missing', () => {
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: '   ',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      }),
    ).toThrow(SupabaseConfigError);
  });

  it('rejects a URL that is not https', () => {
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'http://abcdefgh.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      }),
    ).toThrow(/must be an https URL/);
  });
});

/**
 * The service-role key bypasses row level security completely. Shipping it in
 * the bundle would hand every reader of the app full read and write access to
 * every message in the database, so this is the single most consequential
 * mistake available in this project.
 */
describe('assertNotAServiceKey', () => {
  it('accepts a legacy anon JWT', () => {
    expect(() => assertNotAServiceKey(ANON_KEY)).not.toThrow();
  });

  it('accepts a new-style publishable key', () => {
    expect(() => assertNotAServiceKey('sb_publishable_abc123')).not.toThrow();
  });

  it('rejects a legacy service_role JWT', () => {
    expect(() => assertNotAServiceKey(jwt('service_role'))).toThrow(/service_role/);
  });

  it('rejects a new-style secret key', () => {
    expect(() => assertNotAServiceKey('sb_secret_abc123')).toThrow(/secret key/);
  });

  it('rejects a service_role key through readSupabaseConfig too', () => {
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: URL,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role'),
      }),
    ).toThrow(SupabaseConfigError);
  });

  it('does not throw on a value it cannot parse as a JWT', () => {
    expect(() => assertNotAServiceKey('not-a-jwt-at-all')).not.toThrow();
  });
});
