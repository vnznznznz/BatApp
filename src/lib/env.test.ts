import { assertNotAServiceKey, readSupabaseConfig, SupabaseConfigError } from '@/lib/env';
import { acceptableLink } from '@/lib/links';

import { checkBuildEnv } from '../../scripts/check-build-env';

jest.mock('@/lib/confirm', () => ({ notify: jest.fn() }));

// Node built-ins, typed by hand, as in supabase.test.ts: the project's
// tsconfig deliberately leaves out Node's types.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');

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

  /**
   * `npx supabase@3.2.0 start` serves plain http, and a phone in Expo Go reaches it
   * over the local network. Refusing those made local development impossible.
   */
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://192.168.1.20:54321',
    'http://10.0.0.5:54321',
    'http://172.20.10.2:54321',
  ])('accepts plain http for a local stack at %s', (url) => {
    expect(
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: url,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      }),
    ).toEqual({ url, anonKey: ANON_KEY });
  });

  it.each([
    'http://172.32.0.1:54321',
    'http://192.168.1.20.example.com',
    'http://127.0.0.1.evil.example',
    'http://8.8.8.8:54321',
  ])('still rejects plain http to %s, which is not a local address', (url) => {
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: url,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      }),
    ).toThrow(/must be an https URL/);
  });

  /**
   * `.env.example`, copied to `.env` and never filled in, passed every other
   * check: an https URL, a key that is not a secret one. The app started, and
   * every sign-in answered "No connection" - the quiet failure this file exists
   * to prevent.
   */
  it('rejects the placeholder URL of .env.example', () => {
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'https://your-project-ref.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_URL is still the placeholder from \.env\.example/);
  });

  it('rejects the placeholder key of .env.example', () => {
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: URL,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'your-anon-key',
      }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY is still the placeholder from \.env\.example/);
  });

  it('rejects .env.example as it is committed, whatever its placeholders are called by then', () => {
    const example = readFileSync(join(__dirname, '..', '..', '.env.example'), 'utf8');
    const value = (name: string) => example.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? '';
    const url = value('EXPO_PUBLIC_SUPABASE_URL');
    const key = value('EXPO_PUBLIC_SUPABASE_ANON_KEY');

    expect(url).not.toBe('');
    expect(key).not.toBe('');
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: url,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      }),
    ).toThrow(/placeholder/);
    expect(() =>
      readSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: key }),
    ).toThrow(/placeholder/);
  });
});

/**
 * metro.config.js stops a production bundle whose values the app would refuse
 * at launch - at build time, where somebody is looking. It runs under Node
 * before any bundle exists, so it cannot import this TypeScript: its rules are
 * a second copy, in scripts/check-build-env.js. These cases hold the two
 * copies together.
 */
describe('the check at build time', () => {
  const cases: [string, string | undefined, string | undefined][] = [
    ['a hosted project and an anon key', URL, ANON_KEY],
    ['a hosted project and a publishable key', URL, 'sb_publishable_abc123'],
    ['values with space around them', `  ${URL}  `, `\n${ANON_KEY}\n`],
    ['the local stack', 'http://127.0.0.1:54321', ANON_KEY],
    ['localhost', 'http://localhost:54321', ANON_KEY],
    ['a phone reaching the local stack', 'http://192.168.1.20:54321', ANON_KEY],
    ['a 10.x address', 'http://10.0.0.5:54321', ANON_KEY],
    ['a 172.16-31 address', 'http://172.20.10.2:54321', ANON_KEY],
    ['nothing at all', undefined, undefined],
    ['no URL', undefined, ANON_KEY],
    ['no key', URL, undefined],
    ['a blank URL', '   ', ANON_KEY],
    ['a blank key', URL, ''],
    ['plain http to a hosted project', 'http://abcdefgh.supabase.co', ANON_KEY],
    ['plain http to 172.32, which is not private', 'http://172.32.0.1:54321', ANON_KEY],
    ['a local address as a host name prefix', 'http://127.0.0.1.evil.example', ANON_KEY],
    ['plain http to a public address', 'http://8.8.8.8:54321', ANON_KEY],
    ['something that is not a URL', 'abcdefgh.supabase.co', ANON_KEY],
    ['a URL with a space in it', 'https://abcdefgh.supabase.co /x', ANON_KEY],
    ['a secret key', URL, 'sb_secret_abc123'],
    ['a service_role key', URL, jwt('service_role')],
    ['a key that is not a JWT', URL, 'not-a-jwt-at-all'],
    ['the placeholder URL', 'https://your-project-ref.supabase.co', ANON_KEY],
    ['the placeholder URL with a slash', 'https://your-project-ref.supabase.co/', ANON_KEY],
    ['the placeholder key', URL, 'your-anon-key'],
  ];

  it.each(cases)('agrees with the app about %s', (_what, url, key) => {
    const env = { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: key };

    let refusedByTheApp = false;
    try {
      readSupabaseConfig(env);
    } catch {
      refusedByTheApp = true;
    }

    expect(checkBuildEnv(env).errors.length > 0).toBe(refusedByTheApp);
  });

  it('has cases the app accepts and cases it refuses, or agreeing would mean nothing', () => {
    const refused = cases.filter(([, url, key]) => {
      try {
        readSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: key });
        return false;
      } catch {
        return true;
      }
    });

    expect(refused.length).toBeGreaterThanOrEqual(10);
    expect(cases.length - refused.length).toBeGreaterThanOrEqual(8);
  });

  const SUPABASE = { EXPO_PUBLIC_SUPABASE_URL: URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY };

  /** The same again for the two links: a link the app will not show is worth a warning. */
  it.each([
    'https://night-courier.example/privacy',
    'mailto:help@night-courier.example',
    '  https://example.test/privacy \n',
    'http://example.test/privacy',
    'javascript:alert(1)',
    'mailto:',
    'help@example.test',
    'https://example.test/privacy policy',
    '',
    '   ',
  ])('agrees with the app about the link %j', (link) => {
    const shown = acceptableLink(link) !== null;
    const { warnings } = checkBuildEnv({
      ...SUPABASE,
      EXPO_PUBLIC_CONTACT_URL: link,
      EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://example.test/privacy',
    });

    expect(warnings.length === 0).toBe(shown);
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
