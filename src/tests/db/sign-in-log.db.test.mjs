import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { count, createCourier, rpc } from './fixtures.mjs';
import { createTestDatabase } from './harness.mjs';

/**
 * GoTrue's log of sign-ins belongs to GoTrue. On the hosted platform the role
 * the migrations run as - which owns the functions they create, and which the
 * operator works as in the SQL editor - need not be let near it: a delete
 * there is refused for want of the privilege. Deleting an account must then
 * still delete the account, and leave the sign-in records to expire.
 *
 * The housekeeping tests take the table away altogether, which is a different
 * error. Here it stays, out of reach of a role that may do everything else a
 * deletion does.
 */

let db;

before(async () => {
  db = await createTestDatabase();
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`
    truncate auth.users cascade;
    truncate auth.audit_log_entries;
  `);
});

/**
 * Runs `fn` with a role in place that may read and change every table but the
 * sign-in log, and bypasses row level security as the platform's own role
 * does. `setUp` is SQL run, as the superuser, once the role exists.
 */
async function withoutTheSignInLog(setUp, fn) {
  await db.exec(`
    begin;
    create role stand_in nologin bypassrls;
    grant usage on schema auth, public, private to stand_in;
    grant execute on all functions in schema private, auth to stand_in;
    grant select, update, delete on all tables in schema public, private to stand_in;
    grant select, delete on auth.users to stand_in;
    ${setUp}
  `);
  try {
    await fn();
  } finally {
    // Undoes the role and all it was given, and any switch to it.
    await db.exec(`rollback;`);
  }
}

/** A courier who has signed in once, as GoTrue logs it. */
async function signedInCourier(name) {
  const id = await createCourier(db, { name, city: ['Berlin', 'DE'] });
  await db.query(
    `insert into auth.audit_log_entries (payload) values (json_build_object('actor_id', $1::text))`,
    [id],
  );
  return id;
}

const accountExists = async (id) =>
  (await count(db, `select 1 from auth.users where id = $1`, [id])) === 1;
const signInRecords = (id) =>
  count(db, `select 1 from auth.audit_log_entries where payload ->> 'actor_id' = $1`, [id]);

describe('deleting an account where the sign-in log may not be touched', () => {
  it('still deletes the courier’s own account, and leaves the log to expire', async () => {
    const anna = await signedInCourier('anna');

    // delete_own_account runs with its owner's rights, whoever calls it.
    await withoutTheSignInLog(
      `alter function public.delete_own_account() owner to stand_in;`,
      async () => {
        await rpc(db, anna, 'delete_own_account');

        assert.equal(await accountExists(anna), false);
        assert.equal(await signInRecords(anna), 1);
      },
    );
  });

  it('still lets the operator delete an account, and leaves the log to expire', async () => {
    const anna = await signedInCourier('anna');

    await withoutTheSignInLog(`set role stand_in;`, async () => {
      await db.query(`select private.delete_account($1)`, [anna]);
      await db.exec(`reset role;`);

      assert.equal(await accountExists(anna), false);
      assert.equal(await signInRecords(anna), 1);
    });
  });
});
