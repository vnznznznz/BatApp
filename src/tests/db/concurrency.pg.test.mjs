import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { AUTH_STUB, migrationFiles } from './harness.mjs';

/**
 * The races, run for real.
 *
 * PGlite is one embedded connection, so nothing in the other database tests can
 * overlap with anything else. These tests open several connections to a real
 * Postgres and make transactions collide on purpose: the bat reservation, the
 * delivery worker against itself, and two people asking each other at once.
 *
 * A few tests here are no races at all. What the city search costs only shows
 * on the Postgres the service runs on, and PGlite is a newer one that plans the
 * search differently; see "the city search" below. And what a trigger or a
 * check may do depends on whose rights it runs with, which is worth seeing on a
 * real server with real roles; see "written by the roles the platform uses".
 *
 * They need `DATABASE_URL`, pointing at a server where they may create and drop a
 * database, connecting as the `postgres` superuser (the migrations narrow that
 * role's default privileges by name). CI provides one; locally:
 *
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm run test:db
 *
 * Without it they are skipped, loudly, rather than passing by default.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const SKIP = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set: the concurrency tests need a real Postgres (see this file).';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
);

let databaseName;
let databaseUrl;
/** A superuser connection to the test database, for setup and for inspection. */
let admin;
const opened = [];

async function connect() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  opened.push(client);
  // A reservation that queued on a lock instead of skipping it would leave the
  // held-open tests waiting on each other forever. With a timeout, that bug is a
  // failed assertion rather than a hung test run.
  await client.query(`set statement_timeout = '10s'`);
  return client;
}

/** A connection that behaves like one signed-in user's API requests. */
async function connectAs(userId) {
  const client = await connect();
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId }),
  ]);
  await client.query('set role authenticated');
  return client;
}

