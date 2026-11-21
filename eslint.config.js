// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

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
    files: ['src/**', 'scripts/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['describe', 'it', 'test'].map((object) => ({
          object,
          property: 'only',
          message: 'A focused test skips every other test in its file: remove `.only`.',
        })),
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
