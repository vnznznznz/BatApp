-- Night Courier - the roost, the inbox, and the letters themselves.
--
-- The messages table has no SELECT policy and no grants. These functions are the
-- only way to read it, and each one returns exactly the columns its side of the
-- letter is entitled to:
--
--   * The recipient sees nothing until a letter lands - not its existence, not
--     its sender, not that a bat is on the way.
--   * The sender sees their own letters, in flight and landed, and never whether
--     one has been opened.
--   * Nobody sees anyone else's.
--
-- Each of them first delivers whatever is due for the caller, so what they
-- return is current to the second rather than to the last run of the scheduler.
-- That makes them VOLATILE, which is why the app calls them with POST.

/* -------------------------------------------------------------------------- */
/* The roost                                                                   */
/* -------------------------------------------------------------------------- */

-- The caller's three bats, and for each one in the air: who it is flying to,
-- when it left, and when it lands.
create or replace function public.get_roost()
returns table (
  bat_id uuid,
  slot smallint,
  status text,
  message_id uuid,
  recipient_id uuid,
  recipient_username text,
  recipient_display_name text,
  sent_at timestamptz,
  deliver_at timestamptz,
  distance_km double precision
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  perform private.deliver_due_messages(caller);

  return query
    select
      b.id,
      b.slot,
      b.status,
      m.id,
      r.id,
      r.username,
      r.display_name,
      m.sent_at,
      m.deliver_at,
      m.distance_km
    from public.bats b
    left join public.messages m
      on m.bat_id = b.id
     and m.delivered_at is null
    left join public.profiles r
      on r.id = m.recipient_id
    where b.owner_id = caller
    order by b.slot;
end;
$$;

/* -------------------------------------------------------------------------- */
/* Received                                                                    */
/* -------------------------------------------------------------------------- */

-- Letters that have landed for the caller, newest arrival first.
--
-- Paged by keyset: pass the id of the last letter of a page as `older_than` to
-- get the next one. Keyed on (deliver_at, id) rather than on time alone, since
-- two letters landing in the same instant would otherwise straddle a page
-- boundary and one would never be shown.
--
-- `arrived_at` is the scheduled arrival, not the moment the worker processed it:
-- if the scheduler were ever late, the letter still arrived when its bat did.
create or replace function public.list_inbox(
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
begin
  perform private.deliver_due_messages(caller);

  return query
    select
      m.id,
      s.id,
      s.username,
      s.display_name,
      origin.name,
      origin.country_code,
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
      and (
        list_inbox.older_than is null
        or (m.deliver_at, m.id) < (
          select page_end.deliver_at, page_end.id
          from public.messages page_end
          where page_end.id = list_inbox.older_than
            and page_end.recipient_id = caller
        )
      )
    order by m.deliver_at desc, m.id desc
    limit least(greatest(coalesce(list_inbox.max_results, 50), 1), 100);
end;
$$;

/* -------------------------------------------------------------------------- */
/* Sent                                                                        */
/* -------------------------------------------------------------------------- */

-- The caller's own letters, in the air and landed, newest first. There is no
-- column here for whether a letter has been opened, and there must never be.
create or replace function public.list_sent(
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
begin
  perform private.deliver_due_messages(caller);

  return query
    select
      m.id,
      r.id,
      r.username,
      r.display_name,
      destination.name,
      destination.country_code,
      m.distance_km,
      m.sent_at,
      m.deliver_at,
      m.delivered_at is not null,
      left(m.body, 200)
    from public.messages m
    join public.profiles r on r.id = m.recipient_id
    join public.cities destination on destination.id = m.destination_city_id
    where m.sender_id = caller
      and (
        list_sent.older_than is null
        or (m.sent_at, m.id) < (
          select page_end.sent_at, page_end.id
          from public.messages page_end
          where page_end.id = list_sent.older_than
            and page_end.sender_id = caller
        )
      )
    order by m.sent_at desc, m.id desc
    limit least(greatest(coalesce(list_sent.max_results, 50), 1), 100);
end;
$$;

/* -------------------------------------------------------------------------- */
/* One letter                                                                  */
/* -------------------------------------------------------------------------- */

-- The whole of one letter, for its sender at any time and for its recipient once
-- it has landed. Reading it as the recipient marks it opened - for their own
-- inbox, never for the sender, who gets null in `opened_at` whatever the truth.
--
-- A letter that does not exist, one that belongs to other people, and one still
-- in the air to the caller all fail identically, so the error says nothing about
-- which it was.
create or replace function public.read_message(message_id uuid)
returns table (
  id uuid,
  direction text,
  other_id uuid,
  other_username text,
  other_display_name text,
  origin_city_name text,
  origin_country_code text,
  destination_city_name text,
  destination_country_code text,
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
  perform private.deliver_due_messages(caller);

  update public.messages m
  set opened_at = now()
  where m.id = read_message.message_id
    and m.recipient_id = caller
    and m.delivered_at is not null
    and m.opened_at is null;

  return query
    select
      m.id,
      case when m.sender_id = caller then 'sent' else 'received' end,
      other.id,
      other.username,
      other.display_name,
      origin.name,
      origin.country_code,
      destination.name,
      destination.country_code,
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
        or (m.recipient_id = caller and m.delivered_at is not null)
      );

  if not found then
    raise exception 'no such letter'
      using errcode = 'P0001', hint = 'message_not_found';
  end if;
end;
$$;

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

-- The two numbers the home screen shows: letters landed but not yet opened, and
-- friend requests waiting for an answer.
create or replace function public.get_badges()
returns table (unread_messages integer, friend_requests integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  perform private.deliver_due_messages(caller);

  return query
    select
      (
        select count(*)::integer
        from public.messages m
        where m.recipient_id = caller
          and m.delivered_at is not null
          and m.opened_at is null
      ),
      (
        select count(*)::integer
        from public.friendships f
        where f.addressee_id = caller
          and f.status = 'pending'
      );
end;
$$;

/* -------------------------------------------------------------------------- */
/* Privileges                                                                  */
/* -------------------------------------------------------------------------- */

revoke all on function public.get_roost() from public, anon;
revoke all on function public.list_inbox(integer, uuid) from public, anon;
revoke all on function public.list_sent(integer, uuid) from public, anon;
revoke all on function public.read_message(uuid) from public, anon;
revoke all on function public.get_badges() from public, anon;

grant execute on function public.get_roost() to authenticated;
grant execute on function public.list_inbox(integer, uuid) to authenticated;
grant execute on function public.list_sent(integer, uuid) to authenticated;
grant execute on function public.read_message(uuid) to authenticated;
grant execute on function public.get_badges() to authenticated;