async function createCourier(name, city) {
  const { rows } = await admin.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('username', $2::text, 'display_name', $2::text))
     returning id`,
    [`${name}@example.test`, name],
  );
  const id = rows[0].id;
  await admin.query(
    `update public.profiles
     set city_id = (select id from public.cities where name = $2 and country_code = $3)
     where id = $1`,
    [id, city[0], city[1]],
  );
  return id;
}

async function makeFriends(a, b) {
  await admin.query(
    `insert into public.friendships (requester_id, addressee_id, status, accepted_at)
     values ($1, $2, 'accepted', now())`,
    [a, b],
  );
}

const flyingBats = async (ownerId) =>
  (
    await admin.query(`select id from public.bats where owner_id = $1 and status = 'flying'`, [
      ownerId,
    ])
  ).rows.length;

/** Whether `promise` settles within `ms` - false means it is still waiting. */
const settlesWithin = (promise, ms) =>
  Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    new Promise((resolve) => setTimeout(() => resolve(false), ms)),
  ]);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `sql`, asked of the test database every few milliseconds, finds a row. */
async function until(sql, params = []) {
  for (let asked = 0; asked < 400; asked++) {
    if ((await admin.query(sql, params)).rows.length > 0) return;
    await pause(25);
  }
  assert.fail(`still nothing after ten seconds: ${sql}`);
}

/**
 * Makes one kind of change to one table take a moment while `run` runs, so
 * that two transactions really overlap there. `when` is a trigger's timing and
 * event, such as 'before delete'; a row is held from before a `before` pause.
 * `each` is 'row' or 'statement': a statement's pause comes before any of its
 * rows is taken.
 */
async function slowly(when, table, run, { seconds = 0.3, each = 'row' } = {}) {
  await admin.query(`
    create function public._slowly() returns trigger language plpgsql as $$
    begin
      perform pg_sleep(${seconds});
      return case when tg_op = 'DELETE' then old else new end;
    end $$;
    create trigger _slowly ${when} on ${table}
      for each ${each} execute function public._slowly();
  `);
  try {
    return await run();
  } finally {
    await admin.query(`
      drop trigger _slowly on ${table};
      drop function public._slowly();
    `);
  }
}

/** A sign-up whose address was never confirmed, old enough for the tidy-up to delete. */
async function unconfirmedSignUp(name) {
  const id = await createCourier(name, ['Munich', 'DE']);
  await admin.query(
    `update auth.users set email_confirmed_at = null, created_at = now() - interval '8 days'
     where id = $1`,
    [id],
  );
  return id;
}

const accountsLeft = async (ids) =>
  (await admin.query(`select count(*)::int as count from auth.users where id = any($1)`, [ids]))
    .rows[0].count;

const allFulfilled = (outcomes) => {
  for (const outcome of outcomes) {
    assert.equal(outcome.status, 'fulfilled', outcome.reason?.message);
  }
};

describe('concurrency, against a real Postgres', { skip: SKIP }, () => {
  before(async () => {
    databaseName = `night_courier_test_${process.pid}_${Date.now()}`;
    const server = new pg.Client({ connectionString: DATABASE_URL });
    await server.connect();
    await server.query(`create database ${databaseName}`);
    await server.end();

    const url = new URL(DATABASE_URL);
    url.pathname = `/${databaseName}`;
    databaseUrl = url.toString();

    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(AUTH_STUB);
    for (const file of migrationFiles()) {
      await admin.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    }
  });

  after(async () => {
    await Promise.allSettled(opened.map((client) => client.end()));
    await admin?.end();
    if (!databaseName) return;
    const server = new pg.Client({ connectionString: DATABASE_URL });
    await server.connect();
    await server.query(`drop database if exists ${databaseName} with (force)`);
    await server.end();
  });

  beforeEach(async () => {
    // Connections first: a test that failed while holding a transaction open
    // would otherwise keep its locks, and the truncate would wait on them for
    // ever instead of the next test starting.
    await Promise.allSettled(opened.splice(0).map((client) => client.end()));
    await admin.query(`truncate auth.users cascade`);
    // GoTrue's log names its user only inside each entry, so it does not go
    // with the accounts.
    await admin.query(`truncate auth.audit_log_entries`);
  });

  describe('the bat reservation', () => {
    /**
     * Four sends, each in its own transaction, all held open until every one has
     * run - so all four are genuinely in flight at once and none can see the
     * others' committed work. Three bats: three sends must get one each, and the
     * fourth must get none.
     */
    it('Two concurrent sends cannot claim the same bat', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);

      const sessions = await Promise.all([1, 2, 3, 4].map(() => connectAs(anna)));
      await Promise.all(sessions.map((session) => session.query('begin')));

      const outcomes = await Promise.allSettled(
        sessions.map((session, i) =>
          session.query(`select * from public.send_message($1, $2)`, [ben, `letter ${i}`]),
        ),
      );
      await Promise.all(sessions.map((session) => session.query('commit')));

      const sent = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      const refused = outcomes.filter((outcome) => outcome.status === 'rejected');
      assert.equal(sent.length, 3);
      assert.equal(refused.length, 1);
      assert.equal(refused[0].reason.hint, 'no_available_bat');

      const { rows } = await admin.query(
        `select count(*)::int as letters, count(distinct bat_id)::int as bats
         from public.messages where sender_id = $1`,
        [anna],
      );
      assert.deepEqual(rows[0], { letters: 3, bats: 3 });
      assert.equal(await flyingBats(anna), 3);
    });

    /** The same, without the choreography: a burst of independent requests. */
    it('gives a burst of ten sends three bats, one each, and refuses the rest', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);

      const sessions = await Promise.all(Array.from({ length: 10 }, () => connectAs(anna)));
      const outcomes = await Promise.allSettled(
        sessions.map((session, i) =>
          session.query(`select * from public.send_message($1, $2)`, [ben, `letter ${i}`]),
        ),
      );

      assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 3);
      for (const outcome of outcomes.filter((o) => o.status === 'rejected')) {
        assert.equal(outcome.reason.hint, 'no_available_bat', outcome.reason.message);
      }
      const { rows } = await admin.query(
        `select count(*)::int as letters, count(distinct bat_id)::int as bats
         from public.messages where sender_id = $1`,
        [anna],
      );
      assert.deepEqual(rows[0], { letters: 3, bats: 3 });
    });

    /**
     * The retry of a send whose answer was lost can reach the server while the
     * original is still running. Neither can see the other's letter yet; the
     * unique client_ref decides, and the loser gives its bat back.
     */
    it('lets two runs of the same send at once create one letter on one bat', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const ref = '44444444-4444-4444-8444-444444444444';

      const original = await connectAs(anna);
      const retry = await connectAs(anna);
      await original.query('begin');
      const first = await original.query(`select * from public.send_message($1, 'Once.', $2)`, [
        ben,
        ref,
      ]);
      const repeating = retry.query(`select * from public.send_message($1, 'Once.', $2)`, [
        ben,
        ref,
      ]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await original.query('commit');
      const second = await repeating;

      assert.equal(second.rows[0].message_id, first.rows[0].message_id);
      const { rows } = await admin.query(
        `select count(*)::int as letters from public.messages where sender_id = $1`,
        [anna],
      );
      assert.equal(rows[0].letters, 1);
      assert.equal(await flyingBats(anna), 1);
    });

    /**
     * The same, on the courier's last bat. The retry could not see the
     * original's letter and could not have its bat either - locked, and so
     * passed over - and was told every bat was out, while the letter went. It
     * now waits for the original and answers with its letter. (Found in review.)
     */
    it('answers a retry on the last bat with the letter its original sent', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const ref = '88888888-8888-4888-8888-888888888888';
      const original = await connectAs(anna);
      const retry = await connectAs(anna);
      await original.query(`select * from public.send_message($1, 'one')`, [ben]);
      await original.query(`select * from public.send_message($1, 'two')`, [ben]);

      await original.query('begin');
      const first = await original.query(`select * from public.send_message($1, 'Once.', $2)`, [
        ben,
        ref,
      ]);
      const repeating = retry.query(`select * from public.send_message($1, 'Once.', $2)`, [
        ben,
        ref,
      ]);
      assert.equal(await settlesWithin(repeating, 300), false, 'the retry did not wait');
      await original.query('commit');
      const second = await repeating;

      assert.deepEqual(second.rows, first.rows);
      const { rows } = await admin.query(
        `select count(*)::int as letters from public.messages where sender_id = $1`,
        [anna],
      );
      assert.equal(rows[0].letters, 3);
      assert.equal(await flyingBats(anna), 3);
    });

    it('lets the retry send the letter itself when its original came to nothing', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const ref = '99999999-9999-4999-8999-999999999999';
      const original = await connectAs(anna);
      const retry = await connectAs(anna);

      await original.query('begin');
      const first = await original.query(`select * from public.send_message($1, 'Once.', $2)`, [
        ben,
        ref,
      ]);
      const repeating = retry.query(`select * from public.send_message($1, 'Once.', $2)`, [
        ben,
        ref,
      ]);
      assert.equal(await settlesWithin(repeating, 300), false, 'the retry did not wait');
      await original.query('rollback');
      const second = await repeating;

      assert.notEqual(second.rows[0].message_id, first.rows[0].message_id);
      const { rows } = await admin.query(
        `select id from public.messages where sender_id = $1 and client_ref = $2`,
        [anna, ref],
      );
      assert.deepEqual(rows, [{ id: second.rows[0].message_id }]);
      assert.equal(await flyingBats(anna), 1);
    });

    /**
     * What waits is one letter's own repeats. Another letter of the same
     * courier's goes side by side with it, as before, and so does another
     * courier's letter that happens to carry the same reference.
     */
    it('does not make one letter wait for another', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const ref = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const held = await connectAs(anna);
      const annaAgain = await connectAs(anna);
      const benSession = await connectAs(ben);

      await held.query('begin');
      await held.query(`select * from public.send_message($1, 'held open', $2)`, [ben, ref]);
      await annaAgain.query(`set statement_timeout = '5s'`);
      await annaAgain.query(`select * from public.send_message($1, 'another letter', $2)`, [
        ben,
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ]);
      await benSession.query(`set statement_timeout = '5s'`);
      await benSession.query(`select * from public.send_message($1, 'same reference', $2)`, [
        anna,
        ref,
      ]);
      await held.query('commit');

      assert.equal(await flyingBats(anna), 2);
      assert.equal(await flyingBats(ben), 1);
    });

    /**
     * The app asks whether a send went when it got no answer. While that send
     * is still running, "no" is an answer that turns false a moment later, and
     * on it the app would let the same letter go out again under a new
     * reference. The question waits for the send it is about.
     */
    it('makes the question whether a letter went wait for a send still running', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const ref = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const sending = await connectAs(anna);
      const asking = await connectAs(anna);

      await sending.query('begin');
      const sent = await sending.query(`select * from public.send_message($1, 'Once.', $2)`, [
        ben,
        ref,
      ]);
      const answer = asking.query(`select * from public.sent_letter($1)`, [ref]);
      assert.equal(await settlesWithin(answer, 300), false, 'the question did not wait');
      await sending.query('commit');

      assert.deepEqual((await answer).rows, sent.rows);
    });

    it('answers that no letter went when the send it waited for came to nothing', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const ref = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      const sending = await connectAs(anna);
      const asking = await connectAs(anna);

      await sending.query('begin');
      await sending.query(`select * from public.send_message($1, 'Once.', $2)`, [ben, ref]);
      const answer = asking.query(`select * from public.sent_letter($1)`, [ref]);
      assert.equal(await settlesWithin(answer, 300), false, 'the question did not wait');
      await sending.query('rollback');

      assert.deepEqual((await answer).rows, []);
      assert.equal(await flyingBats(anna), 0);
    });

    it('does not let one courier’s sends wait on another’s', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);

      const annaSession = await connectAs(anna);
      const benSession = await connectAs(ben);
      await annaSession.query('begin');
      await annaSession.query(`select * from public.send_message($1, 'held open')`, [ben]);

      // Anna's transaction is still open and holds her bat. Ben's send must not
      // queue behind it.
      await benSession.query(`set statement_timeout = '5s'`);
      await benSession.query(`select * from public.send_message($1, 'straight through')`, [anna]);
      await annaSession.query('commit');

      assert.equal(await flyingBats(anna), 1);
      assert.equal(await flyingBats(ben), 1);
    });
  });

  describe('the delivery worker', () => {
    async function dueLetters(n) {
      const couriers = [];
      for (let i = 0; i < Math.ceil(n / 3); i++) {
        couriers.push(await createCourier(`sender${i}`, ['Berlin', 'DE']));
      }
      const ben = await createCourier('ben', ['Munich', 'DE']);
      for (const courier of couriers) await makeFriends(courier, ben);

      for (let i = 0; i < n; i++) {
        const session = await connectAs(couriers[Math.floor(i / 3)]);
        await session.query(`select * from public.send_message($1, $2)`, [ben, `letter ${i}`]);
      }
      await admin.query(
        `update public.messages
         set sent_at = now() - interval '2 hours', deliver_at = now() - interval '1 minute'`,
      );
      return couriers;
    }

    /**
     * One run is held open after landing everything; a second runs while it is.
     * The second must land nothing, rather than landing the same letters again.
     */
    it('A duplicate worker run does not deliver twice', async () => {
      await dueLetters(6);
      const first = await connect();
      const second = await connect();

      await first.query('begin');
      const firstRun = await first.query(`select private.deliver_due_messages() as landed`);
      const secondRun = await second.query(`select private.deliver_due_messages() as landed`);
      await first.query('commit');
      const thirdRun = await second.query(`select private.deliver_due_messages() as landed`);

      assert.equal(firstRun.rows[0].landed, 6);
      assert.equal(secondRun.rows[0].landed, 0);
      assert.equal(thirdRun.rows[0].landed, 0);
    });

    /**
     * Five workers at once over thirty due letters. If any letter were landed
     * twice, the counts would add up to more than thirty.
     */
    it('divides due letters between overlapping runs, landing each exactly once', async () => {
      const couriers = await dueLetters(30);
      const workers = await Promise.all([1, 2, 3, 4, 5].map(() => connect()));

      const runs = await Promise.all(
        workers.map((worker) => worker.query(`select private.deliver_due_messages() as landed`)),
      );

      const total = runs.reduce((sum, run) => sum + run.rows[0].landed, 0);
      assert.equal(total, 30);
      const { rows } = await admin.query(
        `select count(*)::int as undelivered from public.messages where delivered_at is null`,
      );
      assert.equal(rows[0].undelivered, 0);
      for (const courier of couriers) assert.equal(await flyingBats(courier), 0);
    });
  });

  describe('landing a letter from inside a request', () => {
    async function dueLetterFrom(anna, ben) {
      const session = await connectAs(anna);
      const { rows } = await session.query(
        `select message_id from public.send_message($1, 'due now')`,
        [ben],
      );
      await admin.query(
        `update public.messages
         set sent_at = now() - interval '2 hours', deliver_at = now() - interval '1 minute'
         where id = $1`,
        [rows[0].message_id],
      );
      return rows[0].message_id;
    }

    /**
     * The home screen asks for the roost and the badges at the same instant,
     * and both land whatever is due before answering. The request that finds
     * the letter already being landed must wait and report the bat home - not
     * skip it and report the bat still flying, which is what this did at first
     * and what left the roost stuck on screen.
     */
    it('shows a courier a landing that another of their requests is making', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      await dueLetterFrom(anna, ben);

      const badges = await connectAs(anna);
      const roost = await connectAs(anna);
      await badges.query('begin');
      await badges.query('select * from public.get_badges()');

      const asking = roost.query('select status from public.get_roost() order by slot');
      // Long enough for the roost request to reach the lock and queue on it.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await badges.query('commit');
      const { rows } = await asking;

      assert.deepEqual(
        rows.map((row) => row.status),
        ['available', 'available', 'available'],
      );
    });

    /**
     * A letter is stamped opened by the clock of the request that reads it,
     * and landed by the clock of whatever landed it. A request that began
     * before the landing and reads the letter after it stamped the letter
     * opened before it had arrived, which the table refuses: the read failed.
     * The letter is now opened no earlier than it landed. (Found in review.)
     */
    it('opens a letter that landed after the request reading it began', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const letter = await dueLetterFrom(anna, ben);
      const reading = await connectAs(ben);

      // The request's clock starts here, and stands still until it ends.
      await reading.query('begin');
      await reading.query('select now()');
      await new Promise((resolve) => setTimeout(resolve, 50));
      await admin.query(`select private.deliver_due_messages()`);
      const { rows } = await reading.query(`select body from public.read_message($1)`, [letter]);
      await reading.query('commit');

      assert.deepEqual(rows, [{ body: 'due now' }]);
      const { rows: stamps } = await admin.query(
        `select opened_at = delivered_at as opened_as_it_landed from public.messages where id = $1`,
        [letter],
      );
      assert.deepEqual(stamps, [{ opened_as_it_landed: true }]);
    });

    /** Sender and recipient landing the same letters at once: no deadlock, no double landing. */
    it('lets both ends of the same letters land them at once', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      for (let i = 0; i < 3; i++) await dueLetterFrom(anna, ben);
      for (let i = 0; i < 3; i++) await dueLetterFrom(ben, anna);

      const sessions = [
        await connectAs(anna),
        await connectAs(ben),
        await connectAs(anna),
        await connectAs(ben),
      ];
      await Promise.all([
        sessions[0].query('select * from public.get_roost()'),
        sessions[1].query('select * from public.list_inbox()'),
        sessions[2].query('select * from public.list_inbox()'),
        sessions[3].query('select * from public.get_badges()'),
      ]);

      const { rows } = await admin.query(
        `select count(*) filter (where delivered_at is null)::int as in_flight,
                count(*)::int as letters
         from public.messages`,
      );
      assert.deepEqual(rows[0], { in_flight: 0, letters: 6 });
      assert.equal(await flyingBats(anna), 0);
      assert.equal(await flyingBats(ben), 0);
    });
  });

  describe('account deletion', () => {
    /**
     * Holds every landing for a moment between taking a letter's lock and
     * bringing its bat home, so a deletion arriving in that window really
     * overlaps it. Without the pause the race exists but is rarely hit.
     */
    async function slowLandings(run) {
      await admin.query(`
        create function public._slow_landing() returns trigger language plpgsql as $$
        begin
          if old.delivered_at is null and new.delivered_at is not null then
            perform pg_sleep(1);
          end if;
          return new;
        end $$;
        create trigger _slow_landing before update on public.messages
          for each row execute function public._slow_landing();
      `);
      try {
        return await run();
      } finally {
        await admin.query(`
          drop trigger _slow_landing on public.messages;
          drop function public._slow_landing();
        `);
      }
    }

    /**
     * Deletion used to reach a courier's bats before their letters, while a
     * landing takes letters before bats: opposite lock orders, and a deadlock
     * when a letter landed as its sender deleted their account. Found in review.
     */
    it('waits for a landing in progress instead of deadlocking with it', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const annaSession = await connectAs(anna);
      const { rows } = await annaSession.query(
        `select message_id from public.send_message($1, 'due now')`,
        [ben],
      );
      await admin.query(
        `update public.messages
         set sent_at = now() - interval '2 hours', deliver_at = now() - interval '1 minute'
         where id = $1`,
        [rows[0].message_id],
      );

      const outcomes = await slowLandings(async () => {
        const benReading = await connectAs(ben);
        const annaLeaving = await connectAs(anna);
        const landing = benReading.query('select * from public.list_inbox()');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const deleting = annaLeaving.query('select public.delete_own_account()');
        return Promise.allSettled([landing, deleting]);
      });

      for (const outcome of outcomes) {
        assert.equal(outcome.status, 'fulfilled', outcome.reason?.message);
      }
      const { rows: left } = await admin.query(
        `select count(*)::int as count from auth.users where id = $1`,
        [anna],
      );
      assert.equal(left[0].count, 0);
    });

    /**
     * Reading a letter landed whatever had come due for the reader first, and
     * took the letter being read second: a newer letter, then an older one.
     * Everything else takes letters oldest first - their sender deleting the
     * account among them, who then held the older letter and wanted the newer
     * while the reader held the newer and wanted the older. (Found while going
     * through the lock order after review.)
     */
    it('waits for someone reading one of its letters instead of deadlocking with them', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const annaSession = await connectAs(anna);
      const dueLetter = async (body) => {
        const { rows } = await annaSession.query(
          `select message_id from public.send_message($1, $2)`,
          [ben, body],
        );
        await admin.query(
          `update public.messages
           set sent_at = now() - interval '2 hours', deliver_at = now() - interval '1 minute'
           where id = $1`,
          [rows[0].message_id],
        );
        return rows[0].message_id;
      };
      const older = await dueLetter('older');
      await admin.query(`select private.deliver_due_messages()`);
      // Due as Ben opens the older one, and landed by that very request.
      await dueLetter('newer');

      const outcomes = await slowLandings(async () => {
        const benReading = await connectAs(ben);
        const reading = benReading.query('select body from public.read_message($1)', [older]);
        await pause(300);
        const deleting = annaSession.query('select public.delete_own_account()');
        return Promise.allSettled([reading, deleting]);
      });

      allFulfilled(outcomes);
      assert.deepEqual(outcomes[0].value.rows, [{ body: 'older' }]);
      assert.equal(await accountsLeft([anna]), 0);
    });

    /**
     * The same rule from the other side: reading takes everything it will
     * touch oldest first, whichever of its letters that is. Here the letter
     * being read is the newer one, and an older one is still to be landed -
     * the worker has been away. A connection in the way makes the read wait
     * for the newer letter; if it had passed over the older one to get there,
     * the reader's own deletion, coming from the older letter, would meet it
     * the wrong way round.
     */
    it('lets a letter be read while its reader’s account is deleted from another phone', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      const cara = await createCourier('cara', ['Hamburg', 'DE']);
      await makeFriends(anna, ben);
      await makeFriends(cara, ben);
      const letterTo = async (from, hoursSinceLanding) => {
        const { rows } = await (
          await connectAs(from)
        ).query(`select message_id from public.send_message($1, 'for Ben')`, [ben]);
        await admin.query(
          `update public.messages
           set sent_at = now() - interval '9 hours', deliver_at = now() - make_interval(hours => $2)
           where id = $1`,
          [rows[0].message_id, hoursSinceLanding],
        );
        return rows[0].message_id;
      };
      const newer = await letterTo(anna, 1);
      await admin.query(`select private.deliver_due_messages()`);
      const olderAndNotLanded = await letterTo(cara, 3);
      const inTheWay = await connect();
      const benReading = await connectAs(ben);
      const benLeaving = await connectAs(ben);

      await inTheWay.query('begin');
      await inTheWay.query(`select 1 from public.messages where id = $1 for update`, [newer]);
      const reading = benReading.query('select body from public.read_message($1)', [newer]);
      assert.equal(await settlesWithin(reading, 300), false, 'the read did not wait');
      const deleting = benLeaving.query('select public.delete_own_account()');
      assert.equal(await settlesWithin(deleting, 300), false, 'the deletion did not wait');
      await inTheWay.query('commit');

      allFulfilled(await Promise.allSettled([reading, deleting]));
      assert.equal(await accountsLeft([ben]), 0);
      const { rows } = await admin.query(`select count(*)::int as count from public.messages`);
      assert.equal(rows[0].count, 0, `${olderAndNotLanded} went with Ben's account`);
    });

    /**
     * A courier deleting their account while one of their own sends is still
     * running: the send holds a bat and then needs the profile for its letter's
     * foreign key, while the deletion's cascade held the profile and wanted the
     * bat. Deletion now takes the bats before the profile. (From review.)
     */
    it('waits for its own courier’s send in progress instead of deadlocking with it', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      await admin.query(`
        create function public._slow_insert() returns trigger language plpgsql as $$
        begin perform pg_sleep(1); return new; end $$;
        create trigger _slow_insert before insert on public.messages
          for each row execute function public._slow_insert();
      `);

      let outcomes;
      try {
        const sending = (await connectAs(anna)).query(
          `select * from public.send_message($1, 'one last letter')`,
          [ben],
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
        const deleting = (await connectAs(anna)).query('select public.delete_own_account()');
        outcomes = await Promise.allSettled([sending, deleting]);
      } finally {
        await admin.query(`
          drop trigger _slow_insert on public.messages;
          drop function public._slow_insert();
        `);
      }

      for (const outcome of outcomes) {
        assert.equal(outcome.status, 'fulfilled', outcome.reason?.message);
      }
      const { rows } = await admin.query(
        `select (select count(*)::int from auth.users where id = $1) as accounts,
                (select count(*)::int from public.messages) as letters`,
        [anna],
      );
      assert.deepEqual(rows[0], { accounts: 0, letters: 0 });
    });

    it('lets two friends with letters to each other delete their accounts at once', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const annaSession = await connectAs(anna);
      const benSession = await connectAs(ben);
      await annaSession.query(`select * from public.send_message($1, 'to ben')`, [ben]);
      await benSession.query(`select * from public.send_message($1, 'to anna')`, [anna]);

      const outcomes = await Promise.allSettled([
        annaSession.query('select public.delete_own_account()'),
        benSession.query('select public.delete_own_account()'),
      ]);

      for (const outcome of outcomes) {
        assert.equal(outcome.status, 'fulfilled', outcome.reason?.message);
      }
      const { rows } = await admin.query(`select count(*)::int as count from public.messages`);
      assert.equal(rows[0].count, 0);
    });

    /**
     * The operator deletes an account on request with private.delete_account,
     * which takes the account's rows in the order a landing does. The
     * dashboard's "Delete user" does not, and deadlocked here. (From review.)
     */
    it('lets the operator delete an account while one of its letters is landing', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const annaSession = await connectAs(anna);
      const { rows } = await annaSession.query(
        `select message_id from public.send_message($1, 'due now')`,
        [ben],
      );
      await admin.query(
        `update public.messages
         set sent_at = now() - interval '2 hours', deliver_at = now() - interval '1 minute'
         where id = $1`,
        [rows[0].message_id],
      );

      const outcomes = await slowLandings(async () => {
        const benReading = await connectAs(ben);
        const operator = await connect();
        const landing = benReading.query('select * from public.list_inbox()');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const deleting = operator.query('select private.delete_account($1)', [anna]);
        return Promise.allSettled([landing, deleting]);
      });

      for (const outcome of outcomes) {
        assert.equal(outcome.status, 'fulfilled', outcome.reason?.message);
      }
      const { rows: left } = await admin.query(
        `select count(*)::int as count from auth.users where id = $1`,
        [anna],
      );
      assert.equal(left[0].count, 0);
    });

    /**
     * What keeps all of the above from deadlocking is one habit: whatever ends
     * an account first takes every row it will reach, in one order. This looks
     * at what is then held, from a second connection: every row of each table,
     * and not yet the account itself, which is taken last.
     */
    it('takes every row the end of an account will reach, friendships included, and the sign-in last', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      const cara = await createCourier('cara', ['Hamburg', 'DE']);
      await makeFriends(anna, ben);
      const annaSession = await connectAs(anna);
      const caraSession = await connectAs(cara);
      await annaSession.query(`select * from public.send_message($1, 'to ben')`, [ben]);
      await caraSession.query(`select public.request_friend('anna')`);
      await caraSession.query(`select public.report_courier($1, 'spam')`, [anna]);
      await annaSession.query(`select public.block_courier($1)`, [cara]);
      await caraSession.query(`select public.request_friend('ben')`);
      const holder = await connect();
      const probe = await connect();

      /** How many of the rows `where` names are free for somebody else to take. */
      const free = async (table, where) =>
        (
          await probe.query(
            `select count(*)::int as count
             from (select 1 from ${table} where ${where} for update skip locked) as taken`,
            [anna],
          )
        ).rows[0].count;
      const annasRows = async () => ({
        letters: await free('public.messages', '$1 in (sender_id, recipient_id)'),
        bats: await free('public.bats', 'owner_id = $1'),
        friendships: await free('public.friendships', '$1 in (requester_id, addressee_id)'),
        blocks: await free('public.blocks', '$1 in (blocker_id, blocked_id)'),
        reports: await free('public.reports', '$1 in (reporter_id, reported_id)'),
      });
      assert.deepEqual(await annasRows(), {
        letters: 1,
        bats: 3,
        friendships: 1,
        blocks: 1,
        reports: 1,
      });

      await holder.query('begin');
      await holder.query('select private.lock_courier_rows($1)', [anna]);
      const stillFree = await annasRows();
      const notYetTaken = {
        profile: await free('public.profiles', 'id = $1'),
        signIn: await free('auth.users', 'id = $1'),
        // Cara's request to Ben is no part of Anna's account.
        othersFriendships: await free(
          'public.friendships',
          '$1 not in (requester_id, addressee_id)',
        ),
      };
      await holder.query('rollback');

      assert.deepEqual(stillFree, { letters: 0, bats: 0, friendships: 0, blocks: 0, reports: 0 });
      assert.deepEqual(notYetTaken, { profile: 1, signIn: 1, othersFriendships: 1 });
    });

    /**
     * Three couriers, each a friend of the other two, all leaving at once.
     * Each deletion's cascade came to its two friendships one after the other,
     * and held the first while it waited for the second - which the next
     * courier's deletion was holding, waiting in turn. Friendships are now
     * taken up front with everything else, in one order.
     */
    it('lets three couriers who are all friends delete their accounts at once', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      const cara = await createCourier('cara', ['Hamburg', 'DE']);
      // Round the ring: each asked the next.
      await makeFriends(anna, ben);
      await makeFriends(ben, cara);
      await makeFriends(cara, anna);
      const sessions = await Promise.all([anna, ben, cara].map((who) => connectAs(who)));

      const outcomes = await slowly('before delete', 'public.friendships', () =>
        Promise.allSettled(
          sessions.map((session) => session.query('select public.delete_own_account()')),
        ),
      );

      allFulfilled(outcomes);
      assert.equal(await accountsLeft([anna, ben, cara]), 0);
    });
  });

  describe('an account the operator stops', () => {
    const banned = async (id) =>
      (
        await admin.query(`select banned_until > now() as banned from auth.users where id = $1`, [
          id,
        ])
      ).rows;

    /**
     * The operator suspends an account while its owner's deletion is already
     * running. The deletion checked for a suspension when it began and found
     * none; the delete itself has to look again, or the ban is deleted with
     * the account in the moment it is made.
     */
    it('honours a suspension that commits while the account is deleting itself', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const operator = await connect();
      const annaLeaving = await connectAs(anna);

      await operator.query('begin');
      await operator.query(
        `update auth.users set banned_until = now() + private.ban_period() where id = $1`,
        [anna],
      );
      const deleting = annaLeaving.query('select public.delete_own_account()');
      assert.equal(await settlesWithin(deleting, 300), false, 'the deletion did not wait');
      await operator.query('commit');

      await assert.rejects(deleting, (error) => error.hint === 'account_suspended');
      assert.deepEqual(await banned(anna), [{ banned: true }]);
    });

    it('refuses a deletion that waited for the removal, and leaves the banned sign-in', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const operator = await connect();
      const annaLeaving = await connectAs(anna);

      await operator.query('begin');
      await operator.query('select private.remove_account($1)', [anna]);
      const deleting = annaLeaving.query('select public.delete_own_account()');
      assert.equal(await settlesWithin(deleting, 300), false, 'the deletion did not wait');
      await operator.query('commit');

      await assert.rejects(deleting, (error) => error.hint === 'account_suspended');
      assert.deepEqual(await banned(anna), [{ banned: true }]);
    });

    /**
     * A removal waits for the account's rows, and what it is waiting for may be
     * the courier deleting the account. It used to return as if it had banned
     * something.
     */
    it('tells the operator when the account was deleted while the removal waited', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const annaLeaving = await connectAs(anna);
      const operator = await connect();

      await annaLeaving.query('begin');
      await annaLeaving.query('select public.delete_own_account()');
      const removing = operator.query('select private.remove_account($1)', [anna]);
      assert.equal(await settlesWithin(removing, 300), false, 'the removal did not wait');
      await annaLeaving.query('commit');

      await assert.rejects(removing, /there is no account/);
      assert.deepEqual(await banned(anna), []);
    });

    /**
     * Whatever holds one of the account's rows may be the courier's own
     * deletion, on its way to the sign-in. A removal that held the sign-in
     * while it waited for that row would have each waiting for the other.
     */
    it('takes the sign-in last when it removes an account, as a deletion does', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const holder = await connect();
      const operator = await connect();
      const probe = await connect();

      await holder.query('begin');
      await holder.query(`select 1 from public.bats where owner_id = $1 for update`, [anna]);
      const removing = operator.query('select private.remove_account($1)', [anna]);
      assert.equal(await settlesWithin(removing, 300), false, 'the removal did not wait');

      // Fails at once, rather than waiting, if the removal already holds it.
      await probe.query(`select 1 from auth.users where id = $1 for update nowait`, [anna]);

      await holder.query('commit');
      await removing;
      assert.deepEqual(await banned(anna), [{ banned: true }]);
    });

    /** Started together, with nothing arranged: one of the two honest endings, never a third. */
    it('ends a removal and a deletion at the same moment in a ban or in a refusal to the operator', async () => {
      for (let round = 0; round < 20; round++) {
        const anna = await createCourier(`anna${round}`, ['Berlin', 'DE']);
        const annaLeaving = await connectAs(anna);
        const operator = await connect();

        const [deleting, removing] = await Promise.allSettled([
          annaLeaving.query('select public.delete_own_account()'),
          operator.query('select private.remove_account($1)', [anna]),
        ]);

        const left = await banned(anna);
        if (removing.status === 'fulfilled') {
          assert.deepEqual(left, [{ banned: true }], `round ${round}: removed, but not banned`);
          assert.equal(deleting.reason?.hint, 'account_suspended', `round ${round}`);
        } else {
          assert.match(removing.reason.message, /there is no account/, `round ${round}`);
          assert.equal(deleting.status, 'fulfilled', deleting.reason?.message);
          assert.deepEqual(left, []);
        }
        await Promise.all([annaLeaving.end(), operator.end()]);
      }
    });
  });

  describe('the daily tidy-up', () => {
    const tidyUp = (session) => session.query('select private.tidy_up() as skipped');

    /** One of everything the tidy-up has a step for. */
    async function everythingToTidy() {
      const unconfirmed = await unconfirmedSignUp('unconfirmed');
      const removed = await createCourier('removed', ['Munich', 'DE']);
      const xavier = await createCourier('xavier', ['Berlin', 'DE']);
      await admin.query(`update auth.users set raw_user_meta_data = '{}' where id = any($1)`, [
        [unconfirmed, removed],
      ]);
      // A removed account whose ban has run out: a sign-in without a profile.
      await admin.query(
        `update auth.users set banned_until = now() - interval '1 day' where id = $1`,
        [removed],
      );
      await admin.query(`delete from public.profiles where id = $1`, [removed]);
      await admin.query(
        `insert into auth.audit_log_entries (payload, created_at)
         values ($1::json, now() - interval '31 days')`,
        [JSON.stringify({ actor_id: xavier, action: 'login' })],
      );
      await admin.query(
        `insert into auth.sessions (user_id, created_at, updated_at)
         values ($1, now() - interval '200 days', now() - interval '91 days')`,
        [xavier],
      );
      await admin.query(
        `insert into auth.identities (user_id, identity_data)
         values ($1, '{"username": "xavier", "display_name": "xavier"}')`,
        [xavier],
      );
      // A move that settled an hour ago.
      await admin.query(
        `update public.profiles
         set city_id = (select id from public.cities where name = 'Hamburg' and country_code = 'DE')
         where id = $1`,
        [xavier],
      );
      await admin.query(
        `update public.profiles set city_changed_at = now() - interval '25 hours' where id = $1`,
        [xavier],
      );
      return { unconfirmed, removed, xavier };
    }

    const inProfiles = `select 1 from public.profiles where id = $1 for update`;
    const inSignIns = `select 1 from auth.users where id = $1 for update`;
    const inSessions = `select 1 from auth.sessions where user_id = $1 for update`;
    const inIdentities = `select 1 from auth.identities where user_id = $1 for update`;
    const inSignInLog = `select 1 from auth.audit_log_entries for update`;

    /**
     * It deletes sign-ups whose address was never confirmed, and used to go
     * straight into the cascade, which reaches a request before a report. A
     * courier who had asked such a sign-up to be friends and reported it, and
     * was deleting their own account, held the report and wanted the request.
     * (Found in review: 30 rounds in 150 ended with one of the two stopped.)
     */
    it('waits for a courier deleting their account, and is waited for, instead of deadlocking', async () => {
      const xavier = await createCourier('xavier', ['Berlin', 'DE']);
      const unconfirmed = await unconfirmedSignUp('unconfirmed');
      const xavierSession = await connectAs(xavier);
      await xavierSession.query(`select public.request_friend('unconfirmed')`);
      await xavierSession.query(`select public.report_courier($1, 'spam')`, [unconfirmed]);
      const tidier = await connect();

      const outcomes = await slowly(
        'before delete',
        'public.friendships',
        async () => {
          const tidying = tidyUp(tidier);
          await pause(150);
          const deleting = xavierSession.query('select public.delete_own_account()');
          return Promise.allSettled([tidying, deleting]);
        },
        { seconds: 0.5 },
      );

      allFulfilled(outcomes);
      assert.equal(await accountsLeft([xavier, unconfirmed]), 0);
      const { rows } = await admin.query(
        `select reporter_id, reported_id, reported_username from public.reports`,
      );
      assert.deepEqual(rows, [
        { reporter_id: null, reported_id: null, reported_username: 'unconfirmed' },
      ]);
    });

    /**
     * The other way round: the courier's deletion has taken its rows and is
     * about to take its sign-in when the tidy-up starts. The tidy-up used to
     * do its other work first and keep hold of it - this courier's sign-in
     * (they joined today, and their sign-up names are still to be removed),
     * their sign-in record from a month ago, a session they have not used for
     * three months - and then ask for a row the deletion held, while the
     * deletion asked for one of those. It now deletes first, holding nothing.
     */
    it('holds nothing of anyone else’s when it comes to delete', async () => {
      const xavier = await createCourier('xavier', ['Berlin', 'DE']);
      const unconfirmed = await unconfirmedSignUp('unconfirmed');
      const xavierSession = await connectAs(xavier);
      await xavierSession.query(`select public.block_courier($1)`, [unconfirmed]);
      await admin.query(
        `insert into auth.audit_log_entries (payload, created_at)
         values ($1::json, now() - interval '31 days')`,
        [JSON.stringify({ actor_id: xavier, action: 'login' })],
      );
      await admin.query(
        `insert into auth.sessions (user_id, created_at, updated_at)
         values ($1, now() - interval '200 days', now() - interval '91 days')`,
        [xavier],
      );
      const tidier = await connect();

      // The deletion pauses with its rows taken and its sign-in still to come.
      const outcomes = await slowly(
        'before delete',
        'auth.users',
        async () => {
          const deleting = xavierSession.query('select public.delete_own_account()');
          await pause(150);
          const tidying = tidyUp(tidier);
          return Promise.allSettled([deleting, tidying]);
        },
        { seconds: 0.5, each: 'statement' },
      );

      allFulfilled(outcomes);
      assert.equal(await accountsLeft([xavier, unconfirmed]), 0);
    });

    /**
     * Two such sign-ups in one night, and two couriers who each reported one
     * and blocked the other. A deletion takes blocks before reports. Deleted
     * one after the other, the first sign-up's reports would be held while the
     * second one's blocks were still to come - whichever of the two came
     * first, one of these couriers would be holding exactly the wrong pair.
     */
    it('takes the rows of every sign-up it deletes together, table by table', async () => {
      const first = await unconfirmedSignUp('first');
      const second = await unconfirmedSignUp('second');
      const xavier = await createCourier('xavier', ['Berlin', 'DE']);
      const yara = await createCourier('yara', ['Berlin', 'DE']);
      const xavierSession = await connectAs(xavier);
      const yaraSession = await connectAs(yara);
      await xavierSession.query(`select public.report_courier($1, 'spam')`, [first]);
      await xavierSession.query(`select public.block_courier($1)`, [second]);
      await yaraSession.query(`select public.report_courier($1, 'spam')`, [second]);
      await yaraSession.query(`select public.block_courier($1)`, [first]);
      const tidier = await connect();

      // The tidy-up pauses on the first of the two reports it reaches,
      // whichever that is, holding it.
      const outcomes = await slowly(
        'before update',
        'public.reports',
        async () => {
          const tidying = tidyUp(tidier);
          await pause(150);
          return Promise.allSettled([
            tidying,
            xavierSession.query('select public.delete_own_account()'),
            yaraSession.query('select public.delete_own_account()'),
          ]);
        },
        { seconds: 0.5 },
      );

      allFulfilled(outcomes);
      assert.equal(await accountsLeft([first, second, xavier, yara]), 0);
    });

    /**
     * The tidy-up chooses the sign-ups to delete, and then waits for their
     * rows. Someone who confirms their address in that wait has an account
     * like anyone else's by the time the delete comes, and keeps it: the
     * delete asks once more of each sign-up whether it is still unconfirmed.
     */
    it('keeps a sign-up whose address is confirmed while it waits for its rows', async () => {
      const late = await unconfirmedSignUp('late');
      const holder = await connect();
      const tidier = await connect();
      const gotrue = await connect();
      await gotrue.query('set role supabase_auth_admin');
      const tidierPid = (await tidier.query('select pg_backend_pid() as pid')).rows[0].pid;

      await holder.query('begin');
      await holder.query(`select 1 from public.bats where owner_id = $1 limit 1 for update`, [
        late,
      ]);
      const tidying = tidyUp(tidier);
      await until(`select 1 from pg_stat_activity where pid = $1 and wait_event_type = 'Lock'`, [
        tidierPid,
      ]);
      await gotrue.query(`update auth.users set email_confirmed_at = now() where id = $1`, [late]);
      await holder.query('commit');
      const { rows } = await tidying;

      assert.deepEqual(
        rows[0].skipped.filter((step) => !step.startsWith('pg_cron run log: ')),
        [],
      );
      const { rows: left } = await admin.query(
        `select (select count(*)::int from auth.users where id = $1) as "sign-in",
                (select count(*)::int from public.profiles where id = $1) as profile,
                (select count(*)::int from public.bats where owner_id = $1) as bats`,
        [late],
      );
      assert.deepEqual(left, [{ 'sign-in': 1, profile: 1, bats: 3 }]);
    });

    /**
     * If Postgres does stop the tidy-up, only the step it was in is undone. The
     * whole night's run used to go with it - old sign-in records, idle
     * sessions, sign-up names all stayed another day - and nothing said so.
     *
     * Each step is stopped here in turn, on purpose: a connection holds a row
     * that step needs, and then asks for a row the tidy-up has held since its
     * first step. The tidy-up is the one that notices, so it is the one
     * Postgres stops. Everything there is to tidy is in place every time, and
     * afterwards all of it must be done except the one step.
     */
    for (const [step, event, table, held] of [
      ['unconfirmed sign-ups', 'delete', 'auth.users', (c) => [inProfiles, c.unconfirmed]],
      ['expired bans', 'delete', 'auth.users', (c) => [inSignIns, c.removed]],
      ['sign-in log', 'delete', 'auth.audit_log_entries', () => [inSignInLog, null]],
      ['idle sessions', 'delete', 'auth.sessions', (c) => [inSessions, c.xavier]],
      ['sign-up names', 'update', 'auth.users', (c) => [inSignIns, c.xavier]],
      ['sign-up names in identities', 'update', 'auth.identities', (c) => [inIdentities, c.xavier]],
      ['settled moves', 'update', 'public.profiles', (c) => [inProfiles, c.xavier]],
    ]) {
      it(`undoes only the step that was stopped: ${step}`, async () => {
        const couriers = await everythingToTidy();
        const untidied = async () => {
          const { rows } = await admin.query(
            `select
               (select count(*)::int from auth.users where id = $1) as "unconfirmed sign-ups",
               (select count(*)::int from auth.users where id = $2) as "expired bans",
               (select count(*)::int from auth.audit_log_entries
                where created_at < now() - interval '30 days') as "sign-in log",
               (select count(*)::int from auth.sessions) as "idle sessions",
               (select count(*)::int from auth.users
                where id = $3 and raw_user_meta_data ? 'username') as "sign-up names",
               (select count(*)::int from auth.identities
                where identity_data ? 'username') as "sign-up names in identities",
               (select count(*)::int from public.profiles
                where settled_city_id is not null) as "settled moves"`,
            [couriers.unconfirmed, couriers.removed, couriers.xavier],
          );
          return rows[0];
        };
        const everything = await untidied();
        assert.ok(
          Object.values(everything).every((waiting) => waiting === 1),
          JSON.stringify(everything),
        );
        const inTheWay = await connect();
        const tidier = await connect();
        // Whichever of two that wait for each other looks first is stopped.
        await inTheWay.query(`set deadlock_timeout = '60s'`);
        await tidier.query(`set deadlock_timeout = '100ms'`);
        const tidierPid = (await tidier.query('select pg_backend_pid() as pid')).rows[0].pid;
        // The nightly job shows what a run returns to nobody; the log has it too.
        const warnings = [];
        tidier.on('notice', (notice) => warnings.push(notice.message));

        const [sql, id] = held(couriers);
        await inTheWay.query('begin');
        await inTheWay.query(sql, id ? [id] : []);
        const skipped = await slowly(
          `before ${event}`,
          table,
          async () => {
            const tidying = tidyUp(tidier);
            // By its first pause the tidy-up holds the unconfirmed sign-up's bats.
            await until(
              `select 1 from pg_stat_activity where pid = $1 and wait_event = 'PgSleep'`,
              [tidierPid],
            );
            const asking = inTheWay.query(
              `select 1 from public.bats where owner_id = $1 for update`,
              [couriers.unconfirmed],
            );
            // Whatever happens, let go before the pause is taken away again:
            // that waits for every open transaction that touched the table.
            try {
              const { rows } = await tidying;
              await asking;
              return rows[0].skipped;
            } finally {
              await inTheWay.query('rollback');
            }
          },
          { seconds: 0.4, each: 'statement' },
        );

        assert.deepEqual(
          skipped.filter((entry) => !entry.startsWith('pg_cron run log: ')),
          [`${step}: deadlock detected`],
        );
        assert.deepEqual(warnings, [`the tidy-up left out: ${skipped.join('; ')}`]);
        const expected = Object.fromEntries(
          Object.keys(everything).map((name) => [name, name === step ? 1 : 0]),
        );
        assert.deepEqual(await untidied(), expected);
      });
    }
  });

  /**
   * Not races either. A trigger and a check run with the rights of whoever
   * writes the row: GoTrue's own role for a sign-in, the API's role for a
   * courier changing their profile. Neither can use the private schema. A
   * guard that reached into it without saying whose rights to use would turn
   * every sign-up, or every change of name, into "permission denied" - on the
   * platform, and not for a superuser. So these write as those two roles.
   */
  describe('written by the roles the platform uses', () => {
    /** A connection that writes sign-ins the way GoTrue does. */
    async function connectAsAuthServer() {
      const client = await connect();
      await client.query('set role supabase_auth_admin');
      return client;
    }

    const signUp = (session, name, details = {}) =>
      session.query(
        `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
        [
          `${name}@example.test`,
          JSON.stringify({ username: name, display_name: name, ...details }),
        ],
      );

    it('signs a courier up, with their profile and their bats', async () => {
      const gotrue = await connectAsAuthServer();

      const { rows } = await signUp(gotrue, 'anna');

      const { rows: made } = await admin.query(
        `select (select display_name from public.profiles where id = $1) as name,
                (select count(*)::int from public.bats where owner_id = $1) as bats`,
        [rows[0].id],
      );
      assert.deepEqual(made, [{ name: 'anna', bats: 3 }]);
      // And the role really is as shut out as GoTrue's is on the platform.
      await assert.rejects(
        gotrue.query(`select private.sign_up_details_max_bytes()`),
        /permission denied for schema private/,
      );
    });

    it('refuses a sign-up that carries too much, and a change that adds too much', async () => {
      const gotrue = await connectAsAuthServer();
      const tooMuch = (error) =>
        error.code === '22001' && /details kept with a sign-in can be at most/.test(error.message);

      await assert.rejects(signUp(gotrue, 'big', { junk: 'x'.repeat(100_000) }), tooMuch);
      const { rows } = await signUp(gotrue, 'anna');
      await assert.rejects(
        gotrue.query(
          `update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id = $1`,
          [rows[0].id, JSON.stringify({ junk: 'x'.repeat(100_000) })],
        ),
        tooMuch,
      );
      await gotrue.query(
        `update auth.users set raw_user_meta_data = raw_user_meta_data || '{"locale": "de"}'
         where id = $1`,
        [rows[0].id],
      );

      const { rows: kept } = await admin.query(
        `select email, octet_length(raw_user_meta_data::text) < 200 as small from auth.users`,
      );
      assert.deepEqual(kept, [{ email: 'anna@example.test', small: true }]);
    });

    it('holds a display name to its rules at sign-up and when its owner changes it', async () => {
      const gotrue = await connectAsAuthServer();
      const refusedBy = (rule) => (error) =>
        error.code === '23514' && error.constraint === `profiles_display_name_${rule}`;

      await assert.rejects(
        signUp(gotrue, 'reversed', { display_name: 'ab\u202Edetpecca' }),
        refusedBy('no_controls'),
      );
      const { rows } = await signUp(gotrue, 'anna');
      const anna = await connectAs(rows[0].id);
      const rename = (name) =>
        anna.query(`update public.profiles set display_name = $1 where id = $2`, [
          name,
          rows[0].id,
        ]);

      await assert.rejects(rename('\u200B'), refusedBy('visible'));
      await assert.rejects(rename('An\nna'), refusedBy('no_controls'));
      await rename('\u{1F469}\u200D\u{1F467}');

      const { rows: names } = await admin.query(`select display_name from public.profiles`);
      assert.deepEqual(names, [{ display_name: '\u{1F469}\u200D\u{1F467}' }]);
    });
  });

  describe('the city search', () => {
    /**
     * Not a race, but only a real Postgres shows it. search_cities folded its
     * query again for every city, so a long query cost seconds: 100,000
     * characters ran into the API's eight-second timeout, and megabytes still
     * would if the fold merely ran once. PGlite is Postgres 18, which plans
     * the function differently and never showed any of it. (Found in review.)
     */
    it('answers megabytes of query at once instead of running into the timeout', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const session = await connectAs(anna);
      await session.query(`set statement_timeout = '2s'`);

      const { rows } = await session.query(`select * from public.search_cities($1, 20)`, [
        'ber' + 'x'.repeat(16 * 1024 * 1024),
      ]);

      assert.deepEqual(rows, []);
      const found = await session.query(`select name from public.search_cities('berlin', 1)`);
      assert.deepEqual(found.rows, [{ name: 'Berlin' }]);
    });
  });

  describe('friend requests', () => {
    /**
     * Two people asking each other at the same moment must end up as one
     * friendship, not as two crossed requests.
     */
    it('turns two simultaneous requests between the same pair into one friendship', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      const annaSession = await connectAs(anna);
      const benSession = await connectAs(ben);

      const outcomes = await Promise.all([
        annaSession.query(`select public.request_friend('ben') as outcome`),
        benSession.query(`select public.request_friend('anna') as outcome`),
      ]);

      assert.deepEqual(outcomes.map((o) => o.rows[0].outcome).sort(), ['accepted', 'requested']);
      const { rows } = await admin.query(`select status from public.friendships`);
      assert.deepEqual(rows, [{ status: 'accepted' }]);
    });

    /**
     * Counted side by side, thirty requests sent at once would each find fewer
     * than twenty made, and all thirty would go out.
     */
    it('holds a courier to twenty new requests an hour however many arrive at once', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const others = [];
      for (let i = 0; i < 30; i++) others.push(await createCourier(`other${i}`, ['Munich', 'DE']));
      const sessions = await Promise.all(others.map(() => connectAs(anna)));

      const outcomes = await Promise.allSettled(
        sessions.map((session, i) =>
          session.query(`select public.request_friend($1) as outcome`, [`other${i}`]),
        ),
      );

      const tally = outcomes.reduce((t, o) => {
        const what = o.status === 'fulfilled' ? o.value.rows[0].outcome : o.reason.hint;
        return { ...t, [what]: (t[what] ?? 0) + 1 };
      }, {});
      assert.deepEqual(tally, { requested: 20, too_many_friend_requests: 10 });
      const { rows } = await admin.query(
        `select (select count(*)::int from public.friendships) as requests,
                (select requests from private.friend_request_counts where courier_id = $1) as counted`,
        [anna],
      );
      assert.deepEqual(rows[0], { requests: 20, counted: 20 });
    });

    /**
     * The daily tidy-up removes counts that are a day old, and holds whatever
     * it touches until it ends. A count a request is adding to just then is
     * not old any more: the job passes over it instead of waiting for it.
     */
    it('does not make the tidy-up wait for a count that a request is using', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      await createCourier('ben', ['Munich', 'DE']);
      await admin.query(
        `insert into private.friend_request_counts (courier_id, hour_began_at, requests)
         values ($1, now() - interval '2 days', 5)`,
        [anna],
      );
      const annaSession = await connectAs(anna);
      const tidier = await connect();

      await annaSession.query('begin');
      await annaSession.query(`select public.request_friend('ben')`);
      const tidying = tidier.query('select private.tidy_up()');
      assert.equal(await settlesWithin(tidying, 3000), true, 'the tidy-up waited for the request');
      await annaSession.query('commit');
      await tidying;

      const { rows } = await admin.query(
        `select requests from private.friend_request_counts where courier_id = $1`,
        [anna],
      );
      assert.deepEqual(rows, [{ requests: 1 }]);
    });

    /**
     * "Withdraw" pressed at the moment the other person accepts. Whichever
     * comes first stands: an acceptance is not undone by a withdrawal that was
     * aimed at a request.
     */
    it('lets an acceptance stand against a withdrawal arriving at the same moment', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      const annaSession = await connectAs(anna);
      const benSession = await connectAs(ben);
      await annaSession.query(`select public.request_friend('ben')`);
      const { rows } = await admin.query(`select id from public.friendships`);
      const id = rows[0].id;

      await benSession.query('begin');
      await benSession.query(`select public.accept_friend($1)`, [id]);
      const withdrawing = annaSession.query(`select public.withdraw_request($1)`, [id]);
      assert.equal(await settlesWithin(withdrawing, 300), false, 'the withdrawal did not wait');
      await benSession.query('commit');

      await assert.rejects(withdrawing, (error) => error.hint === 'request_not_found');
      const { rows: left } = await admin.query(`select status from public.friendships`);
      assert.deepEqual(left, [{ status: 'accepted' }]);
    });
  });

  describe('blocking and reporting', () => {
    const friendshipsLeft = async () =>
      (await admin.query(`select count(*)::int as count from public.friendships`)).rows[0].count;

    /**
     * A request still being made when a block between the same two is made. The
     * block's sweep of their friendships cannot see a row that is not committed
     * yet, so without waiting for it, the request would survive the block and
     * sit in the blocker's list, from someone they had blocked.
     */
    it('waits for a request in progress, then ends it', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      const benSession = await connectAs(ben);
      const annaSession = await connectAs(anna);

      await benSession.query('begin');
      const asked = await benSession.query(`select public.request_friend('anna') as outcome`);
      assert.equal(asked.rows[0].outcome, 'requested');

      await annaSession.query('begin');
      const blocking = annaSession.query(`select public.block_courier($1) as outcome`, [ben]);
      assert.equal(await settlesWithin(blocking, 300), false, 'the block did not wait');

      await benSession.query('commit');
      assert.equal((await blocking).rows[0].outcome, 'blocked');
      await annaSession.query('commit');

      assert.equal(await friendshipsLeft(), 0);
    });

    it('refuses a request that arrives while a block is being made', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      const annaSession = await connectAs(anna);
      const benSession = await connectAs(ben);

      await annaSession.query('begin');
      await annaSession.query(`select public.block_courier($1)`, [ben]);

      await benSession.query('begin');
      const asking = benSession.query(`select public.request_friend('anna')`);
      assert.equal(await settlesWithin(asking, 300), false, 'the request did not wait');

      await annaSession.query('commit');
      await assert.rejects(asking, (error) => error.hint === 'unknown_username');
      await benSession.query('rollback');

      assert.equal(await friendshipsLeft(), 0);
    });

    /**
     * A block names the courier it blocks, and from the moment it is written
     * that courier's profile cannot be deleted until the request ends. Their
     * own deletion, meanwhile, has taken the friendship between the two. A
     * block that wrote its row first and ended the friendship second would
     * wait for the deletion, which is waiting for it. So the friendship goes
     * first - and with a report that also blocks, the block goes first.
     */
    for (const [label, written, call] of [
      ['a block', 'public.blocks', (anna) => [`select public.block_courier($1)`, [anna]]],
      [
        'a report that also blocks',
        'public.reports',
        (anna) => [`select public.report_courier($1, 'spam', null, true)`, [anna]],
      ],
      [
        'a report of a letter that also blocks',
        'public.reports',
        (anna, letter) => [`select public.report_letter($1, 'harassment', null, true)`, [letter]],
      ],
    ]) {
      it(`lets ${label} and the blocked friend’s own deletion happen at once`, async () => {
        const anna = await createCourier('anna', ['Berlin', 'DE']);
        const ben = await createCourier('ben', ['Munich', 'DE']);
        await makeFriends(anna, ben);
        const benSession = await connectAs(ben);
        const annaSession = await connectAs(anna);
        const { rows } = await annaSession.query(
          `select message_id from public.send_message($1, 'Unkind.')`,
          [ben],
        );
        const letter = rows[0].message_id;
        await admin.query(
          `update public.messages
           set sent_at = now() - interval '2 hours', deliver_at = now() - interval '1 minute'
           where id = $1`,
          [letter],
        );
        await admin.query(`select private.deliver_due_messages()`);

        // The pause comes once the first row that names Anna is written, with
        // the rest still to do.
        const outcomes = await slowly(
          'after insert',
          written,
          async () => {
            const blocking = benSession.query(...call(anna, letter));
            await pause(200);
            const deleting = annaSession.query('select public.delete_own_account()');
            return Promise.allSettled([blocking, deleting]);
          },
          { seconds: 0.6 },
        );

        allFulfilled(outcomes);
        assert.equal(await accountsLeft([anna]), 0);
        assert.equal(await friendshipsLeft(), 0);
      });
    }

    /**
     * Deleting an account takes its blocks and its reports with it, and the
     * cascade reaches a pair's two rows in opposite orders for its two people.
     * Two couriers who had blocked each other deleted their accounts at once
     * and deadlocked: 8 pairs in 200 without help, every time with a pause
     * like this one. (Found in review.)
     */
    for (const [label, table, event, setup] of [
      [
        'blocked',
        'blocks',
        'delete',
        `insert into public.blocks (blocker_id, blocked_id) values ($1, $2), ($2, $1)`,
      ],
      [
        'reported',
        'reports',
        'update',
        `insert into public.reports (reporter_id, reported_id, reason, reported_username)
         values ($1, $2, 'spam', 'ben'), ($2, $1, 'spam', 'anna')`,
      ],
    ]) {
      it(`lets two couriers who ${label} each other delete their accounts at once`, async () => {
        const anna = await createCourier('anna', ['Berlin', 'DE']);
        const ben = await createCourier('ben', ['Munich', 'DE']);
        await admin.query(setup, [anna, ben]);
        const annaSession = await connectAs(anna);
        const benSession = await connectAs(ben);

        const outcomes = await slowly(`before ${event}`, `public.${table}`, () =>
          Promise.allSettled([
            annaSession.query('select public.delete_own_account()'),
            benSession.query('select public.delete_own_account()'),
          ]),
        );

        for (const outcome of outcomes) {
          assert.equal(outcome.status, 'fulfilled', outcome.reason?.message);
        }
        const { rows } = await admin.query(`select count(*)::int as count from auth.users`);
        assert.equal(rows[0].count, 0);
      });
    }

    /**
     * Counted side by side, forty reports sent at once each saw fewer than
     * twenty and were all recorded. (Found in review.)
     */
    it('holds a courier to twenty reports a day however many arrive at once', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const others = [];
      for (let i = 0; i < 25; i++) others.push(await createCourier(`other${i}`, ['Munich', 'DE']));
      const sessions = await Promise.all(others.map(() => connectAs(anna)));

      const outcomes = await Promise.all(
        sessions.map((session, i) =>
          session
            .query(`select public.report_courier($1, 'spam') as outcome`, [others[i]])
            .then((result) => result.rows[0].outcome),
        ),
      );

      const tally = outcomes.reduce((t, o) => ({ ...t, [o]: (t[o] ?? 0) + 1 }), {});
      assert.deepEqual(tally, { reported: 20, limit_reached: 5 });
      const { rows } = await admin.query(`select count(*)::int as count from public.reports`);
      assert.equal(rows[0].count, 20);
    });

    it('records the same letter reported twice at once as one report', async () => {
      const anna = await createCourier('anna', ['Berlin', 'DE']);
      const ben = await createCourier('ben', ['Munich', 'DE']);
      await makeFriends(anna, ben);
      const { rows } = await (
        await connectAs(ben)
      ).query(`select message_id from public.send_message($1, 'Unkind.')`, [anna]);
      const letter = rows[0].message_id;
      await admin.query(
        `update public.messages
         set sent_at = now() - interval '2 hours', deliver_at = now() - interval '1 minute'
         where id = $1`,
        [letter],
      );
      await admin.query(`select private.deliver_due_messages()`);

      const first = await connectAs(anna);
      const second = await connectAs(anna);
      await first.query('begin');
      await second.query('begin');
      const report = (session) =>
        session.query(`select public.report_letter($1, 'harassment') as outcome`, [letter]);

      const one = await report(first);
      const other = report(second);
      assert.equal(await settlesWithin(other, 300), false, 'the second report did not wait');
      await first.query('commit');
      const two = await other;
      await second.query('commit');

      assert.deepEqual(
        [one.rows[0].outcome, two.rows[0].outcome],
        ['reported', 'already_reported'],
      );
      const { rows: kept } = await admin.query(`select count(*)::int as count from public.reports`);
      assert.equal(kept[0].count, 1);
    });
  });
});
