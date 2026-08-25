-- Night Courier - city reference data, and the city on a profile.
--
-- Delivery time is derived from the distance between two cities, so the
-- coordinates must be data the client cannot choose. If the app sent latitude
-- and longitude, any user could claim to live next door to the recipient and
-- forge a short flight. The client therefore sends a city id and nothing else,
-- and Phase 8 reads the coordinates from this table.
--
-- The data itself is generated - see scripts/build-cities.mjs and the migration
-- that sorts immediately after this one.

create table public.cities (
  -- GeoNames ids, which are stable across dumps, so re-seeding updates rows in
  -- place rather than renumbering them and orphaning every profile.
  id integer primary key,
  name text not null,
  country_code text not null,
  latitude double precision not null,
  longitude double precision not null,
  population integer not null default 0,

  -- Lower-cased, diacritic-folded, pipe-delimited names, primary name first.
  -- Built at generation time; see `fold()` in src/features/cities/search.ts,
  -- which must produce the same form for a query to match.
  search_index text not null,

  constraint cities_country_code_length check (char_length(country_code) = 2),
  constraint cities_latitude_range check (latitude between -90 and 90),
  constraint cities_longitude_range check (longitude between -180 and 180)
);

comment on table public.cities is
  'Public reference data from GeoNames (CC BY 4.0). Not personal data. Read-only to clients.';

-- No index on search_index: the table holds a few thousand rows, and the alias
-- match needs a leading wildcard that no btree index would serve anyway. A
-- sequential scan over this is well under a millisecond. Revisit only if the
-- population cut-off in the generator is ever lowered substantially.
create index cities_population_idx on public.cities (population desc);

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

-- Takes an already-folded query, because the folding rules live in one place -
-- the generator that built `search_index` and the client that mirrors it. The
-- query is re-sanitised here regardless: it arrives from a client, and letting
-- an unfiltered string reach a LIKE pattern would let `%` match every city.
create or replace function public.search_cities(
  folded_query text,
  max_results integer default 20
)
returns table (id integer, name text, country_code text, population integer)
language sql
stable
set search_path = ''
as $$
  with q as (
    select regexp_replace(lower(coalesce(folded_query, '')), '[^a-z0-9 .''-]', '', 'g') as term
  )
  select c.id, c.name, c.country_code, c.population
  from public.cities c, q
  where char_length(q.term) >= 2
    and (c.search_index like q.term || '%' or c.search_index like '%|' || q.term || '%')
  order by
    -- Ranking, most specific first. An exact match on any name or alias must
    -- outrank a mere prefix match, or "wien" ranks Wiener Neustadt (whose own
    -- name starts with it) above Vienna (for which it is the exact German
    -- name). Wrapping both sides in pipes turns "contains the term" into
    -- "contains the whole term".
    (('|' || c.search_index || '|') like ('%|' || q.term || '|%')) desc,
    -- Then a city whose own name begins with the query, before one where only
    -- an alias does.
    (c.search_index like q.term || '%') desc,
    -- Then the larger place, which is the one more people mean.
    c.population desc
  limit least(greatest(coalesce(max_results, 20), 1), 50)
$$;

/* -------------------------------------------------------------------------- */
/* The city on a profile                                                       */
/* -------------------------------------------------------------------------- */

-- Replaces the free-text `city` column added in the previous migration. It was
-- never populated, and a name without coordinates cannot produce a distance.
alter table public.profiles drop column city;

alter table public.profiles
  add column city_id integer references public.cities (id) on delete set null;

comment on column public.profiles.city_id is
  'Where this user keeps their roost. Null until chosen; no messages can be sent without one.';

/* -------------------------------------------------------------------------- */
/* Row level security                                                          */
/* -------------------------------------------------------------------------- */

alter table public.cities enable row level security;
alter table public.cities force row level security;

-- Public reference data, readable by any signed-in user. Deliberately no
-- INSERT, UPDATE or DELETE policy: the table is maintained only by migrations.
create policy cities_select_all on public.cities
  for select
  to authenticated
  using (true);

grant select on public.cities to authenticated;
grant execute on function public.search_cities(text, integer) to authenticated;
revoke all on function public.search_cities(text, integer) from public, anon;
