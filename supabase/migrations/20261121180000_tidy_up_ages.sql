-- Night Courier - the tidy-up's ages, counted from the right moment.
--
-- Review found that the daily tidy-up counted from the wrong moment:
--
--   * A sign-up whose address was never confirmed went 7 days after it was
--     made. Once confirmation is on, someone can ask for a new code on the
--     seventh day - on the code screen, or by signing up again - and a code is
--     good for a day. The tidy-up deleted the account that night all the same;
--     the code was then refused, and they had to sign up again. Such a sign-up
--     now goes 7 days after the last code sent to confirm its address, and one
--     never sent a code 7 days after it was made, as before.
--
-- Nothing else changes: the steps, their order, the rows they take first and
-- the errors they pass over are as the one lock order migration left them.

/* -------------------------------------------------------------------------- */
/* The daily tidy-up                                                          */
/* -------------------------------------------------------------------------- */

-- As before (see the one lock order migration), except that an unconfirmed
-- sign-up's week counts from the last code sent to it.
create or replace function private.tidy_up()
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  skipped text[] := '{}';
  unconfirmed uuid[];
begin
  -- A sign-up whose address was never confirmed, profile and all, once a
  -- week has passed since the last code sent to confirm it: someone who asks
  -- for a new code on the seventh day has the day the code is good for.
  -- GoTrue writes when it sent the newest code (confirmation_sent_at); an
  -- account nobody was sent a code for counts from when it was made. It
  -- cannot sign in, but couriers can have asked it to be friends, blocked it
  -- and reported it.
  --
  -- While confirmation is off, GoTrue confirms every address at sign-up, but
  -- this still finds an account the operator makes by hand without confirming
  -- its address, in the dashboard or through the auth server's admin API. That
  -- account cannot sign in either, and it goes too, 7 days after it was made.
  begin
    select coalesce(array_agg(u.id), '{}') into unconfirmed
    from auth.users u
    where u.email_confirmed_at is null
      and coalesce(u.confirmation_sent_at, u.created_at)
        < now() - private.unconfirmed_sign_up_lifetime();

    perform private.lock_rows_of_couriers(unconfirmed);

    -- Asked once more of each sign-up as it is deleted: an address confirmed
    -- a moment ago stays, and so does one sent a new code a moment ago.
    delete from auth.users u
    where u.id = any (unconfirmed)
      and u.email_confirmed_at is null
      and coalesce(u.confirmation_sent_at, u.created_at)
        < now() - private.unconfirmed_sign_up_lifetime();
  exception
    when undefined_table or invalid_schema_name or undefined_column
      or insufficient_privilege or deadlock_detected then
      skipped := skipped || ('unconfirmed sign-ups: ' || sqlerrm);
  end;

  -- A removed account is a sign-in without a profile, kept banned. Once the
  -- ban has run out, it goes - and with it everything still hanging off it.
  -- Nothing of a courier's hangs off it any more, so there is nothing to take
  -- first.
  begin
    delete from auth.users u
    where u.banned_until is not null
      and u.banned_until < now()
      and not exists (select 1 from public.profiles p where p.id = u.id);
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege
      or deadlock_detected then
      skipped := skipped || ('expired bans: ' || sqlerrm);
  end;

  begin
    delete from auth.audit_log_entries a
    where a.created_at < now() - private.sign_in_record_retention();
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege
      or deadlock_detected then
      skipped := skipped || ('sign-in log: ' || sqlerrm);
  end;

  -- GoTrue stamps updated_at each time a session is renewed, so it is when the
  -- session was last used. Deleting a session takes its refresh tokens with
  -- it; the app is then refused its next renewal and asks to sign in.
  begin
    delete from auth.sessions s
    where coalesce(s.updated_at, s.created_at) < now() - private.idle_session_lifetime();
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege
      or deadlock_detected then
      skipped := skipped || ('idle sessions: ' || sqlerrm);
  end;

  -- The profile is the record of who someone is; handle_new_user has read
  -- these by the time this runs. GoTrue keeps a second copy in the email
  -- identity, which travels nowhere but is kept all the same.
  begin
    update auth.users u
    set raw_user_meta_data = u.raw_user_meta_data - 'username' - 'display_name'
    where u.raw_user_meta_data ?| array['username', 'display_name'];
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege
      or deadlock_detected then
      skipped := skipped || ('sign-up names: ' || sqlerrm);
  end;

  begin
    update auth.identities i
    set identity_data = i.identity_data - 'username' - 'display_name'
    where i.identity_data ?| array['username', 'display_name'];
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege
      or deadlock_detected then
      skipped := skipped || ('sign-up names in identities: ' || sqlerrm);
  end;

  -- The old city only matters while a move settles (see the flight migration).
  begin
    update public.profiles p
    set settled_city_id = null, city_changed_at = null
    where p.settled_city_id is not null
      and p.city_changed_at <= now() - private.relocation_period();
  exception
    when deadlock_detected then
      skipped := skipped || ('settled moves: ' || sqlerrm);
  end;

  -- How many friend requests someone made only matters for an hour. A count
  -- that a request is using is passed over, so this never waits, and cannot
  -- be stopped.
  delete from private.friend_request_counts c
  where c.courier_id in (
    select stale.courier_id
    from private.friend_request_counts stale
    where stale.hour_began_at < now() - interval '1 day'
    for update skip locked
  );

  begin
    delete from cron.job_run_details d
    where d.end_time < now() - interval '7 days';
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege
      or deadlock_detected then
      skipped := skipped || ('pg_cron run log: ' || sqlerrm);
  end;

  if cardinality(skipped) > 0 then
    raise warning 'the tidy-up left out: %', array_to_string(skipped, '; ');
  end if;

  return skipped;
end;
$$;

revoke all on function private.tidy_up() from public, anon, authenticated;
