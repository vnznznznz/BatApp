import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { count, createCourier, makeFriends, rpc, setCity } from './fixtures.mjs';
import { asUser, createTestDatabase } from './harness.mjs';

/**
 * Keeping less, for less long: the daily tidy-up, and what account deletion and
 * removal take with them. What the privacy policy promises about sign-in
 * records, sign-up details, banned accounts and moves is checked here.
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

const tidyUp = () => db.query(`select private.tidy_up()`);

/** Runs the tidy-up and returns the steps it reports it could not do. */
const skippedSteps = async () =>
  (await db.query(`select private.tidy_up() as skipped`)).rows[0].skipped;

/** An audit entry the way GoTrue writes one: the user only inside the payload. */
const audit = (actorId, { daysAgo = 0, action = 'login' } = {}) =>
  db.query(
    `insert into auth.audit_log_entries (payload, created_at, ip_address)
     values ($1::json, now() - make_interval(days => $2), '203.0.113.7')`,
    [
      JSON.stringify({ actor_id: actorId, actor_username: 'someone@example.test', action }),
      daysAgo,
    ],
  );

const auditCount = (actorId) =>
  count(db, `select 1 from auth.audit_log_entries where payload ->> 'actor_id' = $1`, [actorId]);

const signInExists = async (id) =>
  (await count(db, `select 1 from auth.users where id = $1`, [id])) === 1;
const profileExists = async (id) =>
  (await count(db, `select 1 from public.profiles where id = $1`, [id])) === 1;

/** Runs `fn` with GoTrue's audit table gone, as on a platform that withholds it. */
async function withoutAuditTable(fn) {
  await db.exec(`begin; drop table auth.audit_log_entries;`);
  try {
    await fn();
  } finally {
    await db.exec(`rollback;`);
  }
}

