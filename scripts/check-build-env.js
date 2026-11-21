/**
 * What a bundle needs from the environment, checked before it is built.
 *
 * Expo writes the EXPO_PUBLIC_ values into a production bundle while building
 * it. Without the Supabase URL and key, a native bundle still builds - and the
 * app stops on its first screen, on the phone of whoever installed it. An EAS
 * build is where that happens most easily: `.env` is not in git, so EAS never
 * sees it, and the values have to be set in the EAS environment.
 *
 * metro.config.js runs this for every production bundle and refuses to go on
 * while the Supabase values are missing or are ones the app would refuse. Run
 * by hand it says the same, and with --for-others it also insists on the two
 * links a build for anyone else needs:
 *
 *   node scripts/check-build-env.js --for-others
 *
 * Plain CommonJS with no dependencies of its own, because Metro loads it under
 * Node before any bundle exists. For the same reason it cannot import
 * src/lib/env.ts or src/lib/links.ts: the rules below are a second copy of
 * theirs, and src/lib/env.test.ts fails when the two disagree.
 */

const SUPABASE_URL = 'EXPO_PUBLIC_SUPABASE_URL';
const SUPABASE_KEY = 'EXPO_PUBLIC_SUPABASE_ANON_KEY';
const LINKS = {
  EXPO_PUBLIC_CONTACT_URL: 'Contact',
  EXPO_PUBLIC_PRIVACY_POLICY_URL: 'Privacy policy',
};

/** As in src/lib/env.ts: plain http only for a stack on this machine or network. */
const LOCAL_HTTP =
  /^http:\/\/(localhost|127(\.\d{1,3}){3}|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d{1,5})?(\/[^\s]*)?$/;

/** What .env.example ships with. */
const PLACEHOLDER_URL = /^https:\/\/your-project-ref\.supabase\.co\/?$/i;
const PLACEHOLDER_KEY = 'your-anon-key';

/**
 * Everything Babel writes into the bundle, sorted by name, so that the same
 * values always read the same.
 */
function publicValues(env) {
  return Object.entries(env)
    .filter(([name, value]) => name.startsWith('EXPO_PUBLIC_') && typeof value === 'string')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Metro's cache version for this set of values. Metro keeps every file it has
 * transformed and does not know that Babel wrote these values into them; with
 * the values in the cache version, each set gets a cache of its own.
 */
function cacheVersion(env) {
  return JSON.stringify(publicValues(env));
}

/**
 * What is wrong with these values for a production build. `errors` are what
 * the app refuses to start with; `warnings` are links whose button the app
 * will not show. With `forOthers`, a missing link is an error too.
 */
function checkBuildEnv(env, { forOthers = false } = {}) {
  const errors = [];
  const warnings = [];

  const url = env[SUPABASE_URL]?.trim();
  const key = env[SUPABASE_KEY]?.trim();

  if (!url) {
    errors.push(`${SUPABASE_URL} is not set`);
  } else if (PLACEHOLDER_URL.test(url)) {
    errors.push(`${SUPABASE_URL} is still the placeholder from .env.example`);
  } else if (!/^https:\/\/[^\s]+$/.test(url) && !LOCAL_HTTP.test(url)) {
    errors.push(
      `${SUPABASE_URL} must be an https URL (plain http only for a local Supabase), got "${url}"`,
    );
  }

  if (!key) {
    errors.push(`${SUPABASE_KEY} is not set`);
  } else if (key === PLACEHOLDER_KEY) {
    errors.push(`${SUPABASE_KEY} is still the placeholder from .env.example`);
  } else if (key.startsWith('sb_secret_')) {
    errors.push(
      `${SUPABASE_KEY} is a secret key. It bypasses row level security and must never be in an app: use the publishable key`,
    );
  } else if (jwtRole(key) === 'service_role') {
    errors.push(
      `${SUPABASE_KEY} is the service_role key. It bypasses row level security and must never be in an app: use the anon key`,
    );
  }

  for (const [name, button] of Object.entries(LINKS)) {
    const link = env[name]?.trim();
    const problem = !link
      ? `${name} is not set: this build will have no ${button} button`
      : /^https:\/\/\S+$/i.test(link) || /^mailto:[^\s@]+@[^\s@]+$/i.test(link)
        ? null
        : `${name} is neither an https nor a mailto link: this build will have no ${button} button`;
    if (problem) (forOthers ? errors : warnings).push(problem);
  }

  return { errors, warnings };
}

/** The `role` claim of a legacy Supabase key, which is a JWT; null for anything else. */
function jwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

const HOW_TO_FIX =
  'Locally these come from .env (copy .env.example and fill it in). An EAS build never sees ' +
  '.env: set them in the EAS environment. See docs/GO-LIVE.md, "Setting up the hosted project", ' +
  'step 5.';

module.exports = { cacheVersion, checkBuildEnv, publicValues, HOW_TO_FIX };

if (require.main === module) {
  const { readFileSync } = require('node:fs');
  const { join, resolve } = require('node:path');
  const { parseEnv } = require('node:util');

  const option = (name) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const root = resolve(option('--root') ?? join(__dirname, '..'));
  const forOthers = process.argv.includes('--for-others');

  // The files a production build reads, first one wins, and what is set in the
  // shell wins over them all - the order Expo itself uses.
  const env = {};
  for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const [name, value] of Object.entries(parseEnv(text))) env[name] ??= value;
  }
  Object.assign(env, process.env);

  const { errors, warnings } = checkBuildEnv(env, { forOthers });
  for (const warning of warnings) console.error(`warning: ${warning}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`error: ${error}`);
    console.error(`\n${HOW_TO_FIX}`);
    process.exit(1);
  }

  // The key itself is not printed: what matters is that there is one and that
  // it is the right kind, and a log is no place for a key pasted by mistake.
  console.log(`Supabase project: ${env[SUPABASE_URL].trim()}`);
  for (const name of Object.keys(LINKS))
    console.log(`${name}: ${env[name]?.trim() || '(not set)'}`);
  console.log(
    forOthers
      ? 'These values are complete for a build that other people will use.'
      : 'These values are enough to build. For a build other people will use, check with --for-others.',
  );
}
