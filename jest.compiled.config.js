const base = require('./jest.config');

/**
 * The Jest suite again, with the components and hooks compiled by the React
 * Compiler as a production build compiles them (`npm run test:compiled`).
 *
 * app.json turns the compiler on, but babel-preset-expo runs it only when
 * Metro asks for it, so the plain suite tests the code as written - code no
 * phone runs. The compiler memoizes what it can prove it may; where a
 * component breaks a rule of React it cannot see, the compiled one behaves
 * differently, and only a run like this one shows it. The transform it
 * uses is jest.compiled.transform.js.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  ...base,
  transform: {
    ...require('jest-expo/jest-preset').transform,
    '\\.[jt]sx?$': '<rootDir>/jest.compiled.transform.js',
  },
  // The tests known to fail compiled, and why: jest.compiled.setup.js.
  setupFilesAfterEnv: [...(base.setupFilesAfterEnv ?? []), '<rootDir>/jest.compiled.setup.js'],
};
