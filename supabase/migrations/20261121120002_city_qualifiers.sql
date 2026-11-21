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
-- the two rows of a pair read differently, each names a larger city of a
-- name of its own, each "near" is within 50 km, and every distance is the one
-- the database measures. The rules no real pair reaches are tried on towns
-- made up for the purpose.
--
-- It comes wherever the app reads a city with its country: from the search,
-- with the courier's own city and the one a move is settling away from (the
-- profile reads those from the table), with a friend's city in the friends
-- list, and with both ends of a letter in the inbox, the sent list and the
-- letter itself. A friend in Friedberg (Hessen) was "Friedberg, DE" in all of
-- those, the trouble the picker had seen from the friend's side. (Found in
-- review.)

alter table public.cities add column qualifier text;

comment on column public.cities.qualifier is
  'What tells this city apart from another of the same name in the same country, '
  'shown after its name: "near Augsburg", or "131 km from San Pedro Sula". Null for '
  'a city whose name is its own in its country. Set by private.qualify_cities().';

/* -------------------------------------------------------------------------- */
/* The rule                                                                   */
/* -------------------------------------------------------------------------- */

-- What tells apart every city that shares its name and country with another,
-- worked out over the whole table, and null for every other city: as above.
--
-- Run here for the rows there are, and again at the end of every migration
-- scripts/build-cities.mjs writes. Such a migration holds the cities of one
-- dump, and a town that has dropped out of the dump stays in the table: among
-- the dump's cities alone, its twin would look like the only town of its
-- name, and lose what tells it apart. (Found in review.) So the rule lives
-- here, once, and the generator only calls it.
create function private.qualify_cities()
returns void
language sql
set search_path = ''
as $$
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
  from public.cities every
  left join told_apart t on t.id = every.id
  where every.id = c.id
    and c.qualifier is distinct from t.qualifier;
$$;

revoke all on function private.qualify_cities() from public, anon, authenticated;

select private.qualify_cities();

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

-- As before (see the city search migration), returning the qualifier too,
-- and ranking a city whose own name begins with the query by the name as it
-- is written, or, for a query with a whole saint in it, in the form with
-- "sankt".
--
-- The spelling rules gave the saints one form in the index, and while that
-- form led each row's terms, "Sai" and "Sain" no longer ranked Saint Paul,
-- Saint-Louis and Saint-Marc by their own names, nor "St" St. Louis and St.
-- Petersburg: they fell out of the twenty shown. "San" ranked Saint
-- Petersburg as if its name began so, and pushed Sāngli out. (Found in
-- review.) The written form leads each row's terms again, and the form with
-- "sankt" counts once a saint has been typed whole - "St. Pe" begins St.
-- Petersburg as surely as "Sankt Pe" does.
--
-- Asked for every part of every city's own name that had the city among the
-- twenty before the spelling rules (30,759 things to type), nine cities drop
-- out for one of them, each pushed out by a city that is now found by its own
-- name, which the generator had passed over for an apostrophe or a comma in
-- it: Xi'an for "Xi", Ta'if and Tai'an for "Ta", Lu'an for "Lu", Ra's Bayrut
-- for "Ra", Mianzhu for "Mi", and three more like them. Those now rank as
-- cities whose own name begins with the query, as they always should have. So
-- do the districts of Zürich, named "Zürich (Kreis 11)" and the like: they
-- fill the twenty for "Zur", where towns that only an alias begins with used
-- to come after Zürich itself.
--
-- The saints' form is worked out with private.search_form, which only the
-- owner may call, so this now runs with its owner's rights, like the rest of
-- the API. It reads nothing but the cities, which every signed-in courier may
-- read.
--
-- What a function returns cannot be changed in place, so it is made anew.
drop function public.search_cities(text, integer);

create function public.search_cities(
  folded_query text,
  max_results integer default 20
)
returns table (id integer, name text, country_code text, population integer, qualifier text)
language sql
stable
security definer
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
    -- an alias does. The first term is the own name as it is written; once a
    -- whole saint has been typed, it counts in the saints' form too.
    (
      c.search_index like q.term || '%'
      or (
        q.term ~ '(^|[ -])sankt([ -]|$)'
        and private.search_form(split_part(c.search_index, '|', 1)) like q.term || '%'
      )
    ) desc,
    -- Then the larger place, which is the one more people mean.
    c.population desc
  limit least(greatest(coalesce(max_results, 20), 1), 50)
$$;

revoke all on function public.search_cities(text, integer) from public, anon;
grant execute on function public.search_cities(text, integer) to authenticated;

/* -------------------------------------------------------------------------- */
/* Friends and letters                                                        */
/* -------------------------------------------------------------------------- */

-- Each as before, returning beside a city's name and country what tells it
-- apart, under the same conditions as the name: a friend's city only once
-- the two are friends. What a function returns cannot be changed in place,
-- so each is made anew, with its grants.

-- As before (see the friend requests migration), with city_qualifier.
drop function public.list_friends();

