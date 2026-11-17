-- Night Courier - one order for every row, whoever ends the account.
--
-- When an account goes, rows in half a dozen tables go with it, and at that
-- moment other requests are holding some of them: a letter that is landing, a
-- block being made, a second account being deleted. Two transactions that each
-- hold a row the other needs would wait for ever, so Postgres stops one of
-- them, and somebody's request fails. That is why whatever ends an account
-- first takes every row it is going to touch, in one order that is the same
-- for everyone (see the safety and privacy migrations). Review found what
-- that order still left out, on a real Postgres:
--
--   * The daily tidy-up deletes sign-ups whose address was never confirmed,
--     and went straight into the cascade without taking anything first. A
--     courier who had asked such a sign-up to be friends, and had reported it,
--     and deleted their own account at that moment, held the report and
--     wanted the request - while the tidy-up held the request and wanted the
--     report. With nothing arranged, 30 rounds in 150 ended with one of the
--     two stopped.
--   * The tidy-up did its other work first and kept hold of it to the end:
--     the sign-in of everyone who had joined since the day before, old
--     sign-in records, sessions nobody uses. A courier deleting their account
--     has to wait for those - and can be holding rows the tidy-up has yet to
--     ask for.
--   * When it was the tidy-up that Postgres stopped, the whole night's run
--     was undone with it - sign-in records, sessions, names, all of it - to
--     be tried again a day later, and nothing said so.
--   * Friendships were not in the order at all: the one way left for three
--     couriers deleting their accounts in the same moment to hold each other
--     up.
--
-- So: friendships are taken with the rest. The tidy-up takes the rows of the
-- sign-ups it is about to delete like everything else that ends an account,
-- and deletes before it does anything else, while it holds nothing. And a step
-- of the tidy-up that is stopped is undone alone and reported like a step that
-- was skipped; the rest of the night's work stands.

/* -------------------------------------------------------------------------- */
/* Every row, friendships included                                            */
/* -------------------------------------------------------------------------- */

