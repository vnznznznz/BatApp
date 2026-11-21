-- Night Courier - nothing new is written about a courier whose account is ending.
--
-- Whatever ends an account takes every row of the account's first, in one
-- order (see the one lock order migration), so that it never waits for a row
-- while it holds one that somebody else is waiting for. But it can only take
-- the rows there are. Review found what gets past that, through the API
-- alone and for every way an account ends - its owner's deletion, the
-- operator's removal and deletion, the tidy-up's:
--
--   * Yara asks Xavier to be friends while his account is being ended, after
--     its rows were taken: the request is written at once. She blocks him
--     straight after. The block ends the request, holding its row, and then
--     writes itself, for which it needs Xavier's profile. The end of his
--     account holds the profile, and wants the request's row. Postgres stops
--     one of the two, and it was the end of the account.
--   * The other order is no better. The one lock order migration had a block
--     end the friendship before writing itself, because a friendship the end
--     of an account had already taken deadlocked the block the other way
--     round. Review tried the old order back: it mended this case and broke
--     that one. No order of a block's two steps serves both.
--   * A letter, a request, a block or a report that reached the profile while
--     it was being deleted waited for it - and then failed on a foreign key,
--     a raw database error where a moment later the app would have been told
--     that there is no such courier.
--
-- So each courier now has a gate. Whatever writes a row that names couriers -
-- a friend request, a letter, a block, a report - passes their gates before
-- it touches a row, and holds them until it ends; any number of such writes
-- can hold the same gate at once. Whatever ends an account closes the
-- account's gate before it takes the rows, which waits for every write
-- already holding it, and makes every write that comes after wait until the
-- account is gone. A write that waited asks again whether the courier is
-- there, and is refused as if it had come a moment later.
--
-- What writes no new row passes no gate. Accepting, withdrawing and declining
-- a request, ending a friendship and lifting a block each change one row they
-- find, and wait for nothing once they hold it: the end of an account may wait
-- for them, but never they for it while holding anything it needs. Landing and
-- reading letters take their rows in the one order already (see the reading in
-- order migration).
--
-- Gates are taken in one order as well, by their keys. The tidy-up closes the
-- gates of every sign-up it deletes together, and a write passes two; taken in
-- any order, each could hold a gate the other wants.

/* -------------------------------------------------------------------------- */
/* The gate                                                                   */
/* -------------------------------------------------------------------------- */

-- The advisory lock that is a courier's gate. The prefix keeps it apart from
-- the other advisory locks these functions take.
create or replace function private.courier_lock_key(courier uuid)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.hashtextextended('courier:' || courier_lock_key.courier::text, 0)
$$;

