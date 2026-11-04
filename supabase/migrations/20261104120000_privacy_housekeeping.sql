-- Night Courier - keeping less, for less long.
--
-- Writing the privacy policy meant listing every piece of personal data the
-- service holds, from the database itself rather than from the docs. That
-- found things kept for no reason, or longer than any reason lasts:
--
--   * Supabase Auth writes an audit entry for every sign-up, sign-in, sign-out
--     and token refresh - the email address, and the IP address - and never
--     removes one. Not even when the account is deleted: the entries have no
--     foreign key to the user.
--   * The sign-up form's username and display name stay in auth.users as they
--     were typed, and travel in every access token, long after the profile -
--     the record - has been changed. GoTrue copies them into the email identity
--     as well.
--   * A removed account kept banned, so that the same email cannot simply sign
--     up again, was banned for a hundred years and kept for ever. The operator's
--     decision is two years.
--   * A session - with the IP address and device it was opened from - lasts
--     until its owner signs out, even on a phone lost years ago. Supabase can
--     limit that only on its paid plans.
--   * The city a courier moved away from stays on their profile after the move
--     has settled, with the time of the move.
--   * pg_cron's log of its own runs grows without end.
--
-- One daily job deals with all of it. Account deletion now takes the account's
-- audit entries with it, and the operator removes an account with one call that
-- bans it for exactly the decided time.

/* -------------------------------------------------------------------------- */
/* How long                                                                    */
/* -------------------------------------------------------------------------- */

-- Long enough to look into a break-in or abuse of an account; no longer.
create or replace function private.sign_in_record_retention()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '30 days'
$$;

-- How long a removed account's sign-in is kept, banned, to stop it returning.
-- private.remove_account bans for exactly this (docs/GO-LIVE.md, "Handling a
-- report").
create or replace function private.ban_period()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '2 years'
$$;

-- How long a session may go unused before it ends. The app renews its
-- sign-in about hourly while it is open, so this is three months of not
-- opening it; then its owner signs in again.
create or replace function private.idle_session_lifetime()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '90 days'
$$;

revoke all on function private.sign_in_record_retention() from public, anon, authenticated;
revoke all on function private.ban_period() from public, anon, authenticated;
revoke all on function private.idle_session_lifetime() from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* The daily tidy-up                                                           */
/* -------------------------------------------------------------------------- */

-- Each step on one of Supabase's own tables - the audit log, sessions,
-- identities, sign-ins, pg_cron's log - stands alone: where it cannot reach the
-- table (a platform that withholds the privilege, or plain Postgres in the
-- tests) it is skipped, and the others carry on. What was skipped is returned,
-- so that running this by hand shows at once whether it can do everything the
-- privacy policy says it does: an empty list means it can (docs/GO-LIVE.md,
-- "Setting up the hosted project"). Any other error is a fault, and fails the
-- whole run.
--
-- Returning a list is new: drop the first version, which returned nothing.
drop function if exists private.tidy_up();

create function private.tidy_up()
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  skipped text[] := '{}';
begin
  begin
    delete from auth.audit_log_entries a
    where a.created_at < now() - private.sign_in_record_retention();
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('sign-in log: ' || sqlerrm);
  end;

  -- The profile is the record of who someone is; handle_new_user has read
  -- these by the time this runs. GoTrue keeps a second copy in the email
  -- identity, which travels nowhere but is kept all the same.
  begin
    update auth.users u
    set raw_user_meta_data = u.raw_user_meta_data - 'username' - 'display_name'
    where u.raw_user_meta_data ?| array['username', 'display_name'];
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('sign-up names: ' || sqlerrm);
  end;

  begin
    update auth.identities i
    set identity_data = i.identity_data - 'username' - 'display_name'
    where i.identity_data ?| array['username', 'display_name'];
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('sign-up names in identities: ' || sqlerrm);
  end;

  -- GoTrue stamps updated_at each time a session is renewed, so it is when the
  -- session was last used. Deleting a session takes its refresh tokens with
  -- it; the app is then refused its next renewal and asks to sign in.
  begin
    delete from auth.sessions s
    where coalesce(s.updated_at, s.created_at) < now() - private.idle_session_lifetime();
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('idle sessions: ' || sqlerrm);
  end;

  -- A removed account is a sign-in without a profile, kept banned. Once the
  -- ban has run out, it goes - and with it everything still hanging off it.
  begin
    delete from auth.users u
    where u.banned_until is not null
      and u.banned_until < now()
      and not exists (select 1 from public.profiles p where p.id = u.id);
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('expired bans: ' || sqlerrm);
  end;

  -- The old city only matters while a move settles (see the flight migration).
  update public.profiles p
  set settled_city_id = null, city_changed_at = null
  where p.settled_city_id is not null
    and p.city_changed_at <= now() - private.relocation_period();

  begin
    delete from cron.job_run_details d
    where d.end_time < now() - interval '7 days';
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('pg_cron run log: ' || sqlerrm);
  end;

  return skipped;
end;
$$;

revoke all on function private.tidy_up() from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Taking an account away                                                      */
/* -------------------------------------------------------------------------- */

-- Every row that deleting a courier reaches through a cascade, taken in one
-- order for everyone, so that two deletions at once wait for each other rather
-- than deadlock (see the safety migration, where this was found).
create or replace function private.lock_courier_rows(courier uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1
  from public.messages m
  where courier in (m.sender_id, m.recipient_id)
  order by m.deliver_at, m.id
  for update;

  perform 1
  from public.bats b
  where b.owner_id = courier
  order by b.slot
  for update;

  perform 1
  from public.blocks k
  where courier in (k.blocker_id, k.blocked_id)
  order by k.blocker_id, k.blocked_id
  for update;

  perform 1
  from public.reports r
  where courier in (r.reporter_id, r.reported_id)
  order by r.id
  for update;
end;
$$;

revoke all on function private.lock_courier_rows(uuid) from public, anon, authenticated;

-- As before, and then the account's audit entries, found by the user id GoTrue
-- writes into each one. Skipped where the table is out of reach, so that
-- deleting an account can never fail for it; the daily job removes what is
-- left within 30 days anyway.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform private.lock_courier_rows(caller);

  delete from auth.users where id = caller;

  begin
    delete from auth.audit_log_entries a
    where a.payload ->> 'actor_id' = caller::text;
  exception
    when undefined_table or insufficient_privilege then null;
  end;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- How the operator removes an account after a serious report (docs/GO-LIVE.md,
-- "Handling a report"): everything it holds deleted at once, and its sign-in
-- banned for private.ban_period(), so that the same email cannot simply sign up
-- again. The daily tidy-up deletes the sign-in when the ban runs out.
--
-- Its audit entries are left to expire in 30 days: after a threat, they are
-- what there is to give the police.
--
-- Not callable through the API: the operator runs it in the SQL editor.
create or replace function private.remove_account(courier uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = courier) then
    raise exception 'there is no account %', courier using errcode = 'P0002';
  end if;

  perform private.lock_courier_rows(courier);

  update auth.users u
  set banned_until = now() + private.ban_period()
  where u.id = courier;

  delete from public.profiles p where p.id = courier;
end;
$$;

revoke all on function private.remove_account(uuid) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Schedule                                                                    */
/* -------------------------------------------------------------------------- */

do $$
begin
  if not exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available: the daily tidy-up is not scheduled.';
    return;
  end if;

  create extension if not exists pg_cron;

  perform cron.schedule('tidy-up', '43 4 * * *', 'select private.tidy_up()');
end;
$$;
