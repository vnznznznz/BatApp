import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createTestDatabase } from './harness.mjs';

/**
 * An audit of what the API roles can do, read from the catalog rather than
 * inferred from individual tests.
 *
 * Supabase grants every new table and function in `public` to `anon` and
 * `authenticated` by default, and the harness reproduces that. These tests list,
 * in full, what each role is meant to hold. A migration that adds a table or a
 * function without deciding its privileges fails here, by name, rather than
 * inheriting the platform's defaults unnoticed.
 */

let db;

before(async () => {
  db = await createTestDatabase();
});

after(async () => {
  await db?.close();
});

const TABLE_PRIVILEGES = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
];

/** Every table in `public`, mapped to the table-level privileges `role` holds. */
async function tablePrivileges(role) {
  const { rows } = await db.query(
    `select c.relname as table, p.privilege
     from pg_class c
     cross join unnest($2::text[]) as p (privilege)
     where c.relnamespace = 'public'::regnamespace
       and c.relkind = 'r'
       and has_table_privilege($1, c.oid, p.privilege)
     order by 1, 2`,
    [role, TABLE_PRIVILEGES],
  );
  const { rows: tables } = await db.query(
    `select relname as table from pg_class
     where relnamespace = 'public'::regnamespace and relkind = 'r'
     order by 1`,
  );
  const result = Object.fromEntries(tables.map(({ table }) => [table, []]));
  for (const { table, privilege } of rows) result[table].push(privilege);
  return result;
}

/** Every function in `public`, mapped to whether `role` may execute it. */
async function executableFunctions(role) {
  const { rows } = await db.query(
    `select p.proname as name
     from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and has_function_privilege($1, p.oid, 'execute')
     order by 1`,
    [role],
  );
  return rows.map((row) => row.name);
}

describe('table privileges', () => {
  it('gives a signed-out visitor nothing at all', async () => {
    const privileges = await tablePrivileges('anon');

    for (const [table, held] of Object.entries(privileges)) {
      assert.deepEqual(held, [], `anon holds ${held.join(', ')} on ${table}`);
    }
  });

  /**
   * The full list. Adding a table to `public` means adding it here, with the
   * privileges it should have - which is the point.
   */
  it('gives a signed-in user exactly what the app uses, and only by SELECT', async () => {
    assert.deepEqual(await tablePrivileges('authenticated'), {
      bats: ['SELECT'],
      cities: ['SELECT'],
      friendships: ['SELECT'],
      // Letters are read only through functions that choose their columns.
      messages: [],
      profiles: ['SELECT'],
    });
  });

  it('lets a signed-in user update only their name and city on a profile', async () => {
    const { rows } = await db.query(
      `select a.attname as column
       from pg_attribute a
       where a.attrelid = 'public.profiles'::regclass
         and a.attnum > 0
         and not a.attisdropped
         and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')
       order by 1`,
    );

    assert.deepEqual(
      rows.map((row) => row.column),
      ['city_id', 'display_name'],
    );
  });
});

describe('function privileges', () => {
  it('lets a signed-out visitor execute nothing', async () => {
    assert.deepEqual(await executableFunctions('anon'), []);
  });

  /** The API surface, in full. A new function in `public` must be listed. */
  it('lets a signed-in user execute exactly the API', async () => {
    assert.deepEqual(await executableFunctions('authenticated'), [
      'accept_friend',
      'delete_own_account',
      'get_badges',
      'get_roost',
      'list_friends',
      'list_inbox',
      'list_sent',
      'read_message',
      'remove_friend',
      'request_friend',
      'search_cities',
      'send_message',
    ]);
  });

  it('keeps the private schema out of reach of both API roles', async () => {
    const { rows } = await db.query(
      `select has_schema_privilege('anon', 'private', 'usage') as anon,
              has_schema_privilege('authenticated', 'private', 'usage') as authenticated`,
    );

    assert.deepEqual(rows[0], { anon: false, authenticated: false });
  });
});

describe('row level security', () => {
  it('is enabled and forced on every table in public', async () => {
    const { rows } = await db.query(
      `select relname as table, relrowsecurity as enabled, relforcerowsecurity as forced
       from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'
       order by 1`,
    );

    for (const row of rows) {
      assert.ok(row.enabled && row.forced, `RLS is not enabled and forced on ${row.table}`);
    }
  });
});

describe('security definer functions', () => {
  /**
   * A SECURITY DEFINER function runs with its owner's rights. Without a fixed
   * search_path, a caller could create objects that shadow the ones it meant to
   * use and have them run with those rights.
   */
  it('all pin an empty search_path', async () => {
    const { rows } = await db.query(
      `select n.nspname || '.' || p.proname as name, p.proconfig as config
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and n.nspname in ('public', 'private')
       order by 1`,
    );

    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.ok(
        (row.config ?? []).includes('search_path=""'),
        `${row.name} does not pin search_path: ${JSON.stringify(row.config)}`,
      );
    }
  });
});