create function public.list_friends()
returns table (
  friendship_id uuid,
  status text,
  direction text,
  friend_id uuid,
  username text,
  display_name text,
  city_name text,
  country_code text,
  city_qualifier text,
  distance_km double precision,
  flight_seconds integer,
  requested_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  return query
    select
      f.id,
      f.status,
      case when f.requester_id = me.id then 'outgoing' else 'incoming' end,
      friend.id,
      friend.username,
      case when f.status = 'accepted' or f.requester_id = friend.id then friend.display_name end,
      case when f.status = 'accepted' then city.name end,
      case when f.status = 'accepted' then city.country_code end,
      case when f.status = 'accepted' then city.qualifier end,
      route.km,
      round(extract(epoch from private.flight_duration(route.km)))::integer,
      f.created_at,
      f.accepted_at
    from public.profiles me
    join public.friendships f
      on me.id in (f.requester_id, f.addressee_id)
    join public.profiles friend
      on friend.id = case when f.requester_id = me.id then f.addressee_id else f.requester_id end
    -- Where letters actually fly between - see private.flight_city - so the
    -- estimate is the flight a letter sent now would take, even mid-move.
    left join public.cities city on city.id = private.flight_city(friend.id)
    left join public.cities home on home.id = private.flight_city(me.id)
    left join lateral (
      select private.distance_km(home.latitude, home.longitude, city.latitude, city.longitude) as km
      where f.status = 'accepted'
    ) as route on true
    where me.id = caller
    order by (f.status = 'accepted') desc, f.created_at desc, f.id;
end;
$$;

revoke all on function public.list_friends() from public, anon;
grant execute on function public.list_friends() to authenticated;

-- As before (see the safety migration), with origin_qualifier.
drop function public.list_inbox(integer, uuid);

create function public.list_inbox(
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
  origin_qualifier text,
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
      origin.qualifier,
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

revoke all on function public.list_inbox(integer, uuid) from public, anon;
grant execute on function public.list_inbox(integer, uuid) to authenticated;

-- As before (see the safety migration), with destination_qualifier.
drop function public.list_sent(integer, uuid);

create function public.list_sent(
  max_results integer default 50,
  older_than uuid default null
)
returns table (
  message_id uuid,
  recipient_id uuid,
  recipient_username text,
  recipient_display_name text,
  destination_city_name text,
  destination_country_code text,
  destination_qualifier text,
  distance_km double precision,
  sent_at timestamptz,
  deliver_at timestamptz,
  delivered boolean,
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

  if list_sent.older_than is not null then
    select c.sent_at, c.id into after_at, after_id
    from public.messages c
    where c.id = list_sent.older_than
      and c.sender_id = caller;

    if not found then
      raise exception 'the letter this page continues from is gone'
        using errcode = 'P0001', hint = 'cursor_not_found';
    end if;
  end if;

  return query
    select
      m.id,
      r.id,
      r.username,
      case when not private.has_blocked(caller, r.id) then r.display_name end,
      destination.name,
      destination.country_code,
      destination.qualifier,
      m.distance_km,
      m.sent_at,
      m.deliver_at,
      m.delivered_at is not null,
      left(m.body, 200)
    from public.messages m
    join public.profiles r on r.id = m.recipient_id
    join public.cities destination on destination.id = m.destination_city_id
    where m.sender_id = caller
      and (after_id is null or (m.sent_at, m.id) < (after_at, after_id))
    order by m.sent_at desc, m.id desc
    limit least(greatest(coalesce(list_sent.max_results, 50), 1), 100);
end;
$$;

revoke all on function public.list_sent(integer, uuid) from public, anon;
grant execute on function public.list_sent(integer, uuid) to authenticated;

-- As before (see the reading in order migration), with origin_qualifier and
-- destination_qualifier.
drop function public.read_message(uuid);

create function public.read_message(message_id uuid)
returns table (
  id uuid,
  direction text,
  other_id uuid,
  other_username text,
  other_display_name text,
  origin_city_name text,
  origin_country_code text,
  origin_qualifier text,
  destination_city_name text,
  destination_country_code text,
  destination_qualifier text,
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
  -- The second half is the same letter the update below marks, by the same
  -- conditions; the first is what deliver_due_messages is about to land.
  perform 1
  from public.messages m
  where caller in (m.sender_id, m.recipient_id)
    and (
      (m.delivered_at is null and m.deliver_at <= now())
      or (
        m.id = read_message.message_id
        and m.recipient_id = caller
        and m.delivered_at is not null
        and m.opened_at is null
        and not private.has_blocked(caller, m.sender_id)
      )
    )
  order by m.deliver_at, m.id
  for update;

  perform private.deliver_due_messages(caller);

  update public.messages m
  set opened_at = greatest(now(), m.delivered_at)
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
      case when not private.has_blocked(caller, other.id) then other.display_name end,
      origin.name,
      origin.country_code,
      origin.qualifier,
      destination.name,
      destination.country_code,
      destination.qualifier,
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

revoke all on function public.read_message(uuid) from public, anon;
grant execute on function public.read_message(uuid) to authenticated;
