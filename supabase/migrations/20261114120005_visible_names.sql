-- Night Courier - a name, and a letter, with something in them to see.
--
-- All the database asked of a display name was its length: one to forty
-- characters. Review stored, on the real stack, a name that is a single
-- zero-width space, one that is forty line breaks, one of control characters,
-- and one that reads "abaccepted" on screen while it is stored as something
-- else - a right-to-left override in front of ordinary letters. Several of
-- them went through the app's own form. A name is shown to friends, on
-- letters and bat tiles, to a stranger the courier has asked to be friends,
-- and to the operator in a report: a blank line where a name should be, or a
-- name that is not what it looks like.
--
-- A letter had the same gap. "At least one word" meant one character that is
-- not white space, and a zero-width space is not white space: a letter of
-- nothing else cost a bat and arrived blank. What white space is was left to
-- the server's locale, too - a letter of one no-break space was refused on the
-- local stack and sent by the Postgres the tests run on.
--
-- Now a display name must be plain text with something to see in it, and a
-- letter must have something to see in it. Both rules name their characters
-- by number, so they mean the same on every server. The app holds the same two
-- lists (src/constants/config.ts), and the parity test compares them with
-- these for every character there is.

/* -------------------------------------------------------------------------- */
/* What shows nothing                                                          */
/* -------------------------------------------------------------------------- */

-- Whether a text has anything in it to see: at least one character that is
-- not on this list of what is drawn as nothing.
--
--   U+0001-0020, U+007F-00A0   control characters, the space, the no-break space
--   U+00AD                     the soft hyphen
--   U+034F                     the combining grapheme joiner
--   U+061C                     the Arabic letter mark
--   U+115F, U+1160             the Hangul fillers
--   U+1680                     the Ogham space mark
--   U+17B4, U+17B5             the Khmer inherent vowels
--   U+180B-180F                the Mongolian selectors and vowel separator
--   U+2000-200F                spaces of every width, the zero-width space,
--                              joiner and non-joiner, the direction marks
--   U+2028-202F                line and paragraph separators, the embeddings
--                              and overrides, the narrow no-break space
--   U+205F-206F                the mathematical space, the word joiner,
--                              invisible operators, the isolates
--   U+2800                     the blank braille pattern
--   U+3000                     the ideographic space
--   U+3164, U+FFA0             two more Hangul fillers
--   U+FE00-FE0F                variation selectors
--   U+FEFF                     the byte order mark
--   U+FFF0-FFFB                unassigned, and the annotation marks
--   U+13430-1343F              hieroglyph format controls
--   U+1BCA0-1BCA3              shorthand format controls
--   U+1D173-1D17A              musical format controls
--   U+E0000-E0FFF              tags, and more variation selectors
--
-- That is Unicode's white space, its control characters and what it calls
-- default-ignorable, with the blank braille pattern and the annotation marks;
-- and the format characters that draw nothing although Unicode does not call
-- them default-ignorable, the hieroglyph format controls, which only arrange
-- the signs around them (found in review). The other format characters - a
-- number sign, the end of an ayah - are drawn, and count as something to see.
-- Written out rather than asked for by name (`\s`), because what a server
-- takes that name to mean depends on its locale and its version: the three
-- this project runs on - Postgres 16 for the races, 17 in the local stack, 18
-- inside PGlite - disagreed about nine characters, the no-break space among
-- them.
create or replace function private.has_visible_character(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select has_visible_character.value ~ '[^\u0001-\u0020\u007F-\u00A0\u00AD\u034F\u061C\u115F\u1160\u1680\u17B4\u17B5\u180B-\u180F\u2000-\u200F\u2028-\u202F\u205F-\u206F\u2800\u3000\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]'
$$;

revoke all on function private.has_visible_character(text) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Display names                                                               */
/* -------------------------------------------------------------------------- */

-- Two rules.
--
-- A name is plain text: no control characters (a line break is one), no line
-- or paragraph separator, and none of the characters that embed, override or
-- isolate the direction of text (U+202A-202E, U+2066-2069), with which a name
-- can read as something it is not. The marks and joiners that scripts and
-- emoji cannot do without - U+200C to U+200F - are not among them: a Persian
-- or Hebrew name, a family emoji, a flag are names like any other.
--
-- And a name has something in it to see: at least one character that is not
-- on the list above.
--
-- Profiles made before this may hold names the rules refuse. Adding a check
-- that a row already fails would stop this migration; adding it for new rows
-- only would be worse, because Postgres then refuses every later change to
-- such a row, whatever is being changed - the courier moving to another city,
-- the nightly tidy-up settling a move. So those names are put right first:
-- what must not be in a name is taken out of it, and a name with nothing left
-- to see becomes "Courier", the name a sign-up without one is given. A name
-- the rules accept is not touched.
with refused as (
  select
    p.id,
    regexp_replace(
      p.display_name,
      '[\u0001-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]',
      '',
      'g'
    ) as rest
  from public.profiles p
  where p.display_name ~ '[\u0001-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]'
     or not private.has_visible_character(p.display_name)
)
update public.profiles p
set display_name = case
      when private.has_visible_character(refused.rest) then refused.rest
      else 'Courier'
    end
from refused
where p.id = refused.id;

-- The checks themselves call nothing. A check runs with the rights of whoever
-- writes the row, and for a courier changing their own name that is the API's
-- role, which can use neither the private schema nor any function in it: a
-- check that called private.has_visible_character would refuse every change
-- of name the app makes, and pass any test that changes a name as a
-- superuser. So the list stands here a second time, and the parity test
-- holds the two copies together.
alter table public.profiles
  add constraint profiles_display_name_no_controls check (
    display_name !~ '[\u0001-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]'
  ),
  add constraint profiles_display_name_visible check (
    display_name ~ '[^\u0001-\u0020\u007F-\u00A0\u00AD\u034F\u061C\u115F\u1160\u1680\u17B4\u17B5\u180B-\u180F\u2000-\u200F\u2028-\u202F\u205F-\u206F\u2800\u3000\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]'
  );

/* -------------------------------------------------------------------------- */
/* Letters                                                                     */
/* -------------------------------------------------------------------------- */

-- As before (see the sending migration), except for what counts as a letter
-- with nothing in it: no longer "nothing but white space" as the server
-- understands white space, but nothing to see, by the list above. It is
-- refused as it always was, first of all and with the same answer.
--
-- A letter may hold anything else, line breaks and all: only a name has to be
-- plain text.
--
-- The table's own check (messages_body_has_words) stays as it is. Letters
-- already sent are not judged again: a check that one of them failed would
-- stop the worker landing it, and every other letter of that minute with it.
-- No client can write the table, so this function is where the rule has to
-- hold.
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
