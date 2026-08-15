/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Mirrors the `paths` entries in tsconfig.json. The assets alias must come
  // first: `^@/(.*)$` would otherwise swallow `@/assets/...` and resolve it
  // under src/.
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
};
