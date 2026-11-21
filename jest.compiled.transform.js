const { createTransformer } = require('babel-jest');
const { transform } = require('jest-expo/jest-preset');

/**
 * jest-expo's own Babel transform, with the React Compiler turned on the way
 * a production build turns it on (see jest.compiled.config.js).
 *
 * Metro tells babel-preset-expo through the caller that the compiler is
 * wanted, and a production build gives it these options. Under Jest the
 * preset already counts as no development build (NODE_ENV is "test"), so
 * the compiler leaves out quietly what it cannot compile, as it does for a
 * phone, rather than failing the transform.
 *
 * Only the app is compiled, not the tests: a production build has none, and
 * a component a test file makes up for itself is not under test.
 */
const [, options] = transform['\\.[jt]sx?$'];
if (!options.presets) {
  throw new Error(
    'jest-expo no longer names babel-preset-expo itself (has a babel config been added?): ' +
      'give the React Compiler its options there, as this file does.',
  );
}

const isTest = (filename) => /\.test\.[jt]sx?$/.test(filename);

module.exports = createTransformer({
  ...options,
  caller: { ...options.caller, supportsReactCompiler: true },
  presets: options.presets.map((preset) => [
    preset,
    {
      'react-compiler': {
        sources: (filename) => !isTest(filename) && !filename.includes('/node_modules/'),
        // A production build's value; a development build resets a
        // component's memory when its source file changes.
        environment: { enableResetCacheOnSourceFileChanges: false },
      },
    },
  ]),
});
