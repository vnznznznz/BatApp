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
 *
 * "Table" here means anything in `public` that can be read like one - a view
 * too - and a privilege on a single column counts as much as one on the whole
 * table. The audit used to ask about whole tables only, and only about
 * ordinary ones: a column of letters granted to a signed-out visitor, or a view
 * over them, passed it. (Found in review.) The last tests here grant exactly
 * those, on a database of their own, to see that the audit now says so.
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

/** Tables of every kind, and views: whatever a role could be granted a way to read. */
const TABLES_AND_VIEWS = `('r', 'p', 'v', 'm', 'f')`;

/** Every table and view in `public`, mapped to the table-level privileges `role` holds. */
async function tablePrivileges(role, database = db) {
  const { rows } = await database.query(
    `select c.relname as table, p.privilege
     from pg_class c
     cross join unnest($2::text[]) as p (privilege)
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ${TABLES_AND_VIEWS}
       and has_table_privilege($1, c.oid, p.privilege)
     order by 1, 2`,
    [role, TABLE_PRIVILEGES],
  );
  const { rows: tables } = await database.query(
    `select relname as table from pg_class
     where relnamespace = 'public'::regnamespace and relkind in ${TABLES_AND_VIEWS}
     order by 1`,
  );
  const result = Object.fromEntries(tables.map(({ table }) => [table, []]));
  for (const { table, privilege } of rows) result[table].push(privilege);
  return result;
}

/**
 * Every column in `public` on which `role` holds a privilege that it does not
 * hold on the whole table, as 'table.column PRIVILEGE'. A privilege granted
 * column by column is invisible to has_table_privilege.
 */
async function columnPrivileges(role, database = db) {
  const { rows } = await database.query(
    `select c.relname || '.' || a.attname || ' ' || p.privilege as held
     from pg_class c
     join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as p (privilege)
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ${TABLES_AND_VIEWS}
       and has_column_privilege($1, c.oid, a.attnum, p.privilege)
       and not has_table_privilege($1, c.oid, p.privilege)
     order by 1`,
    [role],
  );
  return rows.map((row) => row.held);
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
      // Read through get_roost(), which lands what is due first; see the bats migration.
      bats: [],
      // Read through list_blocked(), which shows only the caller's own blocks.
      blocks: [],
      cities: ['SELECT'],
      friendships: ['SELECT'],
      // Letters are read only through functions that choose their columns.
      messages: [],
      profiles: ['SELECT'],
      // For the operator, in the dashboard; written only by the report functions.
      reports: [],
    });
  });

  it('gives a signed-out visitor no single column of any of them either', async () => {
    assert.deepEqual(await columnPrivileges('anon'), []);
  });

  /** In all of `public`: the two things a courier changes about themselves. */
  it('gives a signed-in user two columns beyond that: their name and their city, to update', async () => {
    assert.deepEqual(await columnPrivileges('authenticated'), [
      'profiles.city_id UPDATE',
      'profiles.display_name UPDATE',
    ]);
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
      'block_courier',
      'delete_own_account',
      'get_badges',
      'get_roost',
      'list_blocked',
      'list_friends',
      'list_inbox',
      'list_sent',
      'read_message',
      'remove_friend',
      'report_courier',
      'report_letter',
      'request_friend',
      'search_cities',
      'send_message',
      'sent_letter',
      'unblock_courier',
      'withdraw_request',
    ]);
  });

  /**
   * The schema is closed to them; this is the second lock behind it. PostgreSQL
   * lets everybody execute a new function unless that is taken away where the
   * function is made, and a function left that way would be one grant on the
   * schema away from the API. GoTrue's role is asked too: it holds nothing but
   * what everybody holds.
   */
  it('lets no role but the owner execute anything in the private schema', async () => {
    const { rows } = await db.query(
      `select p.oid::regprocedure::text as function, r.rolname as role
       from pg_proc p
       cross join pg_roles r
       where p.pronamespace = 'private'::regnamespace
         and r.rolname in ('anon', 'authenticated', 'supabase_auth_admin')
         and has_function_privilege(r.oid, p.oid, 'execute')
       order by 1, 2`,
    );

    assert.deepEqual(rows, []);
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
       where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
       order by 1`,
    );

    assert.ok(rows.length >= 7, `expected every table, found ${rows.length}`);
    for (const row of rows) {
      assert.ok(row.enabled && row.forced, `RLS is not enabled and forced on ${row.table}`);
    }
  });

  /**
   * A view reads its tables as its owner unless it says otherwise, and on the
   * platform the owner of everything here passes row level security by. There
   * is no view today; one that is added has to say so.
   */
  it('is not passed by through a view that reads as its owner', async () => {
    const { rows } = await db.query(
      `select relname as view
       from pg_class
       where relnamespace = 'public'::regnamespace
         and relkind in ('v', 'm')
         and not coalesce(reloptions, '{}') @> array['security_invoker=true']
       order by 1`,
    );

    assert.deepEqual(rows, []);
  });
});

/**
 * That the audit above can fail. Two things a later migration might do without
 * anyone meaning harm, each of which it used to pass: a column granted on its
 * own, and a view over a table nobody may read.
 */
describe('the audit itself', () => {
  let scratch;

  before(async () => {
    scratch = await createTestDatabase();
    await scratch.exec(`
      grant select (body) on public.messages to anon;
      grant update (status) on public.friendships to authenticated;
      create view public.all_letters as select id, sender_id, recipient_id, body from public.messages;
      grant select on public.all_letters to anon;
    `);
  });

  after(async () => {
    await scratch?.close();
  });

  it('sees a privilege granted on a single column', async () => {
    assert.deepEqual(await columnPrivileges('anon', scratch), ['messages.body SELECT']);
    assert.deepEqual(await columnPrivileges('authenticated', scratch), [
      'friendships.status UPDATE',
      'profiles.city_id UPDATE',
      'profiles.display_name UPDATE',
    ]);
  });

  it('sees a view, and what a role may do with it', async () => {
    const held = await tablePrivileges('anon', scratch);

    assert.deepEqual(held.all_letters, ['SELECT']);
    assert.deepEqual(held.messages, []);
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
