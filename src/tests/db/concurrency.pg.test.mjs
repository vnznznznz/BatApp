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
  });

  describe('blocking and reporting', () => {
    /** Whether `promise` settles within `ms` - false means it is still waiting. */
    const settlesWithin = (promise, ms) =>
      Promise.race([
        promise.then(
          () => true,
          () => true,
        ),
        new Promise((resolve) => setTimeout(() => resolve(false), ms)),
      ]);

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
