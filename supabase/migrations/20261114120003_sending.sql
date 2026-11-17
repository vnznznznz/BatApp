-- Night Courier - a send that got no answer, and a letter read as it lands.
--
-- A phone can lose the answer to a send that went through. The app repeats the
-- send under the same `client_ref`, and send_message answers a repeat with the
-- letter that went (see the messages migration). Two things were still wrong
-- around that, and one beside it:
--
--   * A repeat that arrived while its original was still running was told
--     "every bat is out" if the original held the courier's last bat. Neither
--     could see the other's work yet; the unique index decides between two
--     such runs only once both have claimed a bat, and the repeat had none to
--     claim. The letter went, and the app said it had not.
--   * The app had no way to ask. Told that a send failed, a courier corrects a
--     word and sends again - a new letter, under a new reference - and if the
--     first one had gone after all, their friend gets both, on two bats.
--   * A letter was stamped as opened by the clock of the request reading it. A
--     request that began just before the letter landed read it just after, and
--     stamped it opened before it had arrived, which the table refuses.
--
-- (All three found in review, on a real Postgres.)

/* -------------------------------------------------------------------------- */
/* One run of a send at a time                                                */
/* -------------------------------------------------------------------------- */

-- Makes everything that concerns one send of one courier's - the send, a
-- repeat of it, a question about it - take its turn, until the transaction
-- that called this ends. Whoever comes second finds the first one's work done
-- and committed, or undone, and never half-way.
--
-- It is taken before anything else, and nothing else waits for it, so it adds
-- no way for two requests to wait on each other. A send without a reference
-- takes no lock, and two different letters never wait for one another.
create or replace function private.lock_send(sender uuid, client_ref uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'send:' || lock_send.sender::text || lock_send.client_ref::text,
      0
    )
  );
end;
$$;

revoke all on function private.lock_send(uuid, uuid) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

-- As before (see the messages migration), except that a send with a reference
-- first waits for any other run of the same send. A repeat that overlaps its
-- original therefore arrives at the lookup after the original has finished:
-- it finds the letter and answers with it, or - if the original failed - finds
-- none and sends the letter itself.
--
-- The handler for the unique index stays where it was. Two runs of one send
-- can no longer both reach the insert, but the index is still what makes one
-- letter per reference a fact about the table rather than about this function.
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

  if send_message.body is null or send_message.body !~ '\S' then
    raise exception 'a letter needs at least one word'
      using errcode = 'P0001', hint = 'empty_message';
  end if;

  if char_length(send_message.body) > 2000 then
    raise exception 'a letter can be at most 2000 characters'
      using errcode = 'P0001', hint = 'message_too_long';
  end if;

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

/* -------------------------------------------------------------------------- */
/* Did it go?                                                                 */
/* -------------------------------------------------------------------------- */

-- The caller's own letter for a reference, exactly as send_message answered -
-- or would have answered - when it was sent; or no row, if no letter of theirs
-- carries that reference.
--
-- For the app to ask when a send ended without an answer, before it offers
-- anything that could become a second letter. It waits its turn behind a send
-- with the same reference that is still running, so "no row" means that send
-- has failed, not that it has not finished yet: after it, the same reference
-- may be sent again, or dropped for a new one, without two letters going out.
--
-- Volatile, though it only reads: what it reads must be read after the wait,
-- not from a snapshot taken before it. The app therefore calls it with POST,
-- like the other functions here.
create or replace function public.sent_letter(client_ref uuid)
returns table (message_id uuid, deliver_at timestamptz, distance_km double precision)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.caller();
begin
  if sent_letter.client_ref is null then
    return;
  end if;

  perform private.lock_send(caller, sent_letter.client_ref);

  return query
    select m.id, m.deliver_at, m.distance_km
    from public.messages m
    where m.sender_id = caller
      and m.client_ref = sent_letter.client_ref;
end;
$$;

revoke all on function public.sent_letter(uuid) from public, anon;
grant execute on function public.sent_letter(uuid) to authenticated;

/* -------------------------------------------------------------------------- */
/* Reading a letter the moment it lands                                       */
/* -------------------------------------------------------------------------- */

-- As before (see the safety migration), except for the time a letter is
-- stamped as opened: now, or the moment it landed if that is later. "Now" is
-- when this request began, and a letter can land after that and still be here
-- to read by the time the request reaches it. The table rightly refuses a
-- letter opened before it arrived, and the request failed on it.
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
