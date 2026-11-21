import { transformSync } from '@babel/core';

// Node built-ins, typed by hand: the project's tsconfig deliberately leaves out
// Node's types, which describe nothing that exists in React Native.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');

type CompilerEvent = {
  kind: string;
  fnName?: string | null;
  fnLoc?: { start?: { line?: number } } | null;
  detail?: { reason?: string; options?: { reason?: string } };
};

/**
 * What the React Compiler makes of a file, as a real build runs it: the
 * components it compiled, and why it left any other as it was.
 */
function compiled(file: string): { compiled: string[]; skipped: string[] } {
  const path = join(__dirname, '..', file);
  const events: CompilerEvent[] = [];
  transformSync(readFileSync(path, 'utf8'), {
    filename: path,
    babelrc: false,
    configFile: false,
    presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
    plugins: [
      [
        'babel-plugin-react-compiler',
        { logger: { logEvent: (_: string, event: CompilerEvent) => events.push(event) } },
      ],
    ],
  });
  return {
    compiled: events
      .filter(({ kind }) => kind === 'CompileSuccess')
      .map(({ fnName }) => `${fnName}`),
    skipped: events
      .filter(({ kind }) => kind === 'CompileError' || kind === 'PipelineError')
      .map(
        ({ fnLoc, detail }) =>
          `line ${fnLoc?.start?.line}: ${detail?.reason ?? detail?.options?.reason ?? 'no reason given'}`,
      ),
  };
}

/**
 * The app is built with the React Compiler on (app.json, experiments), and it
 * memoises every component it can. One it cannot - a try statement with a
 * `finally`, or without a `catch`, a condition inside a try statement - it
 * leaves as written, quietly, and every test still passes. The forms and the
 * auth provider had all stopped being compiled that way. (Found in review.)
 */
describe('the forms, as the React Compiler builds them', () => {
  it.each([
    ['app/sign-in.tsx', ['SignInScreen']],
    ['app/sign-up.tsx', ['SignUpScreen']],
    ['app/reset-password.tsx', ['ResetPasswordScreen', 'NewPasswordForm']],
    ['app/_layout.tsx', ['RootLayout', 'RootNavigator']],
    ['features/auth/confirm-email.tsx', ['ConfirmEmail']],
    ['features/auth/auth-context.tsx', ['AuthProvider']],
  ])('compiles every component in %s', (file, components) => {
    const result = compiled(file);

    expect(result.skipped).toEqual([]);
    expect(result.compiled).toEqual(expect.arrayContaining(components));
  });
});
