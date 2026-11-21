-- Night Courier - the sixteen cities nothing could find.
--
-- Sixteen rows had an empty search index: the generator passed over every name
-- with a bracket, a slash, a comma or a typographic apostrophe in it, and these
-- had no other name to be found by. No search could offer them, yet a profile
-- could name one - the column takes any city there is - and so could a letter.
-- (Found in review.)
--
-- Each is decided on its own:
--
-- Found by their names from now on - the previous migration (city search
-- spellings) indexed them, and the generator does the same at its next run:
--
--   * Zürich (Kreis 2), (Kreis 3), (Kreis 6), (Kreis 7), (Kreis 8), (Kreis 9),
--     (Kreis 10), (Kreis 11) and (Kreis 12): districts of the city of Zürich,
--     named as such, beside the quarters the list already finds by name
--     (Altstetten, Oerlikon, Höngg, ...). Found as "Zürich (Kreis 11)" or
--     "Zürich Kreis 11", after Zürich itself.
--   * Stadt Winterthur (Kreis 1), Oberwinterthur (Kreis 2) and Seen (Kreis 3):
--     districts of Winterthur, found as "Stadt Winterthur", "Oberwinterthur"
--     and "Seen".
--   * Mianzhu, Deyang, Sichuan: a city of its own, 25 km from Deyang, which is
--     in the list; found as "Mianzhu".
--   * Ra’s Bayrūt: the quarter of Beirut known as Ras Beirut, found as "Ra’s
--     Bayrūt" or "Ra's Bayrut", with either apostrophe.
--
-- Taken out:
--
--   * Neustadt/Süd and Neustadt/Nord: two quarters of Köln, one and two
--     kilometres from Köln's own row. Found by their names, they would sit
--     among the Neustadts of the list - an der Weinstraße, am Rübenberge, in
--     Holstein - under no name that says Köln, and be mistaken for the
--     southern and northern half of whichever Neustadt someone lives in. Köln
--     is the same place for every flight the app works out.
--
-- A courier whose city was one of the two lives in Köln from now on, at once:
-- it is the same place under another name, so no move starts and none is put
-- back. That is why the trigger that starts a move is held off while it
-- happens. A courier settling away from one of them settles away from Köln
-- instead, at the same time as before, and one who was moving from Köln to
-- one of them is home again. A letter that flew from or to one of them flew
-- from or to Köln: a city that letters name cannot be deleted, and the place
-- they left from has not changed. Only then are the rows deleted.
--
-- scripts/build-cities.mjs leaves both out of every migration it writes from
-- now on (LEFT_OUT); written again, they would come back.

alter table public.profiles disable trigger profiles_settle_city;

update public.profiles p
set city_id = 2886242
where p.city_id in (8593856, 8593855);

alter table public.profiles enable trigger profiles_settle_city;

update public.profiles p
set settled_city_id = 2886242
where p.settled_city_id in (8593856, 8593855);

-- Moving from Köln to Köln is no move at all.
update public.profiles p
set settled_city_id = null,
    city_changed_at = null
where p.settled_city_id = 2886242
  and p.city_id = 2886242;

update public.messages m
set origin_city_id = 2886242
where m.origin_city_id in (8593856, 8593855);

update public.messages m
set destination_city_id = 2886242
where m.destination_city_id in (8593856, 8593855);

delete from public.cities c
where c.id in (8593856, 8593855);
