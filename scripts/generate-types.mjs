/**
 * Regenerates src/lib/database.types.ts from the local Supabase stack.
 *
 *   npx supabase@3.2.0 start            # once; needs Docker
 *   npx supabase@3.2.0 db reset         # after changing a migration
 *   npm run generate:types
 *
 * The types give the client compile-time checking of table names, function
 * names and argument names. Run this whenever a migration changes the shape of
 * anything the app calls; a stale file compiles happily against a database that
 * no longer matches it.
 *
 * `db reset` rebuilds the LOCAL database from the migrations and the seed. It
 * is never run against the hosted project.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPABASE_CLI } from './supabase-cli.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'lib', 'database.types.ts');

const HEADER = `/**
 * Generated from the local database by \`npm run generate:types\`. Do not edit by
 * hand: change the migration, reset the local stack, and regenerate.
 *
 * Used for the names and argument types of tables and functions. The return
 * types of functions that \`return table (...)\` are not trustworthy here - the
 * generator marks every column non-null - so each feature declares its own row
 * type, with the nullability the SQL actually has.
 */

`;

// The local stack is this CLI version's target unless --remote is given, in a
// linked directory too; it says so on stderr ("Target: local stack").
const generated = execFileSync('npx', ['--yes', SUPABASE_CLI, 'gen', 'types', 'typescript'], {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

writeFileSync(OUT, HEADER + generated);
execFileSync('npx', ['prettier', '--write', OUT], { cwd: ROOT, stdio: 'inherit' });
