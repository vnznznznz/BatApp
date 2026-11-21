import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { createCourier, fastForward, makeFriends, rpc } from './fixtures.mjs';
import { AUTH_STUB, applyMigrations } from './harness.mjs';

/**
 * The jobs pg_cron runs: delivery every minute, old reports every hour, and the
 * nightly tidy-up the privacy policy relies on.
 *
 * Each migration schedules its job only where pg_cron is available: it looks
 * for the extension, creates it, and gives pg_cron a name, a time and a
 * command. PGlite and CI's Postgres have no pg_cron, so every other database
 * test goes the way that skips all of that, and nothing went the way the
 * hosted project goes. A look for pg_cron that never finds it, or a command
 * mistyped, would leave the hosted project without its jobs, every night, and
 * the runbook's look at cron.job shows names and times, not commands.
 *
 * So PGlite is given a pg_cron of its own here, before the migrations run.
 * Each migration then finds it, creates it and schedules its job as written;
 * what was scheduled is read back from cron.job, and each command is run as
 * pg_cron runs it, on data it has to change.
 */

/**
 * pg_cron, as far as the migrations use it: an extension by that name, with
 * the table it keeps its jobs in, its log of the runs it made, and
 * cron.schedule and cron.unschedule as it declares them - in SQL, where
 * pg_cron's own are C, and without the scheduler that runs them.
 */
const PG_CRON = {
  control: `
comment = 'Job scheduler for PostgreSQL: a stand-in for the tests, without a scheduler'
default_version = '1.6'
relocatable = false
schema = pg_catalog
`,
  script: `
create schema cron;

create table cron.job (
  jobid bigserial primary key,
  schedule text not null,
  command text not null,
  nodename text not null default 'localhost',
  nodeport integer not null default 5432,
  database text not null default current_database(),
  username text not null default current_user,
  active boolean not null default true,
  jobname text,
  unique (jobname, username)
);

create table cron.job_run_details (
  jobid bigint,
  runid bigserial primary key,
  job_pid integer,
  database text,
  username text,
  command text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
);

-- A job is run as the role that scheduled it. Scheduling a name again
-- replaces the job of that name.
create function cron.schedule(job_name text, schedule text, command text)
returns bigint
language sql
as $$
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname, username)
    do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;

create function cron.schedule(schedule text, command text)
returns bigint
language sql
as $$
  insert into cron.job (schedule, command) values (schedule, command) returning jobid
$$;

-- Unscheduling a job that is not there is an error in pg_cron.
create function cron.unschedule(job_name text)
returns boolean
language plpgsql
as $$
begin
  delete from cron.job j where j.jobname = job_name and j.username = current_user;
  if not found then
    raise exception 'could not find valid entry for job ''%''', job_name;
  end if;
  return true;
end;
$$;

create function cron.unschedule(job_id bigint)
returns boolean
language plpgsql
as $$
begin
  delete from cron.job j where j.jobid = job_id;
  if not found then
    raise exception 'could not find valid entry for job %', job_id;
  end if;
  return true;
end;
$$;
`,
};

/**
 * A test database whose Postgres has pg_cron to offer, as the hosted project's
 * has, before the migrations run.
 */
async function databaseWithPgCron() {
  const db = new PGlite();
  await db.waitReady;
  const { rows } = await db.query(`select setting from pg_config where name = 'SHAREDIR'`);
  const extensions = `${rows[0].setting}/extension`;
  db.Module.FS.writeFile(`${extensions}/pg_cron.control`, PG_CRON.control);
  db.Module.FS.writeFile(`${extensions}/pg_cron--1.6.sql`, PG_CRON.script);
  const { rows: offered } = await db.query(
    `select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron'`,
  );
  assert.equal(offered.length, 1, `PGlite no longer looks for extensions in ${extensions}`);

  await db.exec(AUTH_STUB);
  await applyMigrations(db);
  return db;
}

describe('the jobs pg_cron runs', () => {
  let db;

  before(async () => {
    db = await databaseWithPgCron();
  });

  after(async () => {
    await db?.close();
  });

  /**
   * Delivery every minute, so a letter lands within a minute of its time even
   * if nobody looks. Old reports hourly, so a report is gone within an hour of
   * its 180 days. The tidy-up once a night, at a time few people are awake.
   */
  it('are the three the app and the privacy policy rely on, each at its time', async () => {
    const { rows } = await db.query(`select jobname, schedule from cron.job order by jobname`);
    assert.deepEqual(rows, [
      { jobname: 'deliver-due-messages', schedule: '* * * * *' },
      { jobname: 'forget-old-reports', schedule: '17 * * * *' },
      { jobname: 'tidy-up', schedule: '43 4 * * *' },
    ]);
  });

  describe('each one, run as pg_cron runs it', () => {
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
    const runJob = async (name) => {
      const { rows } = await db.query(`select command, username from cron.job where jobname = $1`, [
        name,
      ]);
      assert.equal(rows.length, 1, `no job named ${name} is scheduled`);
      const [{ command, username }] = rows;
      await db.query(`select set_config('role', $1, false)`, [username]);
      try {
        return await db.query(command);
      } finally {
        await db.exec(`reset role;`);
      }
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
