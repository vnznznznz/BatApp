-- Night Courier - the delivery schedule.
--
-- Runs the delivery worker once a minute with pg_cron, inside the database, so
-- that no part of delivery lives in the mobile app or depends on anyone having
-- it open. A letter therefore lands within a minute of its time even if neither
-- friend looks, which is what a push notification will need (Phase 10).
--
-- pg_cron rather than an Edge Function on a timer: the worker is one SQL
-- statement, so calling it from inside the database removes a deploy target, a
-- network hop and a service-role key. If delivery ever needs to do something
-- SQL cannot - sending the push itself - that work belongs in a function the
-- worker hands off to, not in a reason to move the worker out.
--
-- pg_cron ships with Supabase, hosted and local. Plain Postgres - the database
-- tests, a CI service container - does not have it, and there the job is simply
-- not scheduled. That is safe: the app's own functions deliver whatever is due
-- for the courier asking before they answer, so the schedule makes delivery
-- timely, never correct.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available: no delivery job scheduled. Letters are still '
      'delivered when the sender or the recipient next opens the app.';
    return;
  end if;

  create extension if not exists pg_cron;

  -- Scheduling under an existing name replaces that job, so replaying this is
  -- harmless.
  perform cron.schedule(
    'deliver-due-messages',
    '* * * * *',
    'select private.deliver_due_messages()'
  );
end;
$$;
