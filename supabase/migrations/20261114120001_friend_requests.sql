-- Night Courier - friend requests, kept within bounds.
--
-- Review flooded one courier with 1,005 requests from throwaway accounts, and
-- three things gave way:
--
--   * The friends list came back newest first, and the API hands over at most
--     a thousand rows of any answer. The courier's real friends were cut off
--     the end of it: the app said "No friends yet", and a letter could be
--     addressed to nobody.
--   * Nothing limited asking. One account could put a request - and with it a
--     name of its own choosing - in front of every courier whose username it
--     could find, and ask again the moment it was declined.
--   * "Withdraw" on a request the other person had accepted a moment before
--     ended the friendship instead, without telling either of them.
--
-- The list now puts friends first. One account can make twenty new requests in
-- an hour. And taking a request back is its own function, which refuses once
-- the request is no longer one.
--
-- What this does not do: it does not stop usernames being guessed. A request
-- to a name nobody has is refused as before, however often it is made, and
-- leaves nothing behind to count - a refusal undoes whatever the same call
-- wrote. What is limited is how many couriers one account can reach in an
-- hour, and with that how many usernames it can confirm to exist.

/* -------------------------------------------------------------------------- */
/* The list, friends first                                                    */
/* -------------------------------------------------------------------------- */

-- As before (see the suspended accounts migration), in a different order:
-- accepted friendships first, then requests, each newest first. However many
-- requests are waiting, what the row cap cuts off is requests. The app sorts
-- each group for itself, so nothing changes on screen.
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
    order by (f.status = 'accepted') desc, f.created_at desc, f.id;
end;
$$;

revoke all on function public.list_friends() from public, anon;
grant execute on function public.list_friends() to authenticated;

/* -------------------------------------------------------------------------- */
/* How many new requests in an hour                                           */
/* -------------------------------------------------------------------------- */

-- Enough to find everyone you know on your first evening; not enough to work
-- through a list of names. FRIEND_REQUESTS_PER_HOUR in src/constants/config.ts;
-- the parity test checks the two agree.
create or replace function private.friend_requests_per_hour()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20
$$;

-- The smallest record that can hold a courier to that: one row each, saying
-- when the hour being counted began and how many new requests have been made
-- in it. Nothing here says who was asked. It goes with the account, and the
-- daily tidy-up removes a row a day after its hour began.
--
-- In the schema the API cannot reach: only request_friend reads or writes it.
create table private.friend_request_counts (
  courier_id uuid primary key references public.profiles (id) on delete cascade,
  hour_began_at timestamptz not null default now(),
  requests integer not null default 1,

  constraint friend_request_counts_positive check (requests > 0)
);

comment on table private.friend_request_counts is
  'How many new friend requests a courier has made in the hour that began at hour_began_at. Written only by request_friend; removed with the account, or by the tidy-up after a day.';

revoke all on table private.friend_request_counts from public, anon, authenticated;

-- Whether the courier has used up the hour's new requests.
--
-- A courier's requests are counted one call at a time, under a lock held until
-- the call's transaction ends, exactly as reports are (see
-- private.over_report_limit in the safety migration): counted side by side,
-- forty calls sent at once would each see nineteen. Volatile, so that the
-- count is read after the lock is held rather than from a snapshot taken while
-- waiting for it.
create or replace function private.over_friend_request_limit(courier uuid)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'friend-request-limit:' || over_friend_request_limit.courier::text,
      0
    )
  );

  return exists (
    select 1
    from private.friend_request_counts c
    where c.courier_id = over_friend_request_limit.courier
      and c.hour_began_at > now() - interval '1 hour'
      and c.requests >= private.friend_requests_per_hour()
  );
end;
$$;

-- Counts one new request: the next in the hour under way, or the first of a
-- new hour if the last one is over. Called only under the lock above.
create or replace function private.count_friend_request(courier uuid)
returns void
language sql
set search_path = ''
as $$
  insert into private.friend_request_counts as c (courier_id, hour_began_at, requests)
  values (count_friend_request.courier, now(), 1)
  on conflict (courier_id) do update
  set hour_began_at = case
        when c.hour_began_at > now() - interval '1 hour' then c.hour_began_at
        else now()
      end,
      requests = case
        when c.hour_began_at > now() - interval '1 hour' then c.requests + 1
        else 1
      end
$$;

revoke all on function private.friend_requests_per_hour() from public, anon, authenticated;
revoke all on function private.over_friend_request_limit(uuid) from public, anon, authenticated;
revoke all on function private.count_friend_request(uuid) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Asking, within the limit                                                   */
/* -------------------------------------------------------------------------- */

-- As before (see the safety migration), with the limit:
--
--   * A call counts when it makes a new request - the ones answered
--     'requested'. Asking again, asking a friend, and answering someone who
--     asked first make nothing new and are not counted; neither is a refusal.
--   * A request counts whatever becomes of it. Taken back or declined, it has
--     still been put in front of someone; otherwise asking, being declined and
--     asking again would never run out.
--   * Once the hour's requests are used up, every call is refused until the
--     hour is over. That is decided first, before the username is looked up,
--     so the refusal is the same for a name that exists and one that does
--     not, and cannot be used to go on finding out which is which.
--
-- A request that is waiting for the caller can still be accepted while they
-- are over the limit: accept_friend is not asking.
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
  if private.over_friend_request_limit(caller) then
    raise exception 'too many friend requests in an hour'
      using errcode = 'P0001', hint = 'too_many_friend_requests';
  end if;

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

  perform private.lock_pair(caller, target);

  if private.has_blocked(caller, target) then
    raise exception 'the caller has blocked that courier'
      using errcode = 'P0001', hint = 'courier_blocked';
  end if;

  if private.has_blocked(target, caller) then
    raise exception 'no courier has that username'
      using errcode = 'P0001', hint = 'unknown_username';
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
      perform private.count_friend_request(caller);
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