describe('the daily tidy-up', () => {
  it('forgets sign-in records after 30 days, and keeps the recent ones', async () => {
    const anna = await createCourier(db);
    await audit(anna, { daysAgo: 31 });
    await audit(anna, { daysAgo: 29 });
    await audit(anna, { daysAgo: 0 });

    await tidyUp();

    assert.equal(await auditCount(anna), 2);
    assert.equal(
      await count(
        db,
        `select 1 from auth.audit_log_entries where created_at < now() - interval '30 days'`,
      ),
      0,
    );
  });

  it('ends sessions nobody has used for 90 days, and keeps the ones in use', async () => {
    const anna = await createCourier(db);
    const session = (createdDaysAgo, usedDaysAgo) =>
      db.query(
        `insert into auth.sessions (user_id, created_at, updated_at, ip, user_agent)
         values ($1, now() - make_interval(days => $2), now() - make_interval(days => $3),
                 '203.0.113.7', 'Night Courier')
         returning id`,
        [anna, createdDaysAgo, usedDaysAgo],
      );
    const forgotten = (await session(400, 91)).rows[0].id;
    const oldButInUse = (await session(400, 1)).rows[0].id;
    const recent = (await session(2, 2)).rows[0].id;

    await tidyUp();

    const { rows } = await db.query(`select id from auth.sessions where user_id = $1`, [anna]);
    const left = rows.map((row) => row.id).sort();
    assert.deepEqual(left, [oldButInUse, recent].sort());
    assert.ok(!left.includes(forgotten));
  });

  it('removes the sign-up form from the sign-in, and leaves the profile and anything else', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await db.query(
      `update auth.users set raw_user_meta_data = raw_user_meta_data || '{"locale": "de"}' where id = $1`,
      [anna],
    );

    await tidyUp();

    const { rows } = await db.query(
      `select raw_user_meta_data as meta from auth.users where id = $1`,
      [anna],
    );
    assert.deepEqual(rows[0].meta, { locale: 'de' });
    const profile = await db.query(
      `select username, display_name from public.profiles where id = $1`,
      [anna],
    );
    assert.deepEqual(profile.rows[0], { username: 'anna', display_name: 'anna' });
  });

  it('removes the copy GoTrue keeps in the email identity too', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await db.query(
      `insert into auth.identities (user_id, identity_data)
       values ($1::uuid, jsonb_build_object('sub', $1::text, 'email', 'anna@example.test',
                                      'username', 'anna', 'display_name', 'Anna'))`,
      [anna],
    );

    await tidyUp();

    const { rows } = await db.query(
      `select identity_data as data from auth.identities where user_id = $1`,
      [anna],
    );
    assert.deepEqual(rows[0].data, { sub: anna, email: 'anna@example.test' });
  });

  it('deletes a removed account once its ban has run out, and nothing else', async () => {
    const expired = await createCourier(db);
    const stillBanned = await createCourier(db);
    const suspended = await createCourier(db);
    const ordinary = await createCourier(db);

    await db.query(`update auth.users set banned_until = now() - interval '1 day' where id = $1`, [
      expired,
    ]);
    await db.query(`update auth.users set banned_until = now() + interval '1 day' where id = $1`, [
      stillBanned,
    ]);
    // A ban that has run out on an account that still has a profile is a
    // suspension, not a removal: the account is theirs again.
    await db.query(`update auth.users set banned_until = now() - interval '1 day' where id = $1`, [
      suspended,
    ]);
    await db.query(`delete from public.profiles where id = any($1::uuid[])`, [
      [expired, stillBanned],
    ]);

    await tidyUp();

    assert.equal(await signInExists(expired), false);
    assert.equal(await signInExists(stillBanned), true);
    assert.equal(await signInExists(suspended), true);
    assert.equal(await signInExists(ordinary), true);
  });

  it('deletes a sign-up never confirmed within 7 days, profile and all, and nothing else', async () => {
    const forgotten = await createCourier(db);
    const waiting = await createCourier(db);
    const confirmedLongAgo = await createCourier(db);
    await db.query(
      `update auth.users set email_confirmed_at = null, created_at = now() - interval '8 days'
       where id = $1`,
      [forgotten],
    );
    await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [waiting]);
    await db.query(`update auth.users set created_at = now() - interval '400 days' where id = $1`, [
      confirmedLongAgo,
    ]);

    await tidyUp();

    assert.equal(await signInExists(forgotten), false);
    assert.equal(await profileExists(forgotten), false);
    assert.equal(await signInExists(waiting), true, 'a sign-up still within its week stays');
    assert.equal(await signInExists(confirmedLongAgo), true);
  });

  it('forgets the city a courier moved away from once the move has settled', async () => {
    const settled = await createCourier(db, { city: ['Berlin', 'DE'] });
    const moving = await createCourier(db, { city: ['Berlin', 'DE'] });
    await setCity(db, settled, ['Munich', 'DE']);
    await setCity(db, moving, ['Munich', 'DE']);
    await db.query(
      `update public.profiles set city_changed_at = now() - interval '25 hours' where id = $1`,
      [settled],
    );

    const flightCity = async (who) =>
      (
        await db.query(`select c.name from public.cities c where c.id = private.flight_city($1)`, [
          who,
        ])
      ).rows[0].name;
    assert.equal(await flightCity(settled), 'Munich');

    await tidyUp();

    const { rows } = await db.query(
      `select id, settled_city_id, city_changed_at from public.profiles where id = any($1::uuid[])`,
      [[settled, moving]],
    );
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    assert.equal(byId[settled].settled_city_id, null);
    assert.equal(byId[settled].city_changed_at, null);
    assert.notEqual(byId[moving].settled_city_id, null, 'a move still settling keeps the old city');
    // Forgetting changes nothing about where either courier's bats fly from.
    assert.equal(await flightCity(settled), 'Munich');
    assert.equal(await flightCity(moving), 'Berlin');
  });

  it('reports what it could not do: here only pg_cron, which the tests do not have', async () => {
    const skipped = await skippedSteps();
    assert.equal(skipped.length, 1, skipped.join('\n'));
    assert.match(skipped[0], /^pg_cron run log: /);
  });

  it('carries on with the rest where the audit log is out of reach, and says so', async () => {
    const anna = await createCourier(db, { name: 'anna' });

    await withoutAuditTable(async () => {
      const skipped = await skippedSteps();
      assert.ok(
        skipped.some((step) => step.startsWith('sign-in log: ')),
        skipped.join('\n'),
      );
      const { rows } = await db.query(
        `select raw_user_meta_data as meta from auth.users where id = $1`,
        [anna],
      );
      assert.deepEqual(rows[0].meta, {});
    });
  });

  it('carries on where it may not touch the sign-ins themselves, and says so', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await audit(anna, { daysAgo: 31 });
    await db.query(`update auth.users set banned_until = now() - interval '1 day' where id = $1`, [
      anna,
    ]);
    await db.query(`delete from public.profiles where id = $1`, [anna]);

    // A role that may do everything the job needs except touch auth.users.
    await db.exec(`
      begin;
      create role tidier nologin;
      grant usage on schema private, auth, public to tidier;
      grant execute on all functions in schema private to tidier;
      grant select, delete on auth.audit_log_entries, auth.sessions to tidier;
      grant select, update on auth.identities, public.profiles to tidier;
      set role tidier;
    `);
    try {
      const { rows } = await db.query(`select private.tidy_up() as skipped`);
      const skipped = rows[0].skipped;
      await db.exec(`reset role;`);

      const names = skipped.map((step) => step.slice(0, step.indexOf(':')));
      assert.deepEqual(names.sort(), [
        'expired bans',
        'pg_cron run log',
        'sign-up names',
        'unconfirmed sign-ups',
      ]);
      assert.equal(await auditCount(anna), 0, 'the sign-in log was still tidied');
      assert.equal(await signInExists(anna), true, 'the banned sign-in could not be deleted');
    } finally {
      // Also undoes the role switch, and works even if the run failed part-way.
      await db.exec(`rollback;`);
    }
  });

  it('cannot be run through the API', async () => {
    const anna = await createCourier(db);
    await assert.rejects(
      asUser(db, anna, () => db.query(`select private.tidy_up()`)),
      /permission denied/,
    );
  });
});

