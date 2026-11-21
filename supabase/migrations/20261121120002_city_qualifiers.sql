-- Night Courier - two towns of the same name say where each of them is.
--
-- 28 pairs of cities share their name and their country - Friedberg in Hessen
-- and in Bavaria, Hamm in Westphalia and in Hamburg, Langen, Senden, Mülheim,
-- Sankt Peter in Carinthia and in Graz, and twenty more abroad - and the
-- picker listed each pair as the same row twice. A courier in Friedberg
-- (Hessen) could not tell which was hers, and the first she tapped counted at
-- once. (Found in review.)
--
-- GeoNames has the state each town is in, but not in the file this list is
-- built from, and nothing can be downloaded where this was written. So what
-- tells a town apart is worked out from what the table holds already: where
-- the town is, and how many people live in the towns around it.
--
--   * The town is named by a larger city near it, of the same country and of
--     a name of its own: within 30 km the largest such city - "near Augsburg",
--     "near Frankfurt am Main" - and otherwise the nearest larger one.
--   * That city is called near when it is within 50 km. Farther, the distance
--     is given instead, so that nothing is called near that is not: "131 km
--     from San Pedro Sula".
--   * Should the two towns of a pair come out alike, each gives its distance
--     instead. None does today.
--   * A town with no larger city in its country is named by the nearest city
--     of any size. None is like that today either.
--
-- Checked for every pair (cities.db.test.mjs): each of the 56 rows has one,
-- the two rows of a pair read differently, each "near" is within 50 km, and
-- every distance is the one the database measures.
--
-- scripts/build-cities.mjs works out the same for the cities it writes.

alter table public.cities add column qualifier text;

comment on column public.cities.qualifier is
  'What tells this city apart from another of the same name in the same country, '
  'shown after its name: "near Augsburg", or "131 km from San Pedro Sula". Null for '
  'a city whose name is its own in its country.';

with twins as (
  select c.*
  from public.cities c
  where exists (
    select 1
    from public.cities same
    where same.name = c.name
      and same.country_code = c.country_code
      and same.id <> c.id
  )
),
named as (
  select t.id, t.name, t.country_code, place.name as place, place.km
  from twins t
  cross join lateral (
    select o.name, o.km
    from (
      select o.id, o.name, o.population,
             private.distance_km(t.latitude, t.longitude, o.latitude, o.longitude) as km
      from public.cities o
      where o.country_code = t.country_code
        and o.name <> t.name
        and not exists (
          select 1
          from public.cities same
          where same.name = o.name
            and same.country_code = o.country_code
            and same.id <> o.id
        )
    ) o
    order by
      -- A larger city within 30 km, the largest of them first;
      (o.population > t.population and o.km <= 30) desc,
      case when o.population > t.population and o.km <= 30 then o.population end desc nulls last,
      -- then the nearest larger city; then the nearest of any size.
      (o.population > t.population) desc,
      o.km,
      o.population desc,
      o.id
    limit 1
  ) place
),
worded as (
  select n.id, n.name, n.country_code,
         case
           when n.km <= 50 then 'near ' || n.place
           else round(n.km::numeric)::text || ' km from ' || n.place
         end as near,
         round(n.km::numeric)::text || ' km from ' || n.place as far
  from named n
),
told_apart as (
  select w.id,
         case
           when count(*) over (partition by w.name, w.country_code, w.near) > 1 then w.far
           else w.near
         end as qualifier
  from worded w
)
update public.cities c
set qualifier = t.qualifier
from told_apart t
where t.id = c.id;

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

-- As before (see the city search migration), returning the qualifier too.
-- What a function returns cannot be changed in place, so it is made anew.
drop function public.search_cities(text, integer);

create function public.search_cities(
  folded_query text,
  max_results integer default 20
)
returns table (id integer, name text, country_code text, population integer, qualifier text)
language sql
stable
set search_path = ''
as $$
  with q as materialized (
    select regexp_replace(
      lower(left(coalesce(folded_query, ''), 64)),
      '[^a-z0-9 .''-]', '', 'g'
    ) as term
  )
  select c.id, c.name, c.country_code, c.population, c.qualifier
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

revoke all on function public.search_cities(text, integer) from public, anon;
grant execute on function public.search_cities(text, integer) to authenticated;