-- Passes the gates of these couriers, for a write that is about to name them:
-- none of their accounts can end until the calling transaction does. If one
-- is ending now, this waits until it has ended; the caller then finds that
-- courier gone and refuses as it would for any courier who is.
--
-- The caller's own account can be among those that end while this waits, and
-- the operator removing it is one way. So the caller is asked about once more
-- afterwards, exactly as every request is asked at its start.
create or replace function private.keep_couriers(couriers uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  key bigint;
begin
  for key in
    select distinct private.courier_lock_key(c.id)
    from unnest(keep_couriers.couriers) as c (id)
    where c.id is not null
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock_shared(key);
  end loop;

  perform private.caller();
end;
$$;

-- As before (see the one lock order migration), except that it first closes
-- the gates of the couriers whose rows it takes, and keeps them closed until
-- the calling transaction ends: the end of an account, which called it, is
-- over by then. Once a gate is closed, no row naming that courier can be
-- written that the rows taken here leave out.
create or replace function private.lock_rows_of_couriers(couriers uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  key bigint;
begin
  for key in
    select distinct private.courier_lock_key(c.id)
    from unnest(lock_rows_of_couriers.couriers) as c (id)
    where c.id is not null
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(key);
  end loop;

  perform 1
  from public.messages m
  where m.sender_id = any (couriers) or m.recipient_id = any (couriers)
  order by m.deliver_at, m.id
  for update;

  perform 1
  from public.bats b
  where b.owner_id = any (couriers)
  order by b.owner_id, b.slot
  for update;

  perform 1
  from public.friendships f
  where f.requester_id = any (couriers) or f.addressee_id = any (couriers)
  order by f.id
  for update;

  perform 1
  from public.blocks k
  where k.blocker_id = any (couriers) or k.blocked_id = any (couriers)
  order by k.blocker_id, k.blocked_id
  for update;

  perform 1
  from public.reports r
  where r.reporter_id = any (couriers) or r.reported_id = any (couriers)
  order by r.id
  for update;
end;
$$;

revoke all on function private.courier_lock_key(uuid) from public, anon, authenticated;
revoke all on function private.keep_couriers(uuid[]) from public, anon, authenticated;
revoke all on function private.lock_rows_of_couriers(uuid[]) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Asking                                                                     */
/* -------------------------------------------------------------------------- */

-- As before (see the friend requests migration), except that it passes the
-- gates of both couriers once it knows who is being asked, and a courier
-- whose account ended in the meantime is a username nobody has.
--
-- The hour's limit is still decided first, before the username is looked up,
-- and so before the gates. It holds a lock of its own while this waits at a
-- gate; nothing that ends an account ever asks for that lock.
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

  perform private.keep_couriers(array[caller, target]);

  if not exists (select 1 from public.profiles p where p.id = target) then
    raise exception 'no courier has that username'
      using errcode = 'P0001', hint = 'unknown_username';
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
/* Blocking and reporting                                                     */
/* -------------------------------------------------------------------------- */

-- As before (see the safety migration), except that whether the courier is
-- there is asked once their gate is passed.
create or replace function public.block_courier(courier_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  if block_courier.courier_id = caller then
    raise exception 'a courier cannot block themselves'
      using errcode = 'P0001', hint = 'cannot_block_self';
  end if;

  perform private.keep_couriers(array[caller, block_courier.courier_id]);

  if not exists (select 1 from public.profiles p where p.id = block_courier.courier_id) then
    raise exception 'no such courier'
      using errcode = 'P0001', hint = 'courier_not_found';
  end if;

  return case
    when private.block(caller, block_courier.courier_id) then 'blocked'
    else 'already_blocked'
  end;
end;
$$;

revoke all on function public.block_courier(uuid) from public, anon;
grant execute on function public.block_courier(uuid) to authenticated;

-- As before (see the one lock order migration), except that it passes the
-- gates of the caller and of the letter's sender, and then looks for the
-- letter again: it goes with its sender's account, which may have ended while
-- this waited.
create or replace function public.report_letter(
  message_id uuid,
  reason text,
  note text default null,
  also_block boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
  kept_note text := private.check_report(report_letter.reason, report_letter.note);
  letter public.messages;
  sender public.profiles;
  outcome text := 'already_reported';
begin
  select m.* into letter
  from public.messages m
  where m.id = report_letter.message_id
    and m.recipient_id = caller
    and m.delivered_at is not null;

  if not found then
    raise exception 'no such letter'
      using errcode = 'P0001', hint = 'message_not_found';
  end if;

  perform private.keep_couriers(array[caller, letter.sender_id]);

  select m.* into letter
  from public.messages m
  where m.id = report_letter.message_id
    and m.recipient_id = caller
    and m.delivered_at is not null;

  if not found then
    raise exception 'no such letter'
      using errcode = 'P0001', hint = 'message_not_found';
  end if;

  select p.* into sender
  from public.profiles p
  where p.id = letter.sender_id;

  if report_letter.also_block then
    perform private.block(caller, sender.id);
  end if;

  if exists (
    select 1
    from public.reports r
    where r.reporter_id = caller
      and r.message_id = letter.id
      and r.resolved_at is null
  ) then
    outcome := 'already_reported';
  elsif private.over_report_limit(caller) then
    outcome := 'limit_reached';
  else
    begin
      insert into public.reports (
        reporter_id, reported_id, message_id, reason, note,
        reported_username, reported_display_name, letter_body, letter_sent_at
      )
      values (
        caller, sender.id, letter.id, report_letter.reason, kept_note,
        sender.username, sender.display_name, letter.body, letter.sent_at
      );
      outcome := 'reported';
    exception when unique_violation then
      -- The same report, made at the same moment from another request.
      null;
    end;
  end if;

  return outcome;
end;
$$;

-- As before (see the one lock order migration), except that whether the
-- courier is there is asked once their gate is passed.
create or replace function public.report_courier(
  courier_id uuid,
  reason text,
  note text default null,
  also_block boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
  kept_note text := private.check_report(report_courier.reason, report_courier.note);
  reported public.profiles;
  outcome text := 'already_reported';
begin
  if report_courier.courier_id = caller then
    raise exception 'a courier cannot report themselves'
      using errcode = 'P0001', hint = 'cannot_report_self';
  end if;

  perform private.keep_couriers(array[caller, report_courier.courier_id]);

  select p.* into reported
  from public.profiles p
  where p.id = report_courier.courier_id;

  if not found then
    raise exception 'no such courier'
      using errcode = 'P0001', hint = 'courier_not_found';
  end if;

  if report_courier.also_block then
    perform private.block(caller, reported.id);
  end if;

  if exists (
    select 1
    from public.reports r
    where r.reporter_id = caller
      and r.reported_id = reported.id
      and r.message_id is null
      and r.resolved_at is null
  ) then
    outcome := 'already_reported';
  elsif private.over_report_limit(caller) then
    outcome := 'limit_reached';
  else
    begin
      insert into public.reports (
        reporter_id, reported_id, reason, note, reported_username, reported_display_name
      )
      values (
        caller, reported.id, report_courier.reason, kept_note,
        reported.username, reported.display_name
      );
      outcome := 'reported';
    exception when unique_violation then
      null;
    end;
  end if;

  return outcome;
end;
$$;

revoke all on function public.report_letter(uuid, text, text, boolean) from public, anon;
revoke all on function public.report_courier(uuid, text, text, boolean) from public, anon;
grant execute on function public.report_letter(uuid, text, text, boolean) to authenticated;
grant execute on function public.report_courier(uuid, text, text, boolean) to authenticated;

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

-- As before (see the visible names migration), except that it passes the
-- gates of sender and recipient before it asks whether they are friends: a
-- recipient whose account ended in the meantime is no longer anyone's friend.
--
-- A repeat of a send still waits for its original first (private.lock_send),
-- and answers with the letter that went without passing any gate. Nothing
-- that ends an account asks for that lock.
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
