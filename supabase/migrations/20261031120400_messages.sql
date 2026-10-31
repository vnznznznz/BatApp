-- Night Courier - letters, the bats that carry them, and their delivery.
--
-- This is the correctness centre of the application. Three rules from the
-- README are enforced here and nowhere else:
--
--   * Sending a letter takes exactly one bat, and a courier with no bat at home
--     cannot send.
--   * Nothing is ever delivered instantly, and the client never decides when
--     anything arrives.
--   * A bat comes home when its letter lands, and not before.
--
-- The app calls send_message() and nothing else to send. The delivery worker,
-- deliver_due_messages(), lands letters whose time has come and brings their
-- bats home; it is scheduled by pg_cron in the next migration, and also runs for
-- one courier whenever they open the app, so that no letter waits on the
-- scheduler to be read and no bat waits on it to fly again.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  -- The bat that carried it. History is kept after the bat comes home; the
  -- unique index below is what stops a bat carrying two letters at once.
  bat_id uuid not null references public.bats (id) on delete cascade,
  body text not null,
  -- Where it flew from and to, as they were when it left. Moving house later
  -- does not reroute a bat already in the air.
  origin_city_id integer not null references public.cities (id),
  destination_city_id integer not null references public.cities (id),
  distance_km double precision not null,
  sent_at timestamptz not null default now(),
  -- When it lands. Computed by send_message() from the distance; no client
  -- ever supplies it.
  deliver_at timestamptz not null,
  -- When the worker processed the landing. Normally within a minute of
  -- deliver_at; it is bookkeeping, and the app shows deliver_at as the arrival.
  delivered_at timestamptz,
  -- When the recipient first opened it. The recipient's own business: no
  -- function ever shows it to the sender. There are no read receipts.
  opened_at timestamptz,

  constraint messages_not_to_self check (sender_id <> recipient_id),
  -- 2000 is MESSAGE_MAX_LENGTH in src/constants/config.ts.
  constraint messages_body_length check (char_length(body) between 1 and 2000),
  constraint messages_body_has_words check (body ~ '\S'),
  constraint messages_distance_valid check (distance_km >= 0),
  constraint messages_never_instant check (deliver_at > sent_at),
  constraint messages_delivered_when_due check (delivered_at is null or delivered_at >= deliver_at),
  constraint messages_opened_after_delivery check (
    opened_at is null or (delivered_at is not null and opened_at >= delivered_at)
  )
);

comment on table public.messages is
  'Letters. No client reads or writes this table directly: see send_message and the functions in the reading migration.';

-- A bat carries one letter at a time. This is the database's own guarantee,
-- independent of the locking in send_message(): two concurrent sends that both
-- believed the same bat was free could not both commit.
create unique index messages_one_flight_per_bat on public.messages (bat_id)
  where delivered_at is null;

-- What the worker scans: letters still in the air, oldest arrival first.
create index messages_in_flight_idx on public.messages (deliver_at)
  where delivered_at is null;

create index messages_recipient_idx on public.messages (recipient_id, deliver_at desc);
create index messages_sender_idx on public.messages (sender_id, sent_at desc);

/* -------------------------------------------------------------------------- */
/* Delivery                                                                    */
/* -------------------------------------------------------------------------- */

