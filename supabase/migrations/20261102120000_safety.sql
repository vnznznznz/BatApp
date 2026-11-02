-- Night Courier - blocking and reporting.
--
-- A messaging app is a user-generated-content app under Apple's Guideline 1.2:
-- a way to block an abusive user and a way to report what they sent are
-- conditions of review, not features. Both are built the way the rest of the
-- API is: tables no client can read or write, reached only through functions
-- that decide what each side may do and learn.
--
-- Blocking is one-sided and silent:
--
--   * whatever was between the two - a friendship, a request either way - ends,
--     so the blocked courier no longer sees the blocker's city;
--   * the blocked courier cannot ask again, and is answered exactly as if the
--     username did not exist, so asking gives the block away no more than a
--     deleted account would;
--   * letters from the blocked courier - those already received, and any still
--     in the air - are hidden from the blocker while the block stands. They are
--     not deleted: the bat that carried one still comes home, and unblocking
--     brings them back.
--
-- Nothing tells the blocked courier. Their letters land, as far as they can
-- tell, the way letters always land: the app never says whether one was read.
--
-- Reports go to the operator, who reads them in the Supabase dashboard (see
-- docs/GO-LIVE.md). A report keeps a copy of what it is about - the letter's
-- text, the courier's names as they were - so that it can still be judged once
-- the letter is gone or the names have changed. Reports are kept for 180 days.

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

comment on table public.blocks is
  'Who has blocked whom. One-sided: a row hides the blocked courier from the blocker. Written only through block_courier, unblock_courier and the report functions.';

-- The primary key leads with the blocker. A request answering "has this person
-- blocked me", and the cascade when a blocked courier's account goes, look up
-- by the other column.
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
alter table public.blocks force row level security;

-- No policies and no grants: list_blocked() is the only way to read this, and
-- it shows a courier their own blocks and nobody else's - least of all whether
-- someone has blocked them.
revoke all on table public.blocks from anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  -- Set null rather than cascade, both ways. A report outlives the account of
  -- whoever made it, without their name. And it outlives the account of whoever
  -- it is about: otherwise deleting an account would be a way to take back a
  -- threat, and with it - letters go from both sides - the only copy of it.
  reporter_id uuid references public.profiles (id) on delete set null,
  reported_id uuid references public.profiles (id) on delete set null,
  -- No foreign key, deliberately: a letter goes when either of its two people
  -- deletes their account, and its report must not go with it.
  message_id uuid,
  reason text not null,
  note text,
  -- What was reported, as it was when it was reported.
  reported_username text not null,
  reported_display_name text,
  letter_body text,
  letter_sent_at timestamptz,
  created_at timestamptz not null default now(),
  -- For the operator: when the report was dealt with, and how.
  resolved_at timestamptz,
  resolution text,

  constraint reports_reason_known
    check (reason in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'other')),
  constraint reports_note_length
    check (note is null or char_length(note) between 1 and 500),
  constraint reports_letter_kept
    check (
      (message_id is null) = (letter_body is null)
      and (message_id is null) = (letter_sent_at is null)
    )
);

comment on table public.reports is
  'Reports of letters and couriers, for the operator. Written only through report_letter and report_courier; read in the dashboard. Deleted 180 days after they were made.';

-- Reporting a letter again changes nothing.
create unique index reports_letter_once on public.reports (reporter_id, message_id)
  where message_id is not null;

-- Nor does reporting a courier again while the first report is still open.
create unique index reports_courier_once on public.reports (reporter_id, reported_id)
  where message_id is null and resolved_at is null;

-- The operator's queue and the retention sweep read by age; the daily limit and
-- the set-null cascades look up by each person.
create index reports_created_idx on public.reports (created_at);
create index reports_reporter_idx on public.reports (reporter_id, created_at);
create index reports_reported_idx on public.reports (reported_id);

alter table public.reports enable row level security;
alter table public.reports force row level security;

-- Nobody reads reports through the API, not even the person who made one.
revoke all on table public.reports from anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

-- Serialises what changes the standing between two couriers: a friend request
-- and a block. Without it, a request could be checked against the blocks just
-- before a block between the same two lands and inserted just after the block
-- swept their friendships - leaving a request waiting from someone blocked.
create or replace function private.lock_pair(a uuid, b uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(lock_pair.a, lock_pair.b)::text || greatest(lock_pair.a, lock_pair.b)::text,
      0
    )
  );
end;
$$;

