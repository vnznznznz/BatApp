/**
 * What this tree's migrations define, for the scripts that have to know before
 * they rely on it.
 *
 * The documents name database functions. The runbooks have the operator call
 * them, and the public pages promise what they do: that an account deleted on
 * request loses its sign-in records at once is `private.delete_account`, and
 * nothing else. Documents and migrations are written on different branches, so
 * a tree can hold the sentence without the function. build-store-pages.mjs
 * asks here before it publishes such a sentence, and runbooks.test.mjs before
 * it runs such a statement.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'supabase',
  'migrations',
);

/**
 * Whether a migration in `folder` creates the function `schema.name`.
 *
 * Creates it: a mention in a comment, a grant, a revoke or a call does not
 * make a function exist, and the migrations have all of these. A function
 * created and dropped again later would still count; the runbook tests, which
 * run the statement against the migrated database, are what catches that.
 */
export function definesFunction(name, folder = MIGRATIONS) {
  const creates = new RegExp(
    String.raw`^\s*create\s+(?:or\s+replace\s+)?function\s+${name.replace('.', String.raw`\.`)}\s*\(`,
    'im',
  );
  return readdirSync(folder)
    .filter((file) => file.endsWith('.sql'))
    .some((file) =>
      creates.test(readFileSync(join(folder, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')),
    );
}
