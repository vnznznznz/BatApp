-- Night Courier - an account the operator has stopped is stopped at once.
--
-- The operator stops an account by banning its sign-in: for a week after a
-- threat, while nothing is deleted yet, and for two years after a removal
-- (docs/GO-LIVE.md, "Handling a report"). Supabase Auth honours the ban - no
-- sign-in, no renewal - but the access token an app already holds is checked by
-- nobody but the database, and stays good for up to an hour. The database never
-- looked. In that hour a suspended account could go on writing to people, and
-- it could delete itself: the letters the reporter was promised a week to copy,
-- the sign-in records kept for the police, and the banned sign-in itself, so
-- that the same email address signed up again at once. (Found in review,
-- against the real stack.)
--
-- Now the database looks: in the one place every function a client can reach
-- starts from, and again inside the deletion itself. What a suspended account
-- can still do until its token runs out is read what is its own or public - its
-- own profile row, the bare rows of its own friendships, the list of cities -
-- and nothing that reaches anyone else.
--
-- Also here, the operator's two ways of ending an account. Removing one now
-- says so when there was nothing to remove, or nothing left to. And deleting
-- one on request, with no ban, gets a function that takes the account's rows in
-- the same order as everything else does, in place of the dashboard's button,
-- which does not.

/* -------------------------------------------------------------------------- */
/* Who is stopped                                                              */
/* -------------------------------------------------------------------------- */

-- Whether the operator has stopped this account: its sign-in is banned, and the
-- ban has not run out. That is an account suspended after a threat, and equally
-- the sign-in a removed account leaves behind. A ban that has run out or been
-- lifted counts for nothing, which is how Supabase Auth reads the column too.
--
-- SECURITY DEFINER because the answer is in auth.users, which only the owner of
-- these functions can read. Whoever asks - private.caller() from inside an API
-- function, or the trigger below from inside a client's own update - it is read
-- with the owner's rights, and nothing but yes or no comes back.
create or replace function private.is_suspended(courier uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = is_suspended.courier
      and u.banned_until > now()
  )
$$;

revoke all on function private.is_suspended(uuid) from public, anon, authenticated;

-- The caller's id, or a refusal: for a request that carries no sign-in, as
-- before (see the friendships migration), and now for one whose account is
-- suspended. Every function a client can reach starts here, so this is where
-- "at once" becomes true for all of them.
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

  if private.is_suspended(id) then
    raise exception 'this account is suspended'
      using errcode = 'P0001', hint = 'account_suspended';
  end if;

  return id;
end;
$$;

revoke all on function private.caller() from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* The two lists that did not start there                                     */
/* -------------------------------------------------------------------------- */

-- list_friends and list_blocked were single statements that asked auth.uid()
-- themselves, so the check above passed them by: a suspended account could
-- still read its friends' names and cities. They now start with
-- private.caller() like every other function. What they return has not changed.
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
    order by f.created_at desc, f.id;
end;
$$;

