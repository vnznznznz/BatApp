-- Night Courier - friends.
--
-- Letters only travel between friends, and a friendship takes two people: one
-- asks by username, the other accepts. Until then, neither learns where the
-- other lives.
--
-- Profiles stay readable only by their owner. Everything one courier may know
-- about another is served by list_friends() below, which picks the columns by
-- hand: a policy granting "friends can read each other's profile" would grant
-- whole rows, and a row holds more than a friend needs and much more than a
-- stranger with a pending request should get.

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,

  constraint friendships_not_self check (requester_id <> addressee_id),
  constraint friendships_status_known check (status in ('pending', 'accepted')),
  constraint friendships_accepted_at_matches check ((status = 'accepted') = (accepted_at is not null))
);

comment on table public.friendships is
  'One row per pair of couriers, whichever of them asked. Written only through request_friend, accept_friend and remove_friend.';

-- One row per pair, whichever direction the request went. Without this, two
-- people who ask each other at the same moment would hold two pending requests,
-- and "are these two friends" would have two answers.
create unique index friendships_pair_idx on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- The pair index leads with least(...), so it cannot serve a lookup by either
-- column alone - which is what listing and the cascades on account deletion do.
create index friendships_requester_idx on public.friendships (requester_id);
create index friendships_addressee_idx on public.friendships (addressee_id);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

-- The caller's id, or a refusal. Every function a client can reach starts here.
create or replace function private.caller()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  id uuid := auth.uid();
begin
  if id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  return id;
end;
$$;

create or replace function private.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(are_friends.a, are_friends.b)
      and greatest(f.requester_id, f.addressee_id) = greatest(are_friends.a, are_friends.b)
  )
$$;

revoke all on function private.caller() from public, anon, authenticated;
revoke all on function private.are_friends(uuid, uuid) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Asking                                                                      */
/* -------------------------------------------------------------------------- */

-- Returns what happened rather than raising for the cases that are not
-- mistakes, so the app can say so plainly:
--
--   'requested'          a new request is waiting for them
--   'already_requested'  one already was
--   'accepted'           they had already asked you, so you are now friends
--   'already_friends'    you already were
--
-- The username is matched exactly, never by prefix, so this cannot be used to
-- browse who is on the service. It does reveal whether a username exists; that
-- is inherent in finding friends by username, and it reveals nothing else.
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

/* -------------------------------------------------------------------------- */
/* Answering, and ending                                                       */
/* -------------------------------------------------------------------------- */

-- Only the person who was asked can accept.
create or replace function public.accept_friend(friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  update public.friendships f
  set status = 'accepted', accepted_at = now()
  where f.id = accept_friend.friendship_id
    and f.addressee_id = caller
    and f.status = 'pending';

  if not found then
    raise exception 'no such request is waiting for you'
      using errcode = 'P0001', hint = 'request_not_found';
  end if;
end;
$$;

-- Declining a request, withdrawing one, and ending a friendship are the same
-- act - the row goes - and either side may do it. Letters already in the air
-- still arrive: they were sent between friends, and a bat cannot be recalled.
create or replace function public.remove_friend(friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  delete from public.friendships f
  where f.id = remove_friend.friendship_id
    and caller in (f.requester_id, f.addressee_id);

  if not found then
    raise exception 'no such friendship'
      using errcode = 'P0001', hint = 'friendship_not_found';
  end if;
end;
$$;

/* -------------------------------------------------------------------------- */
/* Listing                                                                     */
/* -------------------------------------------------------------------------- */

-- Everyone the caller has a friendship row with, and exactly as much about each
-- of them as that row entitles the caller to:
--
--   accepted          name, username, city, and how long a bat takes to reach them
--   asked you         name and username - they chose to introduce themselves
--   you asked         username only - they have agreed to nothing yet, so a
--                     stranger who guesses a username learns no more than that
--                     it exists
--
-- Distance and flight time are the server's numbers, multiplier included, so
-- the estimate on the compose screen is the flight the bat will actually fly.
create or replace function public.list_friends()
returns table (
  friendship_id uuid,
  status text,
  direction text,
  friend_id uuid,
  username text,
  display_name text,
  city_name text,
  country_code text,
  distance_km double precision,
  flight_seconds integer,
  requested_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id,
    f.status,
    case when f.requester_id = me.id then 'outgoing' else 'incoming' end,
    friend.id,
    friend.username,
    case when f.status = 'accepted' or f.requester_id = friend.id then friend.display_name end,
    case when f.status = 'accepted' then city.name end,
    case when f.status = 'accepted' then city.country_code end,
    route.km,
    round(extract(epoch from private.flight_duration(route.km)))::integer,
    f.created_at,
    f.accepted_at
  from public.profiles me
  join public.friendships f
    on me.id in (f.requester_id, f.addressee_id)
  join public.profiles friend
    on friend.id = case when f.requester_id = me.id then f.addressee_id else f.requester_id end
  left join public.cities city on city.id = friend.city_id
  left join public.cities home on home.id = me.city_id
  left join lateral (
    select private.distance_km(home.latitude, home.longitude, city.latitude, city.longitude) as km
    where f.status = 'accepted'
  ) as route on true
  where me.id = (select auth.uid())
  order by f.created_at desc, f.id
$$;

/* -------------------------------------------------------------------------- */
/* Row level security and privileges                                           */
/* -------------------------------------------------------------------------- */

alter table public.friendships enable row level security;
alter table public.friendships force row level security;

-- Each side can see the row itself. What it says about the other person is
-- list_friends()'s business, not this table's.
create policy friendships_select_own on public.friendships
  for select
  to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

revoke all on table public.friendships from anon, authenticated;
grant select on table public.friendships to authenticated;

revoke all on function public.request_friend(text) from public, anon;
revoke all on function public.accept_friend(uuid) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.list_friends() from public, anon;

grant execute on function public.request_friend(text) to authenticated;
grant execute on function public.accept_friend(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friends() to authenticated;
