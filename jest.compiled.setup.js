/**
 * The tests known to fail with the React Compiler on, by their full names,
 * each with what makes it fail and the failed check that shows it. In the
 * compiled run (jest.compiled.config.js) each must still fail, and on that
 * check: it then counts as passed, so that the run stays able to catch
 * whatever else breaks. It fails the run the day it passes, so that its entry
 * is taken out here, and it fails the run when it fails in any other way - an
 * error, another check, another count - which is something else broken.
 * Nothing else is excused.
 */
/* global expect, it, test -- this file runs inside Jest, which provides them */

const { isDeepStrictEqual } = require('util');

// Empty: the two sign-out tests the compiler used to break (it folded a
// comparison of a module-level count with its earlier value into a comparison
// with itself) pass compiled since the sign-out moved out of the component.
const KNOWN_TO_FAIL = {};

/** Whether `error` is the failed check an entry records: that matcher, given those values. */
function isTheKnownFailure(error, { matcher, expected, received }) {
  const check = error?.matcherResult;
  return (
    check?.name === matcher &&
    isDeepStrictEqual(check.expected, expected) &&
    isDeepStrictEqual(check.actual, received)
  );
}

/**
 * Runs `fn` as usual, unless it is a test known to fail, which must then fail
 * as it is known to.
 */
function expectingKnownFailures(fn) {
  if (typeof fn !== 'function') return fn;
  const guarded = function (...args) {
    const known = KNOWN_TO_FAIL[expect.getState().currentTestName];
    if (!known) return fn.apply(this, args);
    return Promise.resolve()
      .then(() => fn.apply(this, args))
      .then(
        () => {
          throw new Error(
            'This test passes with the React Compiler on now. Take it out of KNOWN_TO_FAIL ' +
              `in jest.compiled.setup.js. It was known to fail because ${known.because}`,
          );
        },
        (error) => {
          if (isTheKnownFailure(error, known.failure)) return;
          throw new Error(
            'This test is known to fail with the React Compiler on, but it failed in another ' +
              'way, which nothing excuses. It is known to fail on ' +
              `${known.failure.matcher}(${JSON.stringify(known.failure.expected)}), receiving ` +
              `${JSON.stringify(known.failure.received)}, because ${known.because}\n\n` +
              `It failed with:\n${error instanceof Error ? error.stack : String(error)}`,
          );
        },
      );
  };
  // Jest counts a test function's parameters to see whether it takes `done`.
  Object.defineProperty(guarded, 'length', { value: fn.length });
  return guarded;
}

/** `it` or `test`, with every test function it is given guarded as above. */
function guarding(register) {
  const guardedRegister = (name, fn, timeout) =>
    register(name, expectingKnownFailures(fn), timeout);
  guardedRegister.each =
    (...table) =>
    (name, fn, timeout) =>
      register.each(...table)(name, expectingKnownFailures(fn), timeout);
  for (const variant of ['only', 'skip', 'todo', 'failing', 'concurrent']) {
    guardedRegister[variant] = register[variant];
  }
  return guardedRegister;
}

globalThis.it = guarding(it);
globalThis.test = guarding(test);