create or replace function public.list_blocked()
returns table (courier_id uuid, username text, blocked_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  return query
    select p.id, p.username, k.created_at
    from public.blocks k
    join public.profiles p on p.id = k.blocked_id
    where k.blocker_id = caller
    order by k.created_at desc, p.username;
end;
$$;

revoke all on function public.list_friends() from public, anon;
revoke all on function public.list_blocked() from public, anon;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.list_blocked() to authenticated;

/* -------------------------------------------------------------------------- */
/* The profile, which a client writes without a function                      */
/* -------------------------------------------------------------------------- */

-- A courier changes their name and their city by updating their own profile
-- row: no function stands in between for the check to live in. And a name is
-- shown to friends, on letters, and to anyone the courier has asked to be
-- friends - so a suspended account that could still change it could still put
-- words in front of people.
--
-- A policy cannot ask: policies run as the client's own role, which can reach
-- neither auth.users nor this schema. A trigger function runs with its owner's
-- rights when it says so. It refuses an update made by the suspended account
-- itself - the sign-in the request carries - and no other: the operator can
-- still change such a profile, to take a name down, say, and the daily tidy-up
-- carries no sign-in at all.
create or replace function private.refuse_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_suspended(auth.uid()) then
    raise exception 'this account is suspended'
      using errcode = 'P0001', hint = 'account_suspended';
  end if;
  return null;
end;
$$;

revoke all on function private.refuse_suspended() from public, anon, authenticated;

-- Once for the statement, before any row: nothing about the answer depends on
-- which rows the update would have reached.
create trigger profiles_refuse_suspended
  before update on public.profiles
  for each statement execute function private.refuse_suspended();

/* -------------------------------------------------------------------------- */
/* Deleting your own account                                                  */
/* -------------------------------------------------------------------------- */

-- As before (see the privacy migration), except that an account the operator
-- has stopped cannot delete itself. For an account suspended after a threat,
-- that would delete what the suspension exists to keep for a week. For a
-- removed account, it would delete the sign-in whose ban is what keeps the
-- same email address from signing up again. Either is now the operator's to
-- delete (private.delete_account, below).
--
-- private.caller() refuses a suspension that already stands. But the operator
-- can suspend while this is running - it waits for every row it is about to
-- delete - and a check made before the wait cannot see that. So the ban is
-- also a condition of the DELETE itself: once Postgres holds the row, it looks
-- at it again as it then is. (A check before the delete was tried first, and
-- lost exactly this race.)
--
-- A second call for an account that is already gone - a second phone - still
-- finds nothing to do, and says nothing.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  perform private.lock_courier_rows(caller);

  delete from auth.users u
  where u.id = caller
    and (u.banned_until is null or u.banned_until <= now());

  if not found and exists (select 1 from auth.users u where u.id = caller) then
    raise exception 'this account is suspended'
      using errcode = 'P0001', hint = 'account_suspended';
  end if;

  begin
    delete from auth.audit_log_entries a
    where a.payload ->> 'actor_id' = caller::text;
  exception
    when undefined_table or insufficient_privilege then null;
  end;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

/* -------------------------------------------------------------------------- */
/* Taking an account away, and saying what happened                           */
/* -------------------------------------------------------------------------- */

-- As before (see the privacy migration), with two silences ended:
--
--   * It checked that the account existed and then waited for the account's
--     rows. If the courier deleted the account in the meantime - the very thing
--     it was waiting for - it banned nothing, deleted nothing, and returned as
--     if it had. It now looks at the sign-in once it holds it, and says so when
--     there is none.
--   * Run a second time on an account already removed, it set the ban again:
--     two years from the second run, where the privacy policy says two years
--     from the removal. It now refuses, and says until when the ban stands.
--
-- Removing an account that was suspended first still sets the ban afresh, as
-- the runbook describes: that account has its profile, and its two years count
-- from now, the removal.
--
-- The sign-in is taken last, after the account's other rows, which is the
-- order delete_own_account takes them in. The other way round, a removal and
-- the courier's own deletion could each hold what the other needs.
create or replace function private.remove_account(courier uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  banned timestamptz;
begin
  perform private.lock_courier_rows(courier);

  select u.banned_until into banned
  from auth.users u
  where u.id = courier
  for update;

  if not found then
    raise exception 'there is no account %', courier using errcode = 'P0002';
  end if;

  -- A removed account is a sign-in without a profile, kept banned.
  if banned is not null
     and not exists (select 1 from public.profiles p where p.id = courier) then
    raise exception 'account % has already been removed: its sign-in stays banned until %',
      courier, banned;
  end if;

  update auth.users u
  set banned_until = now() + private.ban_period()
  where u.id = courier;

  delete from public.profiles p where p.id = courier;
end;
$$;

revoke all on function private.remove_account(uuid) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Deleting an account for someone                                            */
/* -------------------------------------------------------------------------- */

-- How the operator deletes an account that is asked for rather than earned: a
-- courier who wants theirs gone and cannot sign in, a child's, an address that
-- was never the person's to sign up with. Everything goes, as when a courier
-- deletes their own - the sign-in, all it holds, its sign-in records - and
-- nothing is held against the address: there is no ban, and it can sign up
-- again at once. It deletes a suspended or removed account as well, ban and
-- all, because that decision is the operator's.
--
-- The dashboard's "Delete user" is not this. It is one bare delete of the
-- sign-in, and the cascade from there reaches a courier's bats before their
-- letters - the opposite of the order a landing takes them in. That is the
-- deadlock delete_own_account was rewritten to avoid (see the messages
-- migration), and review reproduced it with the dashboard's statement: a
-- letter landing at that moment, and one of the two fails. This takes the rows
-- in the one order everything else does.
--
-- Not callable through the API: the operator runs it in the SQL editor.
create or replace function private.delete_account(courier uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.lock_courier_rows(courier);

  delete from auth.users u where u.id = courier;

  if not found then
    raise exception 'there is no account %', courier using errcode = 'P0002';
  end if;

  begin
    delete from auth.audit_log_entries a
    where a.payload ->> 'actor_id' = courier::text;
  exception
    when undefined_table or insufficient_privilege then null;
  end;
end;
$$;

revoke all on function private.delete_account(uuid) from public, anon, authenticated;
