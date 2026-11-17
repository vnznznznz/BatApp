import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * A production bundle has the EXPO_PUBLIC_ values written into it when it is
 * built. Two things went wrong there without a sound: Metro handed back files
 * it had transformed for an earlier build, with that build's values in them,
 * and a native bundle built with no values at all only failed when the app was
 * opened. metro.config.js answers both; these are its tests.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'check-build-env.js');
const { cacheVersion, checkBuildEnv } = createRequire(import.meta.url)('./check-build-env.js');

const LOCAL = {
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_local_stack_key',
};
const HOSTED = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_hosted_project_key',
};
const LINKS = {
  EXPO_PUBLIC_CONTACT_URL: 'https://example.test/night-courier/',
  EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://example.test/night-courier/privacy-policy.de.html',
};

/** Runs node with exactly this environment, plus what node itself needs. */
function node(args, env) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

describe('the cache version', () => {
  it('is the same for the same values', () => {
    assert.equal(cacheVersion({ ...HOSTED, ...LINKS }), cacheVersion({ ...LINKS, ...HOSTED }));
  });

  it('changes with the Supabase project', () => {
    assert.notEqual(cacheVersion(LOCAL), cacheVersion(HOSTED));
    assert.notEqual(
      cacheVersion(HOSTED),
      cacheVersion({ ...HOSTED, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_another_key' }),
    );
  });

  it('changes when a link is set, changed or taken away', () => {
    const withLinks = cacheVersion({ ...HOSTED, ...LINKS });

    assert.notEqual(withLinks, cacheVersion(HOSTED));
    assert.notEqual(
      withLinks,
      cacheVersion({ ...HOSTED, ...LINKS, EXPO_PUBLIC_CONTACT_URL: 'mailto:someone@example.test' }),
    );
  });

  it('tells two values apart that have swapped places', () => {
    assert.notEqual(
      cacheVersion({ EXPO_PUBLIC_A: 'x', EXPO_PUBLIC_B: 'y' }),
      cacheVersion({ EXPO_PUBLIC_A: 'y', EXPO_PUBLIC_B: 'x' }),
    );
  });

  // Only what Babel writes into the bundle belongs in it: a changed PATH or
  // HOME must not throw the whole cache away.
  it('does not care about anything else in the environment', () => {
    assert.equal(
      cacheVersion({ ...HOSTED, HOME: '/home/one', PATH: '/usr/bin', CI: '1' }),
      cacheVersion({ ...HOSTED, HOME: '/home/two', TERM: 'xterm' }),
    );
  });
});

describe('metro.config.js', () => {
  const load = `process.stdout.write(require('./metro.config.js').cacheVersion)`;

  it('gives Metro a cache version made of the values of this build', () => {
    const local = node(['-e', load], { NODE_ENV: 'production', ...LOCAL });
    const hosted = node(['-e', load], { NODE_ENV: 'production', ...HOSTED, ...LINKS });

    assert.equal(local.status, 0, local.err);
    assert.equal(hosted.status, 0, hosted.err);
    assert.equal(local.out, cacheVersion(LOCAL));
    assert.equal(hosted.out, cacheVersion({ ...HOSTED, ...LINKS }));
    assert.notEqual(local.out, hosted.out);
  });

  it('refuses to bundle for production without the Supabase project', () => {
    const result = node(['-e', load], { NODE_ENV: 'production' });

    assert.notEqual(result.status, 0);
    assert.match(result.err, /EXPO_PUBLIC_SUPABASE_URL is not set/);
    assert.match(result.err, /EXPO_PUBLIC_SUPABASE_ANON_KEY is not set/);
    assert.match(result.err, /docs\/GO-LIVE\.md/);
  });

  it('refuses the values .env.example ships with', () => {
    const result = node(['-e', load], {
      NODE_ENV: 'production',
      EXPO_PUBLIC_SUPABASE_URL: 'https://your-project-ref.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'your-anon-key',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.err, /EXPO_PUBLIC_SUPABASE_URL is still the placeholder/);
    assert.match(result.err, /EXPO_PUBLIC_SUPABASE_ANON_KEY is still the placeholder/);
  });

  it('refuses a key that would open the whole database to every reader of the app', () => {
    const result = node(['-e', load], {
      NODE_ENV: 'production',
      ...HOSTED,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_abc123',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.err, /secret key/);
  });

  // The app says what is missing on its first screen there, with how to fix it.
  it('leaves the development server alone', () => {
    for (const mode of ['development', undefined]) {
      const result = node(['-e', load], mode ? { NODE_ENV: mode } : {});
      assert.equal(result.status, 0, result.err);
    }
  });

  it('says so when a production build will have no Contact or Privacy policy button', () => {
    const without = node(['-e', load], { NODE_ENV: 'production', ...HOSTED });
    const withLinks = node(['-e', load], { NODE_ENV: 'production', ...HOSTED, ...LINKS });

    assert.equal(without.status, 0, without.err);
    assert.match(without.err, /EXPO_PUBLIC_CONTACT_URL is not set/);
    assert.match(without.err, /EXPO_PUBLIC_PRIVACY_POLICY_URL is not set/);
    assert.equal(withLinks.err, '');
  });
});

describe('what a build needs', () => {
  it('is all there with a project and both links', () => {
    assert.deepEqual(checkBuildEnv({ ...HOSTED, ...LINKS }), { errors: [], warnings: [] });
  });

  it('takes a mail address for the contact', () => {
    const env = { ...HOSTED, ...LINKS, EXPO_PUBLIC_CONTACT_URL: 'mailto:someone@example.test' };
    assert.deepEqual(checkBuildEnv(env), { errors: [], warnings: [] });
  });

  // The app shows no button for a link it does not accept, and says nothing.
  it('warns about a link the app would not show', () => {
    const { errors, warnings } = checkBuildEnv({
      ...HOSTED,
      EXPO_PUBLIC_CONTACT_URL: 'someone@example.test',
      EXPO_PUBLIC_PRIVACY_POLICY_URL: 'http://example.test/privacy',
    });

    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /EXPO_PUBLIC_CONTACT_URL is neither an https nor a mailto link/);
    assert.match(warnings[1], /EXPO_PUBLIC_PRIVACY_POLICY_URL is neither an https nor a mailto/);
  });

  it('makes the links a must for a build anyone else will use', () => {
    const forOthers = checkBuildEnv(HOSTED, { forOthers: true });

    assert.equal(forOthers.errors.length, 2);
    assert.deepEqual(forOthers.warnings, []);
    assert.deepEqual(checkBuildEnv({ ...HOSTED, ...LINKS }, { forOthers: true }).errors, []);
  });
});

describe('node scripts/check-build-env.js', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'build-env-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** In an empty folder, so that a developer's own .env does not answer for the test. */
  const check = (env, ...flags) => node([SCRIPT, '--root', root, ...flags], env);

  it('fails, naming what is missing, when the project is not set', () => {
    const result = check({});

    assert.equal(result.status, 1);
    assert.match(result.err, /EXPO_PUBLIC_SUPABASE_URL is not set/);
    assert.match(result.err, /EXPO_PUBLIC_SUPABASE_ANON_KEY is not set/);
  });

  it('passes with the project alone, and says which buttons will be missing', () => {
    const result = check(HOSTED);

    assert.equal(result.status, 0, result.err);
    assert.match(result.err, /EXPO_PUBLIC_CONTACT_URL is not set/);
    assert.match(result.out, /https:\/\/abcdefghijklmnopqrst\.supabase\.co/);
  });

  it('fails with --for-others until both links are there', () => {
    assert.equal(check(HOSTED, '--for-others').status, 1);
    assert.equal(check({ ...HOSTED, ...LINKS }, '--for-others').status, 0);
  });

  // The same files the build itself reads, with the same order of precedence:
  // what is set in the shell wins over the file.
  it('reads .env the way the build does', () => {
    writeFileSync(
      join(root, '.env'),
      Object.entries({ ...HOSTED, ...LINKS })
        .map(([name, value]) => `${name}=${value}\n`)
        .join(''),
    );

    assert.equal(check({}, '--for-others').status, 0);
    const overridden = check({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_abc123' });
    assert.equal(overridden.status, 1);
    assert.match(overridden.err, /secret key/);
  });

  it('never prints the key', () => {
    const result = check({ ...HOSTED, ...LINKS });

    assert.doesNotMatch(result.out + result.err, /sb_publishable_hosted_project_key/);
  });
});
