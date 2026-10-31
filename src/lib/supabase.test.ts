import { transformSync } from '@babel/core';

// Node built-ins, typed by hand: the project's tsconfig deliberately leaves out
// Node's types, which describe nothing that exists in React Native.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');

/**
 * Expo inlines `EXPO_PUBLIC_*` variables into the bundle only where the source
 * reads them as `process.env.EXPO_PUBLIC_NAME`, written out in full. At run time
 * `process.env` is otherwise empty.
 *
 * Until this test existed, `supabase.ts` passed `process.env` whole to the
 * config reader. Jest supplies a real environment, so every test passed; every
 * real build - Expo Go, EAS, web - threw "Missing EXPO_PUBLIC_SUPABASE_URL" at
 * launch. The only faithful check is to run the file through the same Babel
 * preset Metro uses and look at what comes out.
 */
describe('the Supabase client configuration, as bundled', () => {
  const SOURCE = join(__dirname, 'supabase.ts');

  function bundle(): string {
    const result = transformSync(readFileSync(SOURCE, 'utf8'), {
      filename: SOURCE,
      presets: ['babel-preset-expo'],
      babelrc: false,
      configFile: false,
      caller: { name: 'metro', bundler: 'metro', platform: 'ios', isDev: false, isServer: false },
    } as Parameters<typeof transformSync>[1]);
    if (!result?.code) throw new Error('Babel produced no output');
    return result.code;
  }

  it('inlines the project URL and the anon key', () => {
    const code = bundle();

    expect(code).toContain(JSON.stringify(process.env.EXPO_PUBLIC_SUPABASE_URL));
    expect(code).toContain(JSON.stringify(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY));
  });

  it('leaves no read of process.env for the bundle to find empty at launch', () => {
    expect(bundle()).not.toMatch(/process\.env/);
  });
});
