import { transformSync } from '@babel/core';

// Node built-ins, typed by hand: the project's tsconfig deliberately leaves out
// Node's types, which describe nothing that exists in React Native.
declare const __dirname: string;
type Entry = { name: string; isDirectory: () => boolean };
const { readFileSync, readdirSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
  readdirSync: (path: string, options: { withFileTypes: true }) => Entry[];
}>('fs');
const { join, relative } = jest.requireActual<{
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
}>('path');

/**
 * What the React Compiler leaves out of a production build.
 *
 * The compiler memoizes every component and hook it can prove it may, and
 * leaves out, without a word, any it cannot: a component with a `finally` in
 * it, for one. One left out still works - it draws again whenever anything
 * above it does, which on a screen that ticks every second is work the phone
 * need not do - and the compiled run of the suite (npm run test:compiled)
 * tests it as written. Nothing else would say that one more was left out.
 *
 * So the app is compiled here as a production build compiles it, and what
 * the compiler leaves out is listed, with why. A change to the list is a
 * decision: either bring the component back (the compose screen was, by
 * writing its `finally` as a `then`; the sign-in and sign-up forms, by
 * waiting with settled()), or add it here and say why it may stay.
 */

const ROOT = join(__dirname, '..', '..');

/** The app's own modules, without the tests, as the bundle has them. */
function appModules(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return appModules(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

type CompilerEvent = {
  kind: string;
  fnLoc?: { start: { line: number } } | null;
  fnName?: string | null;
  detail?: { reason?: string; options?: { reason?: string } };
};

/** What the compiler did with each component and hook of `file`. */
function compile(file: string) {
  const events: CompilerEvent[] = [];
  transformSync(readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: [
      [
        'babel-preset-expo',
        {
          'react-compiler': {
            environment: { enableResetCacheOnSourceFileChanges: false },
            logger: { logEvent: (_: string, event: CompilerEvent) => events.push(event) },
          },
        },
      ],
    ],
    // What Metro tells the preset for a production build with the compiler on.
    caller: {
      name: 'metro',
      bundler: 'metro',
      platform: 'ios',
      isDev: false,
      supportsReactCompiler: true,
    },
  } as Parameters<typeof transformSync>[1]);

  const lines = readFileSync(file, 'utf8').split('\n');
  /** The function the compiler speaks of: it names those it compiled, not those it left out. */
  const nameOf = (event: CompilerEvent) => {
    if (event.fnName) return event.fnName;
    const line = lines[(event.fnLoc?.start.line ?? 0) - 1] ?? '';
    return /function\s+(\w+)|(?:const|let)\s+(\w+)\s*=/.exec(line)?.slice(1).find(Boolean) ?? '?';
  };
  const where = relative(ROOT, file);
  return {
    compiled: events
      .filter((event) => event.kind === 'CompileSuccess')
      .map((event) => `${where} ${nameOf(event)}`),
    leftOut: events
      .filter((event) => event.kind === 'CompileError' || event.kind === 'PipelineError')
      .map((event) => {
        const reason = event.detail?.reason ?? event.detail?.options?.reason ?? event.kind;
        return `${where} ${nameOf(event)}: ${/finalizer/.test(reason) ? 'a finally clause' : reason}`;
      }),
  };
}

describe('the React Compiler', () => {
  // Compiling the whole app takes seconds, more on a busy machine.
  const COMPILING = 60_000;

  it(
    'compiles every component and hook of the app but these',
    () => {
      const results = appModules(join(ROOT, 'src')).map(compile);
      const leftOut = [...new Set(results.flatMap((result) => result.leftOut))].sort();
      const compiled = results.flatMap((result) => result.compiled);

      expect(leftOut).toEqual([
        'src/app/(app)/blocked.tsx BlockedScreen: a finally clause',
        'src/app/(app)/courier/[id].tsx CourierScreen: a finally clause',
        'src/app/(app)/friends.tsx FriendsScreen: a finally clause',
        'src/app/(app)/letters/[id].tsx LetterScreen: a finally clause',
        'src/app/(app)/profile.tsx ProfileScreen: a finally clause',
        'src/app/(app)/report.tsx ReportScreen: a finally clause',
        'src/lib/use-paged.ts usePaged: a finally clause',
        'src/lib/use-remote.ts useRemote: a finally clause',
      ]);
      // And it did run: the screens that redraw the most are compiled.
      expect(compiled).toEqual(
        expect.arrayContaining([
          'src/app/(app)/home.tsx HomeScreen',
          'src/app/(app)/compose.tsx ComposeScreen',
          'src/components/button.tsx Button',
        ]),
      );
    },
    COMPILING,
  );
});