revoke all on function public.request_friend(text) from public, anon;
grant execute on function public.request_friend(text) to authenticated;

/* -------------------------------------------------------------------------- */
/* Taking a request back                                                      */
/* -------------------------------------------------------------------------- */

-- Deletes a request the caller made, while it is still only a request.
--
-- remove_friend deletes whatever the row has become. That is right for
-- declining and for ending a friendship, where the person has just said which
-- they mean. It was wrong for "Withdraw": the app shows that button on a list
-- it loaded a while ago, and if the other person had accepted since, the same
-- call ended a friendship neither of them had asked to end. (Found in review.)
--
-- This refuses instead - as accept_friend refuses a request that is no longer
-- waiting, and for every reason alike: accepted, already gone, or never the
-- caller's to take back. The row is judged by the statement that deletes it,
-- so an acceptance arriving at the same moment either comes first and stands,
-- or finds the request gone.
--
-- remove_friend is unchanged, and still serves declining and parting.
create or replace function public.withdraw_request(friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  delete from public.friendships f
  where f.id = withdraw_request.friendship_id
    and f.requester_id = caller
    and f.status = 'pending';

  if not found then
    raise exception 'no such request of the caller''s is waiting'
      using errcode = 'P0001', hint = 'request_not_found';
  end if;
end;
$$;

revoke all on function public.withdraw_request(uuid) from public, anon;
grant execute on function public.withdraw_request(uuid) to authenticated;

comment on table public.friendships is
  'One row per pair of couriers, whichever of them asked. Written only through request_friend, accept_friend, withdraw_request, remove_friend, and the blocking and report functions, which end a friendship.';

/* -------------------------------------------------------------------------- */
/* The daily tidy-up, with one more thing to forget                           */
/* -------------------------------------------------------------------------- */

-- As before (see the privacy migration), and then the counts above. A count
-- matters for an hour; a day later all it says is when a courier was last busy
-- asking. A row that a request is counting on at this very moment is in use,
-- not old, and is passed over rather than waited for: this job holds what it
-- has touched until it ends, and must not stand in a request's way, nor wait
-- on one.
create or replace function private.tidy_up()
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  skipped text[] := '{}';
begin
  begin
    delete from auth.audit_log_entries a
    where a.created_at < now() - private.sign_in_record_retention();
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('sign-in log: ' || sqlerrm);
  end;

  -- The profile is the record of who someone is; handle_new_user has read
  -- these by the time this runs. GoTrue keeps a second copy in the email
  -- identity, which travels nowhere but is kept all the same.
  begin
    update auth.users u
    set raw_user_meta_data = u.raw_user_meta_data - 'username' - 'display_name'
    where u.raw_user_meta_data ?| array['username', 'display_name'];
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('sign-up names: ' || sqlerrm);
  end;

  begin
    update auth.identities i
    set identity_data = i.identity_data - 'username' - 'display_name'
    where i.identity_data ?| array['username', 'display_name'];
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('sign-up names in identities: ' || sqlerrm);
  end;

  -- GoTrue stamps updated_at each time a session is renewed, so it is when the
  -- session was last used. Deleting a session takes its refresh tokens with
  -- it; the app is then refused its next renewal and asks to sign in.
  begin
    delete from auth.sessions s
    where coalesce(s.updated_at, s.created_at) < now() - private.idle_session_lifetime();
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('idle sessions: ' || sqlerrm);
  end;

  -- A removed account is a sign-in without a profile, kept banned. Once the
  -- ban has run out, it goes - and with it everything still hanging off it.
  begin
    delete from auth.users u
    where u.banned_until is not null
      and u.banned_until < now()
      and not exists (select 1 from public.profiles p where p.id = u.id);
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('expired bans: ' || sqlerrm);
  end;

  -- A sign-up whose address was never confirmed, profile and all. (While
  -- confirmation is off, GoTrue confirms every address at sign-up, and this
  -- finds nothing.)
  begin
    delete from auth.users u
    where u.email_confirmed_at is null
      and u.created_at < now() - private.unconfirmed_sign_up_lifetime();
  exception
    when undefined_table or invalid_schema_name or undefined_column or insufficient_privilege then
      skipped := skipped || ('unconfirmed sign-ups: ' || sqlerrm);
  end;

  -- The old city only matters while a move settles (see the flight migration).
  update public.profiles p
  set settled_city_id = null, city_changed_at = null
  where p.settled_city_id is not null
    and p.city_changed_at <= now() - private.relocation_period();

  -- How many friend requests someone made only matters for an hour.
  delete from private.friend_request_counts c
  where c.courier_id in (
    select stale.courier_id
    from private.friend_request_counts stale
    where stale.hour_began_at < now() - interval '1 day'
    for update skip locked
  );

  begin
    delete from cron.job_run_details d
    where d.end_time < now() - interval '7 days';
  exception
    when undefined_table or invalid_schema_name or insufficient_privilege then
      skipped := skipped || ('pg_cron run log: ' || sqlerrm);
  end;

  return skipped;
end;
$$;

revoke all on function private.tidy_up() from public, anon, authenticated;
