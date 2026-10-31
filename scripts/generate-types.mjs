/**
 * Regenerates src/lib/database.types.ts from the local Supabase stack.
 *
 *   npx supabase start            # once; needs Docker
 *   npx supabase db reset         # after changing a migration
 *   npm run generate:types
 *
 * The types give the client compile-time checking of table names, function
 * names and argument names. Run this whenever a migration changes the shape of
 * anything the app calls; a stale file compiles happily against a database that
 * no longer matches it.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const generated = execFileSync(
  'npx',
  ['--yes', 'supabase', 'gen', 'types', 'typescript', '--local'],
  {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);

writeFileSync(OUT, HEADER + generated);
execFileSync('npx', ['prettier', '--write', OUT], { cwd: ROOT, stdio: 'inherit' });
