-- Night Courier - reading a letter, in the one order.
--
-- Everything that takes more than one letter takes them in the order they
-- land (see the messages migration): the worker, a request landing what is
-- due, and whatever ends an account. Two requests that keep to it wait for
-- each other at the first letter they share, and neither holds anything the
-- other still needs.
--
-- Reading a letter did not keep to it. It first landed whatever had come due
-- for the reader - newer letters - and only then took the letter being read,
-- to mark it opened: an older one. If the sender of both was deleting their
-- account at that moment, the deletion had the older letter and wanted the
-- newer, the read had the newer and wanted the older, and Postgres stopped
-- one of the two. (Found while going through the lock order after review,
-- and reproduced on a real Postgres with a landing made to take a moment:
-- the deletion failed.)

-- As before (see the sending migration), except that it begins by taking, in
-- that order, everything it is going to touch: the letters it is about to
-- land, and the letter it is about to mark opened. What is taken, and what is
-- then done with it, is unchanged.
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