create or replace function private.has_blocked(blocker uuid, blocked uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks k
    where k.blocker_id = has_blocked.blocker
      and k.blocked_id = has_blocked.blocked
  )
$$;

-- Blocks, and ends whatever was between the two. True if the block is new.
create or replace function private.block(blocker uuid, blocked uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  added boolean;
begin
  perform private.lock_pair(block.blocker, block.blocked);

  insert into public.blocks (blocker_id, blocked_id)
  values (block.blocker, block.blocked)
  on conflict do nothing;
  added := found;

  delete from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(block.blocker, block.blocked)
    and greatest(f.requester_id, f.addressee_id) = greatest(block.blocker, block.blocked);

  return added;
end;
$$;

create or replace function private.report_retention()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '180 days'
$$;

-- Enough for someone on the end of a campaign to report every letter of a bad
-- day; not enough to fill the operator's queue for sport.
create or replace function private.reports_per_day()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20
$$;

-- The note as it will be kept - null if there is nothing in it - or a refusal
-- for a reason the operator would not recognise or a note that is too long.
create or replace function private.check_report(reason text, note text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  kept text := case when check_report.note ~ '\S' then check_report.note end;
begin
  if check_report.reason is null
     or check_report.reason not in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'other') then
    raise exception 'unknown report reason'
      using errcode = 'P0001', hint = 'unknown_reason';
  end if;

  if char_length(kept) > 500 then
    raise exception 'the note is too long'
      using errcode = 'P0001', hint = 'note_too_long';
  end if;

  return kept;
end;
$$;

create or replace function private.check_report_rate(reporter uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.reports r
    where r.reporter_id = check_report_rate.reporter
      and r.created_at > now() - interval '1 day'
  ) >= private.reports_per_day() then
    raise exception 'too many reports in a day'
      using errcode = 'P0001', hint = 'too_many_reports';
  end if;
end;
$$;

-- Run daily by pg_cron, below. Returns how many went.
create or replace function private.forget_old_reports()
returns integer
language sql
set search_path = ''
as $$
  with gone as (
    delete from public.reports r
    where r.created_at < now() - private.report_retention()
    returning 1
  )
  select count(*)::integer from gone
$$;

revoke all on function private.lock_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function private.has_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function private.block(uuid, uuid) from public, anon, authenticated;
revoke all on function private.report_retention() from public, anon, authenticated;
revoke all on function private.reports_per_day() from public, anon, authenticated;
revoke all on function private.check_report(text, text) from public, anon, authenticated;
revoke all on function private.check_report_rate(uuid) from public, anon, authenticated;
revoke all on function private.forget_old_reports() from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Blocking                                                                    */
/* -------------------------------------------------------------------------- */

-- 'blocked', or 'already_blocked' if it already was.
create or replace function public.block_courier(courier_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  if block_courier.courier_id = caller then
    raise exception 'a courier cannot block themselves'
      using errcode = 'P0001', hint = 'cannot_block_self';
  end if;

  if not exists (select 1 from public.profiles p where p.id = block_courier.courier_id) then
    raise exception 'no such courier'
      using errcode = 'P0001', hint = 'courier_not_found';
  end if;

  return case
    when private.block(caller, block_courier.courier_id) then 'blocked'
    else 'already_blocked'
  end;
end;
$$;

-- Lifts a block, if there is one. The friendship it ended stays ended: being
-- friends again takes a new request, and the other person's yes.
create or replace function public.unblock_courier(courier_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  delete from public.blocks k
  where k.blocker_id = caller
    and k.blocked_id = unblock_courier.courier_id;
end;
$$;

-- The couriers the caller has blocked, most recent first. Username only: a
-- display name is the other person's to change, and a list of the people you
-- have shut out is the last place to be shown whatever they changed it to.
create or replace function public.list_blocked()
returns table (courier_id uuid, username text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, k.created_at
  from public.blocks k
  join public.profiles p on p.id = k.blocked_id
  where k.blocker_id = (select auth.uid())
  order by k.created_at desc, p.username
$$;

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

-- Reports a letter the caller received, and blocks its sender if asked to.
-- 'reported', or 'already_reported' if the caller had reported it before.
--
-- Only a letter that has landed for the caller can be reported by them - what
-- they have read, nothing else - and any other letter is refused exactly as
-- read_message refuses it. A letter whose sender is blocked can still be
-- reported: blocking first and reporting second is a reasonable order.
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

  if not exists (
    select 1
    from public.reports r
    where r.reporter_id = caller
      and r.message_id = letter.id
  ) then
    perform private.check_report_rate(caller);

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

  if report_letter.also_block then
    perform private.block(caller, sender.id);
  end if;

  return outcome;
end;
$$;

-- Reports a courier - a request from a stranger, a name chosen to hurt - and
-- blocks them if asked to. 'reported', or 'already_reported' while an earlier
-- report of the same courier by the caller is still open.
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

  if not exists (
    select 1
    from public.reports r
    where r.reporter_id = caller
      and r.reported_id = reported.id
      and r.message_id is null
      and r.resolved_at is null
  ) then
    perform private.check_report_rate(caller);

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

  if report_courier.also_block then
    perform private.block(caller, reported.id);
  end if;

  return outcome;
end;
$$;

/* -------------------------------------------------------------------------- */
/* Friend requests, now aware of blocks                                        */
/* -------------------------------------------------------------------------- */

-- As before (see the friendships migration), with two refusals added, both
-- decided under the pair's lock:
--
--   * asking someone you have blocked is refused, saying so - you know;
--   * asking someone who has blocked you is refused exactly as an unknown
--     username is, message and all, so that it reveals nothing.
create or replace function public.request_friend(username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
  target uuid;
  pair public.friendships;
begin
  select p.id into target
  from public.profiles p
  where p.username = lower(btrim(request_friend.username));

  if target is null then
    raise exception 'no courier has that username'
      using errcode = 'P0001', hint = 'unknown_username';
  end if;

  if target = caller then
    raise exception 'a courier cannot befriend themselves'
      using errcode = 'P0001', hint = 'cannot_befriend_self';
  end if;

  perform private.lock_pair(caller, target);

  if private.has_blocked(caller, target) then
    raise exception 'the caller has blocked that courier'
      using errcode = 'P0001', hint = 'courier_blocked';
  end if;

  if private.has_blocked(target, caller) then
    raise exception 'no courier has that username'
      using errcode = 'P0001', hint = 'unknown_username';
  end if;

  -- A concurrent request or removal between the same two people can insert or
  -- delete the pair's row between the two statements below. Going round again
  -- settles it; three rounds is more than any real race needs.
  for attempt in 1..3 loop
    insert into public.friendships (requester_id, addressee_id)
    values (caller, target)
    on conflict ((least(requester_id, addressee_id)), (greatest(requester_id, addressee_id)))
    do nothing;

    if found then
      return 'requested';
    end if;

    select f.* into pair
    from public.friendships f
    where least(f.requester_id, f.addressee_id) = least(caller, target)
      and greatest(f.requester_id, f.addressee_id) = greatest(caller, target)
    for update;

    if found then
      if pair.status = 'accepted' then
        return 'already_friends';
      elsif pair.requester_id = caller then
        return 'already_requested';
      end if;

      -- They asked first. Asking back is an answer.
      update public.friendships f
      set status = 'accepted', accepted_at = now()
      where f.id = pair.id;

      return 'accepted';
    end if;
  end loop;

  raise exception 'the request could not be recorded'
    using errcode = '40001', hint = 'try_again';
end;
$$;

comment on table public.friendships is
  'One row per pair of couriers, whichever of them asked. Written only through request_friend, accept_friend, remove_friend, and the blocking and report functions, which end a friendship.';

/* -------------------------------------------------------------------------- */
/* Reading, now hiding letters from blocked couriers                           */
/* -------------------------------------------------------------------------- */

-- As before (see the reading migration), leaving out letters from anyone the
-- caller has blocked. The cursor is still looked up among all of the caller's
-- letters: a letter hidden since the last page still marks where it was.
create or replace function public.list_inbox(
  max_results integer default 50,
  older_than uuid default null
)
returns table (
  message_id uuid,
  sender_id uuid,
  sender_username text,
  sender_display_name text,
  origin_city_name text,
  origin_country_code text,
  distance_km double precision,
  sent_at timestamptz,
  arrived_at timestamptz,
  opened_at timestamptz,
  preview text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
  after_at timestamptz;
  after_id uuid;
begin
  perform private.deliver_due_messages(caller);

  if list_inbox.older_than is not null then
    select c.deliver_at, c.id into after_at, after_id
    from public.messages c
    where c.id = list_inbox.older_than
      and c.recipient_id = caller
      and c.delivered_at is not null;

    if not found then
      raise exception 'the letter this page continues from is gone'
        using errcode = 'P0001', hint = 'cursor_not_found';
    end if;
  end if;

  return query
    select
      m.id,
      s.id,
      s.username,
      s.display_name,
      origin.name,
      origin.country_code,
      m.distance_km,
      m.sent_at,
      m.deliver_at,
      m.opened_at,
      left(m.body, 200)
    from public.messages m
    join public.profiles s on s.id = m.sender_id
    join public.cities origin on origin.id = m.origin_city_id
    where m.recipient_id = caller
      and m.delivered_at is not null
      and not private.has_blocked(caller, m.sender_id)
      and (after_id is null or (m.deliver_at, m.id) < (after_at, after_id))
    order by m.deliver_at desc, m.id desc
    limit least(greatest(coalesce(list_inbox.max_results, 50), 1), 100);
end;
$$;

-- As before, except that a letter from someone the caller has blocked is
-- refused like any letter that is not theirs to read, and is not marked opened.
create or replace function public.read_message(message_id uuid)
returns table (
  id uuid,
  direction text,
  other_id uuid,
  other_username text,
  other_display_name text,
  origin_city_name text,
  origin_country_code text,
  destination_city_name text,
  destination_country_code text,
  distance_km double precision,
  sent_at timestamptz,
  deliver_at timestamptz,
  delivered boolean,
  opened_at timestamptz,
  body text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  perform private.deliver_due_messages(caller);

  update public.messages m
  set opened_at = now()
  where m.id = read_message.message_id
    and m.recipient_id = caller
    and m.delivered_at is not null
    and m.opened_at is null
    and not private.has_blocked(caller, m.sender_id);

  return query
    select
      m.id,
      case when m.sender_id = caller then 'sent' else 'received' end,
      other.id,
      other.username,
      other.display_name,
      origin.name,
      origin.country_code,
      destination.name,
      destination.country_code,
      m.distance_km,
      m.sent_at,
      m.deliver_at,
      m.delivered_at is not null,
      case when m.recipient_id = caller then m.opened_at end,
      m.body
    from public.messages m
    join public.profiles other
      on other.id = case when m.sender_id = caller then m.recipient_id else m.sender_id end
    join public.cities origin on origin.id = m.origin_city_id
    join public.cities destination on destination.id = m.destination_city_id
    where m.id = read_message.message_id
      and (
        m.sender_id = caller
        or (
          m.recipient_id = caller
          and m.delivered_at is not null
          and not private.has_blocked(caller, m.sender_id)
        )
      );

  if not found then
    raise exception 'no such letter'
      using errcode = 'P0001', hint = 'message_not_found';
  end if;
end;
$$;

-- As before, without counting letters the caller cannot see.
create or replace function public.get_badges()
returns table (unread_messages integer, friend_requests integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  perform private.deliver_due_messages(caller);

  return query
    select
      (
        select count(*)::integer
        from public.messages m
        where m.recipient_id = caller
          and m.delivered_at is not null
          and m.opened_at is null
          and not private.has_blocked(caller, m.sender_id)
      ),
      (
        select count(*)::integer
        from public.friendships f
        where f.addressee_id = caller
          and f.status = 'pending'
      );
end;
$$;

/* -------------------------------------------------------------------------- */
/* Privileges                                                                  */
/* -------------------------------------------------------------------------- */

revoke all on function public.block_courier(uuid) from public, anon;
revoke all on function public.unblock_courier(uuid) from public, anon;
revoke all on function public.list_blocked() from public, anon;
revoke all on function public.report_letter(uuid, text, text, boolean) from public, anon;
revoke all on function public.report_courier(uuid, text, text, boolean) from public, anon;

grant execute on function public.block_courier(uuid) to authenticated;
grant execute on function public.unblock_courier(uuid) to authenticated;
grant execute on function public.list_blocked() to authenticated;
grant execute on function public.report_letter(uuid, text, text, boolean) to authenticated;
grant execute on function public.report_courier(uuid, text, text, boolean) to authenticated;

/* -------------------------------------------------------------------------- */
/* Retention                                                                   */
/* -------------------------------------------------------------------------- */

-- As with delivery: scheduled where pg_cron exists (Supabase, hosted and
-- local), and skipped where it does not (the tests, CI).
do $$
begin
  if not exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available: old reports will not be removed on a schedule.';
    return;
  end if;

  create extension if not exists pg_cron;

  perform cron.schedule(
    'forget-old-reports',
    '17 3 * * *',
    'select private.forget_old_reports()'
  );
end;
$$;
