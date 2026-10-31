-- Night Courier - how far a bat flies, and for how long.
--
-- Delivery time is computed here and nowhere else. The client never sends a
-- coordinate, a distance or an arrival time: it names a recipient, and the
-- database reads both cities from its own table, measures between them, and
-- decides when the letter lands. A client that could influence any of those
-- could make its own bats fast.

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

-- One row. `time_multiplier` scales every flight: 1 in production, lower in a
-- development project so that a two-day flight can be watched in minutes:
--
--   update private.flight_settings set time_multiplier = 0.01;
--
-- It can only ever make flights shorter than real time, never longer, and never
-- zero - "nothing is ever delivered instantly" holds at every setting. Only the
-- operator can change it: the API roles cannot reach this schema at all.
create table private.flight_settings (
  singleton boolean primary key default true,
  -- PRODUCTION_TIME_MULTIPLIER in src/constants/config.ts.
  time_multiplier double precision not null default 1,

  constraint flight_settings_singleton check (singleton),
  constraint flight_settings_multiplier_range check (time_multiplier > 0 and time_multiplier <= 1)
);

insert into private.flight_settings default values;

/* -------------------------------------------------------------------------- */
/* Distance                                                                    */
/* -------------------------------------------------------------------------- */

-- Great-circle distance by the haversine formula, on a sphere of the Earth's
-- mean radius. The sphere is off by up to about half a percent against the real
-- ellipsoid, which is far finer than city-level coordinates are anyway.
create or replace function private.distance_km(
  from_latitude double precision,
  from_longitude double precision,
  to_latitude double precision,
  to_longitude double precision
)
returns double precision
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select 2 * 6371.0088 * asin(least(1.0, sqrt(
    sin(radians(to_latitude - from_latitude) / 2) ^ 2
    + cos(radians(from_latitude)) * cos(radians(to_latitude))
      * sin(radians(to_longitude - from_longitude) / 2) ^ 2
  )))
$$;

/* -------------------------------------------------------------------------- */
/* Duration                                                                    */
/* -------------------------------------------------------------------------- */

-- distance / speed, with a floor so that no flight is ever instant - two
-- friends in the same city would otherwise exchange letters in seconds - and
-- the whole of it scaled by the multiplier.
--
-- The floor is scaled too. In a development project that is the point: at 0.01
-- the 20-minute minimum becomes 12 seconds and a same-city letter can be
-- watched landing. In production the multiplier is 1 and the floor is 20
-- minutes exactly.
--
-- 80 km/h is BAT_SPEED_KMH and 20 minutes is MINIMUM_FLIGHT_MINUTES in
-- src/constants/config.ts. src/tests/db/parity.db.test.mjs reads that file and
-- fails if these numbers drift from it.
--
-- STRICT, so an unknown distance yields an unknown duration. Without it,
-- greatest() would skip the null and every route with a missing city would
-- quote the 20-minute floor as if it were a real flight time.
create or replace function private.flight_duration(distance_km double precision)
returns interval
language sql
stable
strict
set search_path = ''
as $$
  select make_interval(secs =>
    greatest(20 * 60.0, flight_duration.distance_km / 80.0 * 3600.0)
    * coalesce((select s.time_multiplier from private.flight_settings s), 1)
  )
$$;

revoke all on function private.distance_km(double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
revoke all on function private.flight_duration(double precision) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Where a flight leaves from                                                  */
/* -------------------------------------------------------------------------- */

-- Keeping coordinates on the server stops a client inventing a location, but a
-- courier can still choose any real city, and changing it is one request. On its
-- own that would let them switch to a friend's city, send a twenty-minute
-- letter, and switch back - choosing their own flight time, which is the one
-- thing computing delivery here exists to prevent. (Found in review.)
--
-- So a new city takes a day to become where a courier's bats fly from - and to:
-- letters to them aim for it only from then on, too. Until then, flights use the
-- city they are leaving. A courier's first city takes effect at once, so a new
-- account can write straight away; moving back within the day cancels the move.
-- Borrowing a city therefore means living in it for a day, during which every
-- letter, to everyone, leaves from there - which is not borrowing.
--
-- 24 hours is RELOCATION_HOURS in src/constants/config.ts; the parity test
-- checks the two agree.
create or replace function private.relocation_period()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '24 hours'
$$;

alter table public.profiles
  add column city_changed_at timestamptz,
  add column settled_city_id integer references public.cities (id) on delete set null;

comment on column public.profiles.settled_city_id is
  'While a move is settling: the city flights still use. Null when the current city is in effect.';
comment on column public.profiles.city_changed_at is
  'When the city last changed to one that is not yet in effect. Null when none is pending.';

-- Maintains the two columns above whenever city_id changes. Neither can be
-- written by a client: the column grants on profiles cover only display_name
-- and city_id.
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

  if departing is null or new.city_id is not distinct from departing then
    -- A first city, or a move back to where the bats still are: in effect now.
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

create trigger profiles_settle_city
  before update of city_id on public.profiles
  for each row execute function private.settle_city();

-- The city a courier's letters leave from, and arrive at. Every distance this
-- app measures goes through here.
create or replace function private.flight_city(courier uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when p.settled_city_id is not null
      and p.city_changed_at > now() - private.relocation_period()
      then p.settled_city_id
    else p.city_id
  end
  from public.profiles p
  where p.id = flight_city.courier
$$;

revoke all on function private.relocation_period() from public, anon, authenticated;
revoke all on function private.settle_city() from public, anon, authenticated;
revoke all on function private.flight_city(uuid) from public, anon, authenticated;
