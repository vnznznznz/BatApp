const expoPreset = require('jest-expo/jest-preset');

/**
 * Jest replaces preset keys rather than merging them, and `jest-expo` supplies
 * two mappings that matter: the `@/` aliases it derives from tsconfig, and a
 * pin that forces every import of `react-native` onto one instance. Overriding
 * `moduleNameMapper` wholesale silently drops that pin, which duplicates module
 * instances and breaks the testing library's `screen` singleton — so the
 * preset's own map is spread back in here.
 *
 * The assets alias is listed first because Jest takes the first match, and the
 * preset's broader `^@/(.*)$` would otherwise resolve `@/assets/...` under src/.
 *
 * Database tests are not Jest's: they live in `src/tests/db` as native ESM and
 * run under `node --test` via `npm run test:db`. See that directory's harness
 * for why.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'jest-expo',
  // Same merge hazard as moduleNameMapper: the preset's own setup files must be
  // kept, or React Native's test globals never get installed.
  setupFiles: [...(expoPreset.setupFiles ?? []), '<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    ...expoPreset.moduleNameMapper,
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
  // React Native loads its components on first use, and with a cold transform
  // cache - a fresh checkout, CI - the first render compiles them: seconds of
  // work, measured at over five on four cores, that count against whichever
  // test runs first in each file. Which files start first depends on their
  // size and the number of cores, so the limit is the same for every file
  // rather than raised in the ones that happened to time out once.
  testTimeout: 20_000,
};
