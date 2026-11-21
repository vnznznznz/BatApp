/**
 * The tests known to fail with the React Compiler on, by their full names,
 * each with what makes it fail. In the compiled run (jest.compiled.config.js)
 * each must still fail: it then counts as passed, so that the run stays able
 * to catch whatever else breaks, and it fails the run the day it passes, so
 * that its entry is taken out here. Nothing else is excused.
 */
/* global expect, it, test -- this file runs inside Jest, which provides them */

const SIGN_OUT_COUNTED_ONCE =
  'auth-context.tsx compares signOutsAnnounced, a module-level let, with the value it had ' +
  'before an await; the compiler takes the two reads for one and makes it ' +
  '"signOutsAnnounced === signOutsAnnounced", so every sign-out the server did not hear is ' +
  'announced a second time.';

const KNOWN_TO_FAIL = {
  'what the rest of the app hears when the session ends hears of a sign-out without a network, once':
    SIGN_OUT_COUNTED_ONCE,
  'what the rest of the app hears when the session ends hears of an account deleted, once, when the server cannot be told':
    SIGN_OUT_COUNTED_ONCE,
};

/** Runs `fn` as usual, unless it is a test known to fail, which must then fail. */
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
              `in jest.compiled.setup.js. It was known to fail because ${known}`,
          );
        },
        () => {},
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
