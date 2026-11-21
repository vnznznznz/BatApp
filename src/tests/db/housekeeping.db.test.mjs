import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  cityId,
  count,
  createCourier,
  fastForward,
  makeFriends,
  rejectsWithHint,
  rpc,
  runWorker,
  setCity,
} from './fixtures.mjs';
import { asUser, createTestDatabase } from './harness.mjs';

/**
 * Keeping less, for less long: the daily tidy-up, and what account deletion and
 * removal take with them. What the privacy policy promises about sign-in
 * records, sign-up details, banned accounts and moves is checked here - and
 * that an account the operator has stopped is stopped: at once, and without a
 * way to delete what the operator is keeping.
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

/** The statement docs/GO-LIVE.md gives the operator for "A threat", word for word. */
const suspend = (id) =>
  db.query(`update auth.users set banned_until = now() + private.ban_period() where id = $1`, [id]);

const bannedUntil = async (id) =>
  (await db.query(`select banned_until from auth.users where id = $1`, [id])).rows[0]?.banned_until;

const session = (userId) =>
  db.query(
    `insert into auth.sessions (user_id, ip, user_agent) values ($1, '203.0.113.7', 'Night Courier')`,
    [userId],
  );

/** Runs `sql` as the signed-in courier, the way a direct request to a table does. */
const asCourier = (id, sql, params = []) => asUser(db, id, () => db.query(sql, params));

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
    // Unused for a day short of the 90: a shorter period would end it too.
    const nearlyForgotten = (await session(400, 89)).rows[0].id;
    const oldButInUse = (await session(400, 1)).rows[0].id;
    const recent = (await session(2, 2)).rows[0].id;

    await tidyUp();

    const { rows } = await db.query(`select id from auth.sessions where user_id = $1`, [anna]);
    const left = rows.map((row) => row.id).sort();
    assert.deepEqual(left, [nearlyForgotten, oldButInUse, recent].sort());
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

  /**
   * No code was ever sent to these - nor is one to an account the operator
   * makes by hand without confirming it, even while confirmation is off,
   * until someone asks for one - so their week counts from when they were
   * made.
   */
  it('deletes a sign-up never confirmed within 7 days, profile and all, and nothing else', async () => {
    const forgotten = await createCourier(db);
    const waiting = await createCourier(db);
    const confirmedLongAgo = await createCourier(db);
    await db.query(
      `update auth.users set email_confirmed_at = null, created_at = now() - interval '8 days'
       where id = $1`,
      [forgotten],
    );
    // A day short of its week: a shorter period would delete it too.
    await db.query(
      `update auth.users set email_confirmed_at = null, created_at = now() - interval '6 days'
       where id = $1`,
      [waiting],
    );
    await db.query(`update auth.users set created_at = now() - interval '400 days' where id = $1`, [
      confirmedLongAgo,
    ]);

    await tidyUp();

    assert.equal(await signInExists(forgotten), false);
    assert.equal(await profileExists(forgotten), false);
    assert.equal(await signInExists(waiting), true, 'a sign-up still within its week stays');
    assert.equal(await signInExists(confirmedLongAgo), true);
  });

  /**
   * Once confirmation is on, someone can ask for a new code a week after
   * signing up, and a code is good for a day. Counted from the sign-up, the
   * account went that same night, and the new code was refused. (Found in
   * review.) GoTrue writes when it sent the newest code.
   */
  it('counts a sign-up’s week from the last code sent to it', async () => {
    const lastCodeLongAgo = await createCourier(db);
    const lastCodeRecent = await createCourier(db);
    const signedUpTenDaysAgo = (id, lastCodeDaysAgo) =>
      db.query(
        `update auth.users
         set email_confirmed_at = null, created_at = now() - interval '10 days',
             confirmation_sent_at = now() - make_interval(days => $2)
         where id = $1`,
        [id, lastCodeDaysAgo],
      );
    await signedUpTenDaysAgo(lastCodeLongAgo, 8);
    // A day short of its week from the code, and long past it from the sign-up.
    await signedUpTenDaysAgo(lastCodeRecent, 6);

    await tidyUp();

    assert.equal(await signInExists(lastCodeLongAgo), false);
    assert.equal(await profileExists(lastCodeLongAgo), false);
    assert.equal(await signInExists(lastCodeRecent), true, 'a week has not passed since its code');
    assert.equal(await profileExists(lastCodeRecent), true);
  });

  /**
   * Such a sign-up cannot sign in, but it has a profile, and couriers can have
   * asked it to be friends, blocked it and reported it. Several can be due in
   * one night. What others hold of them goes; a report stays, as it does when
   * any account goes.
   */
  it('deletes every such sign-up of the night, with what couriers hold of them, but not a report', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const forgotten = [
      await createCourier(db, { name: 'first' }),
      await createCourier(db, { name: 'second' }),
    ];
    await db.query(
      `update auth.users set email_confirmed_at = null, created_at = now() - interval '8 days'
       where id = any($1::uuid[])`,
      [forgotten],
    );
    await rpc(db, anna, 'request_friend', { username: 'first' });
    await rpc(db, anna, 'report_courier', { courier_id: forgotten[0], reason: 'spam' });
    await rpc(db, anna, 'block_courier', { courier_id: forgotten[1] });

    await tidyUp();

    for (const id of forgotten) assert.equal(await signInExists(id), false);
    assert.equal(await count(db, `select 1 from public.friendships`), 0);
    assert.equal(await count(db, `select 1 from public.blocks`), 0);
    const { rows } = await db.query(
      `select reporter_id, reported_id, reported_username from public.reports`,
    );
    assert.deepEqual(rows, [{ reporter_id: anna, reported_id: null, reported_username: 'first' }]);
  });

  it('forgets the city a courier moved away from once the move has settled', async () => {
    const settled = await createCourier(db, { city: ['Berlin', 'DE'] });
    const moving = await createCourier(db, { city: ['Berlin', 'DE'] });
    // Before a courier's first letter a move counts at once: both have had one.
    await db.query(`update public.profiles set has_corresponded = true where id = any($1)`, [
      [settled, moving],
    ]);
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

  /** A count matters for an hour. After a day it only says when someone was last asking. */
  it('forgets how many friend requests a courier made, a day after their hour began', async () => {
    const dayOld = await createCourier(db, { name: 'dayold' });
    const recent = await createCourier(db, { name: 'recent' });
    await createCourier(db, { name: 'ben' });
    await rpc(db, dayOld, 'request_friend', { username: 'ben' });
    await rpc(db, recent, 'request_friend', { username: 'ben' });
    const hourBegan = (who, hoursAgo) =>
      db.query(
        `update private.friend_request_counts
         set hour_began_at = now() - make_interval(hours => $2) where courier_id = $1`,
        [who, hoursAgo],
      );
    await hourBegan(dayOld, 25);
    await hourBegan(recent, 23);

    await tidyUp();

    const { rows } = await db.query(`select courier_id from private.friend_request_counts`);
    assert.deepEqual(
      rows.map((row) => row.courier_id),
      [recent],
    );
    assert.equal(await count(db, `select 1 from public.friendships`), 2, 'the requests stay');
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
      grant select, update, delete on private.friend_request_counts to tidier;
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

  /**
   * After a threat the operator suspends the account and deletes nothing for a
   * week (docs/GO-LIVE.md, "A threat"). The app it is signed in on still holds
   * a token that works for up to an hour, and with it "Delete my account" took
   * the letters, the sign-in records and the ban itself. (Found in review.)
   */
  it('is refused to a suspended account, and nothing the suspension keeps is lost', async () => {
    const anna = await createCourier(db, { city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { city: ['Munich', 'DE'] });
    await makeFriends(db, anna, ben);
    const [letter] = await rpc(db, anna, 'send_message', { recipient_id: ben, body: 'A threat.' });
    await fastForward(db, letter.message_id);
    await runWorker(db);
    await audit(anna);
    await session(anna);

    await suspend(anna);

    await rejectsWithHint(rpc(db, anna, 'delete_own_account'), 'account_suspended');

    assert.equal(await signInExists(anna), true);
    assert.equal(await profileExists(anna), true);
    assert.equal(
      await count(db, `select 1 from public.messages where recipient_id = $1`, [ben]),
      1,
    );
    assert.equal(await auditCount(anna), 1);
    assert.equal(await count(db, `select 1 from auth.sessions where user_id = $1`, [anna]), 1);
  });

  /** Its sign-in is what keeps the same email address from signing up again. */
  it('is refused to a removed account, whose banned sign-in stays', async () => {
    const anna = await createCourier(db);
    await audit(anna);
    await db.query(`select private.remove_account($1)`, [anna]);

    await rejectsWithHint(rpc(db, anna, 'delete_own_account'), 'account_suspended');

    assert.ok((await bannedUntil(anna)) > new Date(), 'the sign-in is still there, and banned');
    assert.equal(await auditCount(anna), 1);
  });

  it('works again once a suspension has run out, or has been lifted', async () => {
    const lapsed = await createCourier(db);
    const lifted = await createCourier(db);
    await db.query(
      `update auth.users set banned_until = now() - interval '1 second' where id = $1`,
      [lapsed],
    );
    await suspend(lifted);
    await db.query(`update auth.users set banned_until = null where id = $1`, [lifted]);

    await rpc(db, lapsed, 'delete_own_account');
    await rpc(db, lifted, 'delete_own_account');

    assert.equal(await signInExists(lapsed), false);
    assert.equal(await signInExists(lifted), false);
  });

  /** Two phones signed in to one account: the second finds nothing left to delete. */
  it('is not an error for an account that is already gone', async () => {
    const anna = await createCourier(db);

    await rpc(db, anna, 'delete_own_account');
    await rpc(db, anna, 'delete_own_account');

    assert.equal(await signInExists(anna), false);
  });
});

/**
 * GoTrue stops a banned account signing in or renewing its sign-in, but the
 * token an app already holds is good at the API until it expires, up to an hour
 * later. The database is where "at once" has to be made true.
 */
describe('a suspended account', () => {
  const SAMPLE = {
    uuid: '00000000-0000-4000-8000-000000000000',
    text: 'x',
    integer: 1,
    boolean: false,
  };

  /**
   * Every function the API offers a signed-in courier, read from the catalog
   * with a value for each argument - so that a function added later is held to
   * the same rule without anyone remembering to list it here.
   */
  async function apiCalls() {
    const { rows } = await db.query(
      `select p.proname as name, pg_get_function_identity_arguments(p.oid) as arguments
       from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and has_function_privilege('authenticated', p.oid, 'execute')
       order by 1`,
    );
    return rows.map(({ name, arguments: list }) => {
      const types = list ? list.split(', ').map((arg) => arg.split(' ').slice(1).join(' ')) : [];
      for (const type of types) {
        assert.ok(type in SAMPLE, `add a sample ${type} for ${name}(${list})`);
      }
      return {
        name,
        sql: `select * from public.${name}(${types.map((type, i) => `$${i + 1}::${type}`).join(', ')})`,
        values: types.map((type) => SAMPLE[type]),
      };
    });
  }

  /** The public list of cities is all it searches; the table can be read as well. */
  const refusing = async () => (await apiCalls()).filter((call) => call.name !== 'search_cities');

  it('is refused at once by every function of the API but the city search', async () => {
    const anna = await createCourier(db, { city: ['Berlin', 'DE'] });
    const calls = await refusing();
    assert.ok(calls.length > 15, `expected the whole API, found ${calls.length} functions`);

    await suspend(anna);

    for (const call of calls) {
      await rejectsWithHint(asCourier(anna, call.sql, call.values), 'account_suspended');
    }
  });

  it('is refused the same way once it has been removed', async () => {
    const anna = await createCourier(db);
    await db.query(`select private.remove_account($1)`, [anna]);

    for (const call of await refusing()) {
      await rejectsWithHint(asCourier(anna, call.sql, call.values), 'account_suspended');
    }
  });

  it('is served again as soon as the suspension is lifted, or has run out', async () => {
    const lifted = await createCourier(db);
    const lapsed = await createCourier(db);
    await suspend(lifted);
    await suspend(lapsed);
    await rejectsWithHint(rpc(db, lifted, 'get_badges'), 'account_suspended');

    await db.query(`update auth.users set banned_until = null where id = $1`, [lifted]);
    await db.query(
      `update auth.users set banned_until = now() - interval '1 second' where id = $1`,
      [lapsed],
    );

    const nothingWaiting = [{ unread_messages: 0, friend_requests: 0 }];
    assert.deepEqual(await rpc(db, lifted, 'get_badges'), nothingWaiting);
    assert.deepEqual(await rpc(db, lapsed, 'get_badges'), nothingWaiting);
  });

  it('leaves everyone else alone', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await makeFriends(db, anna, ben);

    await suspend(anna);

    const friends = await rpc(db, ben, 'list_friends');
    assert.deepEqual(
      friends.map((row) => row.username),
      ['anna'],
    );
  });

  /**
   * The one thing a courier writes without a function: their name and their
   * city, through the table. A name is shown to friends, on letters, and to
   * anyone the courier has asked to be friends.
   */
  it('cannot change its name or its city', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const berlin = await cityId(db, 'Berlin', 'DE');
    const munich = await cityId(db, 'Munich', 'DE');
    await suspend(anna);

    await rejectsWithHint(
      asCourier(anna, `update public.profiles set display_name = 'Still here' where id = $1`, [
        anna,
      ]),
      'account_suspended',
    );
    await rejectsWithHint(
      asCourier(anna, `update public.profiles set city_id = $2 where id = $1`, [anna, munich]),
      'account_suspended',
    );

    const { rows } = await db.query(
      `select display_name, city_id from public.profiles where id = $1`,
      [anna],
    );
    assert.deepEqual(rows, [{ display_name: 'anna', city_id: berlin }]);
  });

  /** A name that has to come down, say. The refusal is for the account's own requests. */
  it('does not stop the operator changing its profile', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await suspend(anna);

    await db.query(`update public.profiles set display_name = 'Courier' where id = $1`, [anna]);

    const { rows } = await db.query(`select display_name from public.profiles where id = $1`, [
      anna,
    ]);
    assert.equal(rows[0].display_name, 'Courier');
  });

  /**
   * What is left to it until its token runs out, within the hour: reading
   * what is its own or public. Listed here so that the list is known.
   */
  it('can still read its own profile, the bare rows of its friendships and the city list', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await makeFriends(db, anna, ben);
    await suspend(anna);

    const profiles = await asCourier(anna, `select username from public.profiles`);
    const friendships = await asCourier(anna, `select status from public.friendships`);
    const cities = await asCourier(anna, `select count(*)::int as count from public.cities`);
    const found = await asCourier(anna, `select name from public.search_cities('berlin', 1)`);

    assert.deepEqual(profiles.rows, [{ username: 'anna' }]);
    assert.deepEqual(friendships.rows, [{ status: 'accepted' }]);
    assert.ok(cities.rows[0].count > 4000);
    assert.deepEqual(found.rows, [{ name: 'Berlin' }]);
  });

  it('keeps who is suspended out of reach of the API', async () => {
    const anna = await createCourier(db);
    const ben = await createCourier(db);
    await suspend(ben);

    await assert.rejects(
      asCourier(anna, `select private.is_suspended($1)`, [ben]),
      /permission denied/,
    );
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

  /**
   * Run a second time by mistake, it set the ban again: two more years, counted
   * from the mistake rather than from the removal the privacy policy names.
   */
  it('says so when the account was already removed, and leaves its ban as it was', async () => {
    const anna = await createCourier(db);
    await remove(anna);
    // As if a year of the two had passed.
    await db.query(
      `update auth.users set banned_until = banned_until - interval '1 year' where id = $1`,
      [anna],
    );
    const before = await bannedUntil(anna);

    await assert.rejects(remove(anna), /has already been removed/);

    assert.deepEqual(await bannedUntil(anna), before);
  });

  /** The runbook's order after a threat: suspended at once, removed a week later. */
  it('counts the two years from the removal when the account was suspended first', async () => {
    const anna = await createCourier(db);
    await db.query(
      `update auth.users set banned_until = now() - interval '7 days' + private.ban_period()
       where id = $1`,
      [anna],
    );

    await remove(anna);

    assert.equal(await profileExists(anna), false);
    const { rows } = await db.query(
      `select banned_until between now() + interval '2 years' - interval '1 minute'
                               and now() + interval '2 years' as two_years
       from auth.users where id = $1`,
      [anna],
    );
    assert.equal(rows[0]?.two_years, true);
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

/**
 * For a deletion somebody asks the operator for - their own account, a child's,
 * an address that was never theirs to sign up with. Nothing is held against
 * the address afterwards.
 */
describe('the operator deleting an account', () => {
  const deleteAccount = (id) => db.query(`select private.delete_account($1)`, [id]);

  it('deletes the sign-in, all it holds and its sign-in records, and bans nobody', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
    await makeFriends(db, anna, ben);
    await rpc(db, anna, 'send_message', { recipient_id: ben, body: 'Good evening.' });
    await audit(anna);
    await audit(ben);
    await session(anna);
    const { rows } = await db.query(`select email from auth.users where id = $1`, [anna]);

    await deleteAccount(anna);

    assert.equal(await signInExists(anna), false);
    assert.equal(await profileExists(anna), false);
    assert.equal(await count(db, `select 1 from public.messages`), 0);
    assert.equal(await count(db, `select 1 from auth.sessions where user_id = $1`, [anna]), 0);
    assert.equal(await auditCount(anna), 0);
    assert.equal(await auditCount(ben), 1);
    assert.equal(await profileExists(ben), true);
    // The same address, and the same username, can sign up again at once.
    await db.query(
      `insert into auth.users (email, raw_user_meta_data) values ($1, '{"username": "anna"}')`,
      [rows[0].email],
    );
  });

  /** The operator may be asked to erase what a removal left behind, too. */
  it('deletes a removed account’s sign-in as well, ban and all', async () => {
    const anna = await createCourier(db);
    await db.query(`select private.remove_account($1)`, [anna]);

    await deleteAccount(anna);

    assert.equal(await signInExists(anna), false);
  });

  it('still works where the audit log is out of reach', async () => {
    const anna = await createCourier(db);

    await withoutAuditTable(async () => {
      await deleteAccount(anna);
      assert.equal(await signInExists(anna), false);
    });
  });

  it('says so when there is no such account', async () => {
    await assert.rejects(
      deleteAccount('00000000-0000-0000-0000-000000000000'),
      /there is no account/,
    );
  });

  it('cannot be done through the API', async () => {
    const anna = await createCourier(db);
    const ben = await createCourier(db);
    await assert.rejects(
      asUser(db, anna, () => db.query(`select private.delete_account($1)`, [ben])),
      /permission denied/,
    );
    assert.equal(await signInExists(ben), true);
  });
});
