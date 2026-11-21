// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const { cacheVersion, checkBuildEnv, HOW_TO_FIX } = require('./scripts/check-build-env');

const config = getDefaultConfig(__dirname);

/**
 * Metro keeps every file it has transformed and hands it back when the file has
 * not changed. In a production bundle Babel writes the EXPO_PUBLIC_ values into
 * a file while transforming it, and those values are not part of what Metro
 * compares. A second build with another Supabase project, or with the two links
 * now set, got the first build's files back: an app that talks to the wrong
 * project, built without an error. The cache is machine-wide, so a fresh clone
 * inherited the values too.
 *
 * With the values in the cache version, each set of values has a cache of its
 * own. The first build after a change transforms everything once more.
 */
config.cacheVersion = cacheVersion(process.env);

/**
 * A production bundle built without the Supabase values builds all the same -
 * on a phone it stops at its first screen. Better to stop here, where somebody
 * is looking. The development server is left alone: there the app itself says
 * what is missing, with how to fix it.
 */
if (process.env.NODE_ENV === 'production') {
  const { errors, warnings } = checkBuildEnv(process.env);
  if (errors.length > 0) {
    throw new Error(
      `Night Courier cannot be bundled with these values:\n` +
        errors.map((error) => `  - ${error}\n`).join('') +
        HOW_TO_FIX,
    );
  }
  // Expo loads this file more than once in one build; once is enough to say it.
  const SAID = Symbol.for('night-courier.build-env-warnings');
  if (!process[SAID]) {
    process[SAID] = true;
    for (const warning of warnings) console.warn(`warning: ${warning}`);
  }
}

module.exports = config;