describe('deleting your own account', () => {
  it('takes its sign-in records with it, and leaves everyone else’s', async () => {
    const anna = await createCourier(db);
    const ben = await createCourier(db);
    await audit(anna);
    await audit(anna, { action: 'token_refreshed' });
    await audit(ben);

    await rpc(db, anna, 'delete_own_account');

    assert.equal(await auditCount(anna), 0);
    assert.equal(await auditCount(ben), 1);
    assert.equal(await signInExists(anna), false);
  });

  it('still works where the audit log is out of reach', async () => {
    const anna = await createCourier(db);

    await withoutAuditTable(async () => {
      await rpc(db, anna, 'delete_own_account');
      assert.equal(await signInExists(anna), false);
    });
  });
});

describe('the operator removing an account', () => {
  const remove = (id) => db.query(`select private.remove_account($1)`, [id]);

  it('deletes everything the account holds, and keeps its sign-in banned for two years', async () => {
    const anna = await createCourier(db, { city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { city: ['Munich', 'DE'] });
    await makeFriends(db, anna, ben);
    await rpc(db, anna, 'send_message', { recipient_id: ben, body: 'Good evening.' });

    await remove(anna);

    assert.equal(await profileExists(anna), false);
    assert.equal(
      await count(db, `select 1 from public.messages where $1 in (sender_id, recipient_id)`, [
        anna,
      ]),
      0,
    );
    assert.equal(await count(db, `select 1 from public.bats where owner_id = $1`, [anna]), 0);
    const { rows } = await db.query(
      `select banned_until between now() + interval '2 years' - interval '1 minute'
                               and now() + interval '2 years' as two_years
       from auth.users where id = $1`,
      [anna],
    );
    assert.equal(rows[0]?.two_years, true);
    assert.equal(await profileExists(ben), true);
  });

  it('leaves the sign-in to the tidy-up, which deletes it only once the ban has run out', async () => {
    const anna = await createCourier(db);
    await remove(anna);

    await tidyUp();
    assert.equal(await signInExists(anna), true, 'banned: kept, so the email cannot sign up again');

    await db.query(
      `update auth.users set banned_until = now() - interval '1 second' where id = $1`,
      [anna],
    );
    await tidyUp();
    assert.equal(await signInExists(anna), false);
  });

  it('keeps the sign-in records, which expire on their own', async () => {
    const anna = await createCourier(db);
    await audit(anna);

    await remove(anna);

    assert.equal(await auditCount(anna), 1);
  });

  it('says so when there is no such account', async () => {
    await assert.rejects(remove('00000000-0000-0000-0000-000000000000'), /there is no account/);
  });

  it('cannot be done through the API', async () => {
    const anna = await createCourier(db);
    const ben = await createCourier(db);
    await assert.rejects(
      asUser(db, anna, () => db.query(`select private.remove_account($1)`, [ben])),
      /permission denied/,
    );
    assert.equal(await profileExists(ben), true);
  });
});
