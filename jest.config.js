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
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    ...expoPreset.moduleNameMapper,
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
};