-- Every row that deleting these couriers reaches through a cascade, taken in
-- one order for everyone: letters, bats, friendships, blocks, reports - and
-- each table whole before the next. For several couriers at once that matters:
-- taken one courier after another, the first one's reports would be held while
-- the second one's blocks were still to come, and a courier deleting their own
-- account, who takes blocks before reports, could hold the one and want the
-- other.
--
-- A courier's count of friend requests (private.friend_request_counts) goes
-- with the account too and is deliberately not here: see the rule below.
create or replace function private.lock_rows_of_couriers(couriers uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1
  from public.messages m
  where m.sender_id = any (couriers) or m.recipient_id = any (couriers)
  order by m.deliver_at, m.id
  for update;

  perform 1
  from public.bats b
  where b.owner_id = any (couriers)
  order by b.owner_id, b.slot
  for update;

  perform 1
  from public.friendships f
  where f.requester_id = any (couriers) or f.addressee_id = any (couriers)
  order by f.id
  for update;

  perform 1
  from public.blocks k
  where k.blocker_id = any (couriers) or k.blocked_id = any (couriers)
  order by k.blocker_id, k.blocked_id
  for update;

  perform 1
  from public.reports r
  where r.reporter_id = any (couriers) or r.reported_id = any (couriers)
  order by r.id
  for update;
end;
$$;

-- The same for one courier, under the name it has had since the privacy
-- migration: what a courier deleting their own account, and the operator
-- removing or deleting one, call first.
create or replace function private.lock_courier_rows(courier uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.lock_rows_of_couriers(array[courier]);
end;
$$;

revoke all on function private.lock_rows_of_couriers(uuid[]) from public, anon, authenticated;
revoke all on function private.lock_courier_rows(uuid) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* The rule that comes with it                                                */
/* -------------------------------------------------------------------------- */

-- A request that writes a row naming a courier - a block, a report, a letter,
-- a friend request - holds on to that courier's profile from then until it
-- ends, so that the profile cannot vanish from under the new row. A deletion
-- needs the profile to itself, and waits for that request to end.
--
-- So such a request must not, after writing its row, wait for anything the
-- deletion took on its way to the profile: each would be waiting for the
-- other. Sending and asking never did. Blocking did, the moment friendships
-- were among the rows a deletion takes: it wrote the block, and then ended
-- the friendship. Tried that way round against a real Postgres, with the
-- block made to pause between its two steps, a courier blocking a friend who
-- was deleting their account at that moment stopped one of the two each time.
--
-- Blocking therefore ends the friendship first and writes the block second,
-- and a report that is to block as well does that before it writes the
-- report. (It is also why a courier's count of friend requests is not taken
-- with their other rows: a request counts itself after it has written the
-- friendship.)

-- As before (see the safety migration), in the other order.
create or replace function private.block(blocker uuid, blocked uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  perform private.lock_pair(block.blocker, block.blocked);

  delete from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(block.blocker, block.blocked)
    and greatest(f.requester_id, f.addressee_id) = greatest(block.blocker, block.blocked);

  insert into public.blocks (blocker_id, blocked_id)
  values (block.blocker, block.blocked)
  on conflict do nothing;

  return found;
end;
$$;

revoke all on function private.block(uuid, uuid) from public, anon, authenticated;

-- As before (see the safety migration), except that the block, when asked
-- for, is made first. It is still made whatever becomes of the report.
create or replace function public.report_letter(
  message_id uuid,
  reason text,
  note text default null,
  also_block boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
  kept_note text := private.check_report(report_letter.reason, report_letter.note);
  letter public.messages;
  sender public.profiles;
  outcome text := 'already_reported';
begin
  select m.* into letter
  from public.messages m
  where m.id = report_letter.message_id
    and m.recipient_id = caller
    and m.delivered_at is not null;

  if not found then
    raise exception 'no such letter'
      using errcode = 'P0001', hint = 'message_not_found';
  end if;

  select p.* into sender
  from public.profiles p
  where p.id = letter.sender_id;

  if report_letter.also_block then
    perform private.block(caller, sender.id);
  end if;

  if exists (
    select 1
    from public.reports r
    where r.reporter_id = caller
      and r.message_id = letter.id
      and r.resolved_at is null
  ) then
    outcome := 'already_reported';
  elsif private.over_report_limit(caller) then
    outcome := 'limit_reached';
  else
    begin
      insert into public.reports (
        reporter_id, reported_id, message_id, reason, note,
        reported_username, reported_display_name, letter_body, letter_sent_at
      )
      values (
        caller, sender.id, letter.id, report_letter.reason, kept_note,
        sender.username, sender.display_name, letter.body, letter.sent_at
      );
      outcome := 'reported';
    exception when unique_violation then
      -- The same report, made at the same moment from another request.
      null;
    end;
  end if;

  return outcome;
end;
$$;

create or replace function public.report_courier(
  courier_id uuid,
  reason text,
  note text default null,
  also_block boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
  kept_note text := private.check_report(report_courier.reason, report_courier.note);
  reported public.profiles;
  outcome text := 'already_reported';
begin
  if report_courier.courier_id = caller then
    raise exception 'a courier cannot report themselves'
      using errcode = 'P0001', hint = 'cannot_report_self';
  end if;

  select p.* into reported
  from public.profiles p
  where p.id = report_courier.courier_id;

  if not found then
    raise exception 'no such courier'
      using errcode = 'P0001', hint = 'courier_not_found';
  end if;

  if report_courier.also_block then
    perform private.block(caller, reported.id);
  end if;

  if exists (
    select 1
    from public.reports r
    where r.reporter_id = caller
      and r.reported_id = reported.id
      and r.message_id is null
      and r.resolved_at is null
  ) then
    outcome := 'already_reported';
  elsif private.over_report_limit(caller) then
    outcome := 'limit_reached';
  else
    begin
      insert into public.reports (
        reporter_id, reported_id, reason, note, reported_username, reported_display_name
      )
      values (
        caller, reported.id, report_courier.reason, kept_note,
        reported.username, reported.display_name
      );
      outcome := 'reported';
    exception when unique_violation then
      null;
    end;
  end if;

  return outcome;
end;
$$;

revoke all on function public.report_letter(uuid, text, text, boolean) from public, anon;
revoke all on function public.report_courier(uuid, text, text, boolean) from public, anon;
grant execute on function public.report_letter(uuid, text, text, boolean) to authenticated;
grant execute on function public.report_courier(uuid, text, text, boolean) to authenticated;

/* -------------------------------------------------------------------------- */
/* The daily tidy-up, deleting first                                          */
/* -------------------------------------------------------------------------- */

-- As before (see the friend requests migration), with three changes.
--
-- The steps that delete accounts come first. Whatever a step touches, this
-- job holds until it ends; with the deletions done while it holds nothing
-- else, a courier's own deletion that meets this job waits for it, and is
-- never also waited for.
--
-- Sign-ups that were never confirmed are deleted the way every account is:
-- their rows taken first, in the one order. All of them together, because the
-- order is by table.
--
-- And if Postgres does stop a step, because it and a request were each
-- waiting for the other, that step is undone alone and listed in what this
-- returns, like a step that could not reach its table. Everything else the
-- run did stands, and the next night's run does what this one left.
--
-- What a run returns, the nightly job shows to nobody. So whatever it left
-- out is also said in the server's log, as a warning.
create or replace function private.tidy_up()
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  skipped text[] := '{}';
  unconfirmed uuid[];
begin
  -- A sign-up whose address was never confirmed, profile and all. (While
  -- confirmation is off, GoTrue confirms every address at sign-up, and this
  -- finds nothing.) It cannot sign in, but couriers can have asked it to be
  -- friends, blocked it and reported it.
  begin
    select coalesce(array_agg(u.id), '{}') into unconfirmed
    from auth.users u
    where u.email_confirmed_at is null
      and u.created_at < now() - private.unconfirmed_sign_up_lifetime();

    perform private.lock_rows_of_couriers(unconfirmed);

    -- Asked once more of each sign-up as it is deleted: an address confirmed
    -- a moment ago stays.
    delete from auth.users u
    where u.id = any (unconfirmed)
      and u.email_confirmed_at is null;
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
