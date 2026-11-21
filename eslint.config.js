// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

/** The names a test or a group of tests is declared with, in Jest and in node:test. */
const TEST_FUNCTION = '/^(describe|it|test|suite)$/';

module.exports = defineConfig([
  expoConfig,
  // Must stay last: switches off the stylistic rules that Prettier owns.
  prettierConfig,
  {
    ignores: ['dist/*', 'coverage/*', '.expo/*', 'node_modules/*'],
  },
  {
    // Build tooling runs under Node, not React Native.
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', '*.config.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
  },
  {
    // A test focused with `.only` is left in by accident: Jest then runs it
    // alone in its file, skips the rest without a failure and exits 0, so the
    // typecheck, the format check and CI all stay green with tests not run.
    // `node --test` honours it only when asked to, which is no reason to keep
    // one there either. `fit` and `fdescribe` are Jest's other names for it.
    //
    // `.only` is found on a test function itself - `it.only`, and so
    // `it.only.each` - and one name further in, where Jest's concurrent tests
    // keep it: `test.concurrent.only`, `it.concurrent.only.each`. A rule that
    // looked for it only on `describe`, `it` and `test` themselves let those
    // through. (Found in review.) `suite` is node:test's other name for
    // `describe`.
    files: ['src/**', 'scripts/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression:matches([property.name='only'], [property.value='only'])" +
            ':matches(' +
            [`[object.name=${TEST_FUNCTION}]`, `[object.object.name=${TEST_FUNCTION}]`].join(', ') +
            ')',
          message: 'A focused test skips every other test in its file: remove `.only`.',
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['fdescribe', 'fit'].map((name) => ({
          name,
          message: 'A focused test skips every other test in its file: use `describe` or `it`.',
        })),
      ],
    },
  },
]);
