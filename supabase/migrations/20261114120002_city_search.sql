-- Night Courier - a city search that costs the same however much is sent.
--
-- search_cities takes whatever a client sends as its query, and tidies it
-- before matching. Two things about that were wrong together:
--
--   * The query could be any length.
--   * The tidying was written once, in a `with` clause, but Postgres folds a
--     clause like that into the query that uses it - and then ran it again for
--     every one of the 4,310 cities, over the whole of whatever was sent.
--
-- So the cost of a search grew with the length of the query. On the real
-- stack, 10,000 characters took most of a second, and 100,000 ran until the
-- API's eight-second statement timeout cancelled them: one request holding a
-- database connection and a core for that long, from any signed-in account,
-- as often as it liked. An ordinary search takes 20 milliseconds. (Found in
-- review.)
--
-- As before (see the cities migration), with the first line of the query
-- changed in two ways:
--
--   * Only the first 64 characters are read. No name or alias in the list is
--     longer than 40, so a longer query could never have matched anything,
--     and what the app sends is unaffected. This is the part that matters:
--     megabytes now cost what 64 characters cost.
--   * `materialized`, so that the tidying runs once and its result is reused,
--     as it was always meant to. On its own this was not enough - sixteen
--     megabytes still ran for many seconds - and beside the cut it no longer
--     shows; it is here so that the query does what it says.
--
-- The tests could not see any of this. PGlite is PostgreSQL 18, which plans
-- the function differently and answered the same queries in milliseconds. The
-- guard now runs against a real Postgres, in concurrency.pg.test.mjs.
create or replace function public.search_cities(
  folded_query text,
  max_results integer default 20
)
returns table (id integer, name text, country_code text, population integer)
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

revoke all on function public.search_cities(text, integer) from public, anon;
grant execute on function public.search_cities(text, integer) to authenticated;
