-- Night Courier - a move before the first letter counts at once.
--
-- A first city counts at once and every later change takes a day (see the
-- flight migration). So a first city chosen by mistake - the other Friedberg,
-- a slip on the list - and put right a minute later stood for a whole day:
-- every flight to and from the courier, and what friends were shown, used the
-- wrong town. (Found in review.)
--
-- The day's wait is there so that nobody can move to shorten a flight. Until a
-- letter has gone to or from a courier, there is no flight to shorten: a move
-- can count at once, as the first choice did. From the first letter on - sent,
-- in the air, or landed - the day's wait holds as before.
--
-- Whether a courier has had a letter is kept on the profile rather than looked
-- up among the letters, for three reasons:
--
--   * Letters go when either account goes. That a courier has had one does
--     not: "never had a letter" is a fact about them, not about what is left.
--   * The profile is what a move locks. A send takes the profiles of both
--     couriers before it reads where they are, for their first letter, so a
--     move and a first letter that meet come out one after the other: the move
--     waits for the letter and then takes a day, or the letter waits for the
--     move and flies from the new city. Never the letter timed from the old
--     city while the move counts at once as if no letter had gone - which is
--     the borrowed city again. (concurrency.pg.test.mjs holds the two open
--     against each other.)
--   * The app reads it with the rest of the profile, so the city picker can
--     say which a move will be, and save "at once" only while that is so.
--
-- In the one order every request takes rows in (see the one lock order and
-- courier gate migrations), the profiles come after the couriers' gates and
-- before any letter or bat: a send passes the gates, takes the two profiles
-- in the order of their ids - only for a first letter; afterwards there is
-- nothing to take - and then lands, claims and writes as before. (So two
-- first letters of one courier, or to one, wait for each other until the
-- first has gone: milliseconds, once in a courier's life.) A move holds
-- its own profile and takes nothing else, so it never waits for anything a
-- send holds after the profiles. Whatever ends an account closes its gate
-- before it takes anything, so it is never holding a profile that a send
-- passing that gate is waiting for.
--
-- A letter in the air is never timed again: a move changes no letter, here as
-- before.
--
-- What this does not change (find_db-messaging.json, minor note 5): a courier
-- who has had letters, clears their city with a direct update, and lets the
-- day pass, has no city in effect - and the next city counts at once, as a
-- first city does. Closing that would need a pending move from no city to
-- mean no city for its day, in flight_city, in what the app says, and in the
-- tidy-up; the price of the way round stays a day nobody can write to them.

alter table public.profiles
  add column has_corresponded boolean not null default false;

comment on column public.profiles.has_corresponded is
  'Whether a letter has ever gone to or from this courier. Until then a move counts at once; '
  'from then on it takes a day (see private.settle_city). Set by send_message, never unset.';

-- Everyone who has sent or received a letter that is still there. Letters
-- that went with an account before this migration are not known any more.
update public.profiles p
set has_corresponded = true
where exists (
  select 1
  from public.messages m
  where m.sender_id = p.id
     or m.recipient_id = p.id
);

-- A courier who has had no letter and is still waiting for a move to settle
-- would not have waited under the rule above: their move counts now.
update public.profiles p
set settled_city_id = null,
    city_changed_at = null
where not p.has_corresponded
  and (p.settled_city_id is not null or p.city_changed_at is not null);

/* -------------------------------------------------------------------------- */
/* A move                                                                     */
/* -------------------------------------------------------------------------- */

-- As before (see the flight migration), except that a move by a courier who
-- has had no letter counts at once, as a first city does. The row is the one
-- being updated, which this request holds: a send that has taken it for a
-- first letter has made this wait until it ended, and what it wrote is what
-- is read here.
create or replace function private.settle_city()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Where the courier's bats leave from as this change arrives.
  departing integer;
begin
  if new.city_id is not distinct from old.city_id then
    return new;
  end if;

  departing := case
    when old.settled_city_id is not null
      and old.city_changed_at > now() - private.relocation_period()
      then old.settled_city_id
    else old.city_id
  end;

  if not new.has_corresponded
    or departing is null
    or new.city_id is not distinct from departing then
    -- No letter yet, a first city, or a move back to where the bats still
    -- are: in effect now.
    new.settled_city_id := null;
    new.city_changed_at := null;
  else
    -- The bats stay where they are for a day - from now, so that moving on
    -- again before they have settled restarts the wait rather than skipping it.
    new.settled_city_id := departing;
    new.city_changed_at := now();
  end if;

  return new;
end;
$$;

revoke all on function private.settle_city() from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

-- As before (see the courier gate migration), except that a first letter, of
-- either courier, takes their profiles before anything is read about where
-- they are, and marks that both have now had a letter.
create or replace function public.send_message(
  recipient_id uuid,
  body text,
  client_ref uuid default null
)
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
  violated text;
begin
  -- A repeat of a send that already went: answer with what it created. A
  -- repeat of one that is still going waits here until it has gone, or failed.
  if send_message.client_ref is not null then
    perform private.lock_send(caller, send_message.client_ref);

    return query
      select m.id, m.deliver_at, m.distance_km
      from public.messages m
      where m.sender_id = caller
        and m.client_ref = send_message.client_ref;
    if found then
      return;
    end if;
  end if;

  if send_message.body is null or not private.has_visible_character(send_message.body) then
    raise exception 'a letter needs at least one word'
      using errcode = 'P0001', hint = 'empty_message';
  end if;

  if char_length(send_message.body) > 2000 then
    raise exception 'a letter can be at most 2000 characters'
      using errcode = 'P0001', hint = 'message_too_long';
  end if;

  perform private.keep_couriers(array[caller, send_message.recipient_id]);

  if send_message.recipient_id is null
    or not private.are_friends(caller, send_message.recipient_id) then
    raise exception 'letters can only be sent to friends'
      using errcode = 'P0001', hint = 'not_friends';
  end if;

  -- The first letter of either courier ends the time in which their moves
  -- count at once (see private.settle_city). A move of theirs that is being
  -- made now has to finish before this reads where they are, and one that
  -- comes after has to wait for this to end: so the profiles are taken here,
  -- in the order of their ids, and kept. Once both have had a letter there is
  -- nothing left to take, and nothing waits.
  perform 1
  from public.profiles p
  where p.id in (caller, send_message.recipient_id)
    and not p.has_corresponded
  order by p.id
  for no key update;

  update public.profiles p
  set has_corresponded = true
  where p.id in (caller, send_message.recipient_id)
    and not p.has_corresponded;

  -- From where the sender's bats are, to where the recipient's are: a city
  -- chosen less than a day ago does not count yet (see private.flight_city).
  select c.* into origin
  from public.cities c
  where c.id = private.flight_city(caller);

  if not found then
    raise exception 'choose a city before sending a letter'
      using errcode = 'P0001', hint = 'sender_has_no_city';
  end if;

  select c.* into destination
  from public.cities c
  where c.id = private.flight_city(send_message.recipient_id);

  if not found then
    raise exception 'the recipient has not chosen a city yet'
      using errcode = 'P0001', hint = 'recipient_has_no_city';
  end if;

  -- A bat whose flight is over, but which the scheduler has not reached yet,
  -- is home in every sense that matters. Bring it in before deciding that none
  -- are free.
  perform private.deliver_due_messages(caller);

  -- The claim and the letter stand or fall together: see the handler below.
  begin
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
      origin_city_id, destination_city_id, distance_km, deliver_at, client_ref
    )
    values (
      caller, send_message.recipient_id, claimed, send_message.body,
      origin.id, destination.id, km, arrival, send_message.client_ref
    )
    returning id into created;
  exception when unique_violation then
    -- Two repeats of the same send at once: the other one committed first.
    -- Leaving this block has undone this one's claim on a bat, so the courier
    -- is charged once; answer with the letter that went.
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'messages_client_ref_idx' then
      raise;
    end if;
    return query
      select m.id, m.deliver_at, m.distance_km
      from public.messages m
      where m.sender_id = caller
        and m.client_ref = send_message.client_ref;
    return;
  end;

  return query select created, arrival, km;
end;
$$;

revoke all on function public.send_message(uuid, text, uuid) from public, anon;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