-- Lands every letter whose time has come, and brings each one's bat home, in a
-- single statement - so a letter is never delivered without its bat returning,
-- or the other way round.
--
-- Idempotent: a letter is landed only while `delivered_at` is null, so running
-- this twice delivers nothing the second time, and two runs that overlap never
-- land the same letter twice.
--
-- It runs in two ways, and they lock differently on purpose.
--
-- As the scheduled worker (`for_user` null) it uses `skip locked`: two runs that
-- overlap divide the due letters between them, and a letter one run holds is
-- that run's to finish. Nothing is waiting on the worker, so it never waits.
--
-- With `for_user`, it runs inside a request from the app, for the letters that
-- courier sent or is due to receive, so that correctness never depends on the
-- schedule: if pg_cron stopped tomorrow, letters would still be readable and
-- bats still home on time, the moment anybody involved looked. Here it WAITS
-- for a lock instead of skipping, because the caller is about to read the
-- result. Skipping was the original design, and it was wrong: the home screen
-- asks for the roost and the badges at the same instant a bat is due, both
-- requests try to land the same letter, and the one that skipped it went on to
-- report the bat as still flying - with nothing left to prompt another look.
-- Waiting costs the length of the other transaction, a few milliseconds, and
-- cannot deadlock: every caller takes the locks in the same order.
create or replace function private.deliver_due_messages(for_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  landed_count integer;
begin
  if for_user is null then
    with due as materialized (
      select m.id
      from public.messages m
      where m.delivered_at is null
        and m.deliver_at <= now()
      order by m.deliver_at, m.id
      for update skip locked
    ),
    landed as (
      update public.messages m
      set delivered_at = now()
      from due
      where m.id = due.id
        and m.delivered_at is null
      returning m.bat_id
    ),
    homecoming as (
      update public.bats b
      set status = 'available', updated_at = now()
      from landed
      where b.id = landed.bat_id
        and b.status = 'flying'
      returning b.id
    )
    select count(*)::integer into landed_count from landed;
  else
    with due as materialized (
      select m.id
      from public.messages m
      where m.delivered_at is null
        and m.deliver_at <= now()
        and for_user in (m.sender_id, m.recipient_id)
      order by m.deliver_at, m.id
      -- Rechecked after the wait: a letter another transaction landed while
      -- this one queued no longer matches `delivered_at is null`, and drops out.
      for update
    ),
    landed as (
      update public.messages m
      set delivered_at = now()
      from due
      where m.id = due.id
        and m.delivered_at is null
      returning m.bat_id
    ),
    homecoming as (
      update public.bats b
      set status = 'available', updated_at = now()
      from landed
      where b.id = landed.bat_id
        and b.status = 'flying'
      returning b.id
    )
    select count(*)::integer into landed_count from landed;
  end if;

  return landed_count;
end;
$$;

revoke all on function private.deliver_due_messages(uuid) from public, anon, authenticated;

-- A letter that disappears mid-flight must not strand its bat. That happens
-- when the recipient deletes their account: the cascade removes the letters
-- addressed to them, and without this the sender's bat would be "flying"
-- forever - one of three, gone for good.
create or replace function private.release_bat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bats b
  set status = 'available', updated_at = now()
  where b.id = old.bat_id
    and b.status = 'flying';
  return old;
end;
$$;

revoke all on function private.release_bat() from public, anon, authenticated;

create trigger messages_release_bat
  after delete on public.messages
  for each row
  when (old.delivered_at is null)
  execute function private.release_bat();

/* -------------------------------------------------------------------------- */
/* Sending                                                                     */
/* -------------------------------------------------------------------------- */

-- The only way a letter is created. It takes a recipient and some words, and
-- decides everything else itself: which bat, how far, and when it lands.
--
-- The reservation is the heart of it. The subquery takes the caller's first bat
-- that is at home, locking it; `skip locked` means a second send running at the
-- same moment passes over that bat and takes the next one rather than queueing
-- for it, and the one that finds none left gets nothing. Postgres re-checks the
-- row after taking the lock, so a bat that left between the snapshot and the
-- lock is skipped as well. Behind that, the outer `status = 'available'` and the
-- unique index on in-flight bats are second and third lines of defence.
--
-- None of this can be exercised by PGlite, which is a single connection;
-- src/tests/db/concurrency.pg.test.mjs runs real concurrent sends against a real
-- Postgres.
create or replace function public.send_message(recipient_id uuid, body text)
returns table (message_id uuid, deliver_at timestamptz, distance_km double precision)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
  origin public.cities;
  destination public.cities;
  claimed uuid;
  km double precision;
  arrival timestamptz;
  created uuid;
begin
  if send_message.body is null or send_message.body !~ '\S' then
    raise exception 'a letter needs at least one word'
      using errcode = 'P0001', hint = 'empty_message';
  end if;

  if char_length(send_message.body) > 2000 then
    raise exception 'a letter can be at most 2000 characters'
      using errcode = 'P0001', hint = 'message_too_long';
  end if;

  if send_message.recipient_id is null
    or not private.are_friends(caller, send_message.recipient_id) then
    raise exception 'letters can only be sent to friends'
      using errcode = 'P0001', hint = 'not_friends';
  end if;

  select c.* into origin
  from public.profiles p
  join public.cities c on c.id = p.city_id
  where p.id = caller;

  if not found then
    raise exception 'choose a city before sending a letter'
      using errcode = 'P0001', hint = 'sender_has_no_city';
  end if;

  select c.* into destination
  from public.profiles p
  join public.cities c on c.id = p.city_id
  where p.id = send_message.recipient_id;

  if not found then
    raise exception 'the recipient has not chosen a city yet'
      using errcode = 'P0001', hint = 'recipient_has_no_city';
  end if;

  -- A bat whose flight is over, but which the scheduler has not reached yet,
  -- is home in every sense that matters. Bring it in before deciding that none
  -- are free.
  perform private.deliver_due_messages(caller);

  update public.bats b
  set status = 'flying', updated_at = now()
  where b.id = (
      select free.id
      from public.bats free
      where free.owner_id = caller
        and free.status = 'available'
      order by free.slot
      limit 1
      for update skip locked
    )
    and b.status = 'available'
  returning b.id into claimed;

  if claimed is null then
    raise exception 'every bat is out flying'
      using errcode = 'P0001', hint = 'no_available_bat';
  end if;

  km := private.distance_km(origin.latitude, origin.longitude, destination.latitude, destination.longitude);
  arrival := now() + private.flight_duration(km);

  insert into public.messages (
    sender_id, recipient_id, bat_id, body,
    origin_city_id, destination_city_id, distance_km, deliver_at
  )
  values (
    caller, send_message.recipient_id, claimed, send_message.body,
    origin.id, destination.id, km, arrival
  )
  returning id into created;

  return query select created, arrival, km;
end;
$$;

/* -------------------------------------------------------------------------- */
/* Row level security and privileges                                           */
/* -------------------------------------------------------------------------- */

alter table public.messages enable row level security;
alter table public.messages force row level security;

-- Deliberately no policies and no grants. Every read goes through a function
-- that chooses, column by column, what each side may see: the recipient sees
-- nothing until the letter lands, and the sender never sees `opened_at`. A
-- SELECT policy would hand over whole rows, and a whole row is a read receipt.
revoke all on table public.messages from anon, authenticated;

revoke all on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;
