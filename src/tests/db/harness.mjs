import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs the real migrations from `supabase/migrations` against Postgres compiled
 * to WebAssembly, so the schema, its constraints, its triggers and its RLS
 * policies are tested as written rather than as described.
 *
 * These tests run under `node --test` rather than Jest. PGlite resolves its
 * WebAssembly and filesystem bundles relative to `import.meta.url`, which Jest's
 * CommonJS transform leaves undefined; native ESM has no such problem, and
 * Node's built-in runner costs no extra dependency.
 *
 * What this does NOT cover, and must not be mistaken for:
 *
 * - Supabase's actual `auth` schema. The stub below reproduces only the parts
 *   the migrations depend on — `auth.users`, `auth.uid()`, the `anon` and
 *   `authenticated` roles, and the default privileges Supabase grants them. It
 *   is faithful to the contract, not to Supabase's implementation.
 * - Concurrency. PGlite is a single embedded connection, so two transactions
 *   cannot genuinely race here. `concurrency.pg.test.mjs` runs the races that
 *   matter against a real Postgres, using the same stub and migrations.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', '..', '..', 'supabase', 'migrations');

/**
 * The subset of Supabase's platform that the migrations rely on.
 *
 * Idempotent, because roles are cluster-wide on a real Postgres and a second
 * test database on the same server would otherwise fail to create them.
 */
export const AUTH_STUB = `
  create schema if not exists auth;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  -- Supabase resolves the current user from the request's JWT claims. Mirroring
  -- that exactly means the RLS policies are exercised as they will run in
  -- production, rather than against a convenient stand-in.
  create or replace function auth.uid() returns uuid
  language sql stable
  as $$
    select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
  $$;

  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  grant usage on schema auth to anon, authenticated;

  -- Supabase grants everything created in public to the API roles by default,
  -- and leaves row level security to stop them. Reproducing that here is what
  -- makes a migration that forgets to narrow its grants fail a test: without
  -- it, a missing grant would read as "permission denied" in this harness while
  -- production quietly allowed the request.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

/** The migration files, in the order Supabase applies them. */
export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Applies migrations to `db`. `after` and `until` bound the range by filename
 * prefix, inclusive of `until` and exclusive of `after`, so a test can stop
 * part-way, create data the way an older schema would have, and then carry on.
 */
export async function applyMigrations(db, { after, until } = {}) {
  for (const file of migrationFiles()) {
    if (after && file <= after) continue;
    if (until && file > until) break;
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
}

export async function createTestDatabase({ until } = {}) {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  await applyMigrations(db, { until });
  return db;
}

/** Inserts an auth user, which fires the trigger that creates the profile. */
export async function createUser(db, user = {}) {
  const metadata = {};
  if (user.username !== undefined) metadata.username = user.username;
  if (user.displayName !== undefined) metadata.display_name = user.displayName;

  const result = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
    [user.email ?? `u${counter++}@example.test`, JSON.stringify(metadata)],
  );

  const row = result.rows[0];
  if (!row) throw new Error('auth.users insert returned no row');
  return row.id;
}

let counter = 0;

/**
 * Runs `fn` as the given signed-in user, with RLS in force.
 *
 * The session role has to change for policies to apply at all: PGlite connects
 * as a superuser, and superusers bypass row level security entirely, so a test
 * that forgot this would pass no matter what the policies said.
 */
export async function asUser(db, userId, fn) {
  await db.exec(`
    select set_config('request.jwt.claims', '${JSON.stringify({ sub: userId })}', false);
    set role authenticated;
  `);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
  }
}

/** Runs `fn` as a signed-out visitor. */
export async function asAnon(db, fn) {
  await db.exec(`
    select set_config('request.jwt.claims', '', false);
    set role anon;
  `);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}
