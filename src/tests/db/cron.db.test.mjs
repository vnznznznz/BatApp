import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createCourier, fastForward, makeFriends, rpc } from './fixtures.mjs';
import { createTestDatabase, migrationFiles } from './harness.mjs';

/**
 * The jobs pg_cron runs: delivery every minute, old reports every hour, and the
 * nightly tidy-up the privacy policy relies on.
 *
 * Each migration schedules its job only where pg_cron is available, which
 * PGlite and CI's Postgres are not, so no test ever ran what the jobs run. A
 * command mistyped in a migration would fail every night on the hosted
 * project, and the runbook's look at cron.job shows names and times, not
 * commands. So the jobs are read here out of the migrations as pg_cron would
 * be given them - a name, when it runs, what it runs - and each command is run
 * as written, as the role that scheduled it, on data it has to change.
 */

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
);

/** A string literal in SQL, with its quotes doubled inside. */
const LITERAL = String.raw`'((?:[^']|'')*)'`;
const CALL = new RegExp(
  String.raw`cron\.schedule\(\s*${LITERAL}\s*,\s*${LITERAL}\s*,\s*${LITERAL}\s*\)` +
    String.raw`|cron\.unschedule\(\s*${LITERAL}\s*\)`,
  'g',
);
const unquote = (literal) => literal.replaceAll("''", "'");

/**
 * Every job the migrations leave scheduled, by name. In pg_cron, scheduling a
 * name again replaces the job of that name, and unscheduling it removes it; so
 * here too, in the order the migrations run.
 */
function scheduledJobs() {
  const jobs = new Map();
  for (const file of migrationFiles()) {
    // Comments are left out: what they say is not run.
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/^\s*--.*$/gm, '');
    const calls = [...sql.matchAll(CALL)];
    const written = sql.match(/cron\.(?:un)?schedule\(/g)?.length ?? 0;
    assert.equal(
      calls.length,
      written,
      `${file} schedules a job in a way this test cannot read: give cron.schedule three plain string literals`,
    );
    for (const [, name, schedule, command, unscheduled] of calls) {
      if (unscheduled !== undefined) jobs.delete(unquote(unscheduled));
      else jobs.set(unquote(name), { schedule: unquote(schedule), command: unquote(command) });
    }
  }
  return jobs;
}

const jobs = scheduledJobs();

describe('the jobs pg_cron runs', () => {
  /**
   * Delivery every minute, so a letter lands within a minute of its time even
   * if nobody looks. Old reports hourly, so a report is gone within an hour of
   * its 180 days. The tidy-up once a night, at a time few people are awake.
   */
  it('are the three the app and the privacy policy rely on, each at its time', () => {
    assert.deepEqual(Object.fromEntries([...jobs].map(([name, job]) => [name, job.schedule])), {
      'deliver-due-messages': '* * * * *',
      'forget-old-reports': '17 * * * *',
      'tidy-up': '43 4 * * *',
    });
  });

  describe('each one, run as pg_cron runs it', () => {
    let db;

    before(async () => {
      db = await createTestDatabase();
      // pg_cron's log of the runs it made, which the tidy-up keeps for a week.
      // PGlite has no pg_cron, so its table stands in, with pg_cron's columns.
      await db.exec(`
        create schema cron;
        create table cron.job_run_details (
          jobid bigint,
          runid bigint primary key,
          job_pid integer,
          database text,
          username text,
          command text,
          status text,
          return_message text,
          start_time timestamptz,
          end_time timestamptz
        );
      `);
    });

    after(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      await db.exec(`
        truncate auth.users cascade;
        truncate auth.audit_log_entries;
        truncate public.reports;
        truncate cron.job_run_details;
        update private.flight_settings set time_multiplier = 1;
      `);
    });

    /**
     * pg_cron runs a job's command as the role that scheduled it, the one the
     * migrations run as - here, as on a fresh Supabase project, `postgres` -
     * and with no one signed in.
     */
    const runJob = (name) => {
      const job = jobs.get(name);
      assert.ok(job, `no job named ${name} is scheduled`);
      return db.query(job.command);
    };

    it('deliver-due-messages lands a letter whose time has come, and only that one', async () => {
      const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
      const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
      await makeFriends(db, anna, ben);
      const send = async (body) =>
        (await rpc(db, anna, 'send_message', { recipient_id: ben, body }))[0].message_id;
      const due = await send('Due now.');
      const flying = await send('Still on its way.');
      await fastForward(db, due);

      await runJob('deliver-due-messages');

      const { rows } = await db.query(
        `select m.id, m.delivered_at is not null as landed, b.status as bat
         from public.messages m join public.bats b on b.id = m.bat_id
         order by m.body`,
      );
      assert.deepEqual(rows, [
        { id: due, landed: true, bat: 'available' },
        { id: flying, landed: false, bat: 'flying' },
      ]);
    });

    it('forget-old-reports deletes a report past its 180 days, and keeps a newer one', async () => {
      const anna = await createCourier(db, { name: 'anna' });
      const ben = await createCourier(db, { name: 'ben' });
      await db.query(
        `insert into public.reports (reporter_id, reported_id, reason, reported_username, created_at)
         values ($1, $2, 'spam', 'ben', now() - interval '181 days'),
                ($2, $1, 'hate', 'anna', now() - interval '179 days')`,
        [anna, ben],
      );

      await runJob('forget-old-reports');

      const { rows } = await db.query(`select reason from public.reports`);
      assert.deepEqual(rows, [{ reason: 'hate' }]);
    });

    it('tidy-up does the night’s tidying, and leaves nothing out', async () => {
      const anna = await createCourier(db, { name: 'anna' });
      // Each of these twice: once past the time it is kept, once within it.
      await db.query(
        `insert into auth.audit_log_entries (payload, created_at)
         values (json_build_object('actor_id', $1::text), now() - interval '31 days'),
                (json_build_object('actor_id', $1::text), now() - interval '1 day')`,
        [anna],
      );
      await db.query(
        `insert into auth.sessions (user_id, created_at, updated_at)
         values ($1, now() - interval '200 days', now() - interval '91 days'),
                ($1, now() - interval '200 days', now() - interval '1 day')`,
        [anna],
      );
      await db.query(
        `insert into cron.job_run_details (runid, command, status, start_time, end_time)
         values (1, 'select private.tidy_up()', 'succeeded', now() - interval '8 days',
                 now() - interval '8 days'),
                (2, 'select private.tidy_up()', 'succeeded', now() - interval '6 days',
                 now() - interval '6 days')`,
      );

      const { rows } = await runJob('tidy-up');

      // What a run could not do, it returns: with everything it reaches in
      // place, nothing.
      assert.deepEqual(Object.values(rows[0]), [[]]);
      const recent = async (sql) => (await db.query(sql)).rows.map((row) => row.recent);
      assert.deepEqual(
        await recent(
          `select created_at > now() - interval '2 days' as recent from auth.audit_log_entries`,
        ),
        [true],
        'sign-in records are kept for 30 days',
      );
      assert.deepEqual(
        await recent(`select updated_at > now() - interval '2 days' as recent from auth.sessions`),
        [true],
        'a session nobody has used for 90 days ends',
      );
      assert.deepEqual(
        await recent(
          `select end_time > now() - interval '7 days' as recent from cron.job_run_details`,
        ),
        [true],
        'pg_cron’s log of its runs is kept for a week',
      );
      const { rows: signUp } = await db.query(
        `select raw_user_meta_data as meta from auth.users where id = $1`,
        [anna],
      );
      assert.deepEqual(signUp[0].meta, {}, 'what the sign-up form sent along goes');
    });
  });
});
