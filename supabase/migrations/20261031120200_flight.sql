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
