-- Night Courier - "St Gallen", "St. Ingbert", "Halle (Saale)" and "Biel/Bienne"
-- find their towns.
--
-- Review typed the names in the list the ways people write them, and several
-- found nothing although the town was there:
--
--   * "St Gallen", "St.Gallen", "St. Ingbert", "St. Wendel", "St. Leonhard":
--     GeoNames writes these towns "Sankt ...", and some carry a "St." alias,
--     some none, and none every form. "Saint Paul" and "St. Louis" had the
--     same trouble the other way round.
--   * "Halle (Saale)", "Kempten (Allgäu)", "Biel/Bienne" - the list's own
--     names, typed as they are shown: the generator passed over any name
--     with a bracket or a slash, so the town was not indexed by its name at
--     all, and the client folded "Biel/Bienne" to "bielbienne".
--
-- So the folding has three new rules, in the client (fold() in
-- src/features/cities/search.ts), in the generator (scripts/build-cities.mjs)
-- and here, for the rows already in the table:
--
--   * st, st., sankt and saint at the start of a word are one form, "sankt".
--     Only a whole word: "st" at the end of a query may still be the start of
--     Stuttgart, and "saint" of Saintes. A dot ends the word.
--   * Brackets, slashes and commas part words, like spaces, and a run of
--     spaces is one. (Where a dropped letter had left two spaces in a term,
--     as in "frydbrg  bayrn", it closes up too.)
--   * A typographic apostrophe is a plain one: a phone's keyboard may type
--     "Ra’s" when the courier pressed '.
--
-- Each term keeps, beside its new form, the form it was written in where the
-- saints changed it, and before it: "saint paul|sankt paul". Someone half-way
-- through typing "Saint" has typed "Sain", and only the written form still
-- begins with that. Kept like that, nothing that found a city before stops
-- finding it: every term of every row, typed in full or as its first two
-- letters or anything in between, still finds its row (cities.db.test.mjs
-- asks every one of them: 275,400 different things to type). And the first
-- term of a row is still its own name as it is written, which is what
-- search_cities ranks "the city's own name begins with the query" by (see the
-- city qualifiers migration, where search_cities is made anew).
--
-- What the rules add, over the 4,310 rows:
--
--   * the saints: 55 terms in 21 rows gain the "sankt" form - Saint
--     Petersburg, Saint Paul, St. Louis, Sankt Gallen, Sankt Pölten, ...;
--   * brackets, slashes, commas and apostrophes: 66 names the generator had
--     passed over are now indexed by their own name, 14 of them rows that
--     could not be found at all (see the dead rows migration, which follows);
--   * the spaces: 381 terms in 322 rows close up.
--
-- No term comes out longer than 40 characters, well inside the 64 that
-- search_cities reads of a query.

/* -------------------------------------------------------------------------- */
/* The rule                                                                   */
/* -------------------------------------------------------------------------- */

-- A term that is folded already - lower case, letters without their marks -
-- in the form search_index holds and the client sends: one space between
-- words, none around them, and the saints as "sankt". The same as saintForm()
-- and the end of fold() in src/features/cities/search.ts; the tests hold the
-- two to the same fixture.
--
-- Kept after this migration: search_cities puts a row's own name in this
-- form to rank it for a query with a saint in it, and the tests hold the rows
-- to it.
create or replace function private.search_form(term text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      btrim(regexp_replace(search_form.term, ' {2,}', ' ', 'g')),
      '(^|[ -])st\.(?=[a-z0-9])', '\1sankt ', 'g'
    ),
    '(^|[ -])(st\.|st(?=[ -])|saint(?=[ -]))', '\1sankt', 'g'
  )
$$;

revoke all on function private.search_form(text) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* The rows already there                                                     */
/* -------------------------------------------------------------------------- */

-- Each row's terms in their new order: first the row's own name where the
-- generator used to pass it over, then every term it had, each in the form it
-- was written in and then, where the saints change it, in its new form. A
-- term that comes round again is kept where it came first, as the generator
-- does.
--
-- The names passed over are exactly those with a bracket, a slash, a comma or
-- a typographic apostrophe in them: 66 rows. They are folded here as the
-- generator folds them now. The marks are the combining ones these names
-- carry; the letters are lowered once the marks are off, so that the folding
-- does not depend on how the database was set up to lower letters.
with named as (
  select c.id,
         btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               lower(regexp_replace(
                 normalize(translate(replace(c.name, 'ß', 'ss'), '‘’ʼ', ''''''''), nfd),
                 '[̀-ͯ]', '', 'g'
               )),
               '[(),/]', ' ', 'g'
             ),
             '[^a-z0-9 .''-]', '', 'g'
           ),
           ' {2,}', ' ', 'g'
         )) as term
  from public.cities c
  where c.name ~ '[‘’ʼ(),/]'
),
candidates as (
  select n.id, 0::bigint as position, n.term
  from named n
  union all
  select c.id, t.position, t.term
  from public.cities c,
       unnest(string_to_array(c.search_index, '|')) with ordinality as t (term, position)
),
forms as (
  select id, position * 2 as rank, btrim(regexp_replace(term, ' {2,}', ' ', 'g')) as form
  from candidates
  union all
  select id, position * 2 + 1, private.search_form(term)
  from candidates
),
firsts as (
  select id, form, min(rank) as rank
  from forms
  where form <> ''
  group by id, form
),
rebuilt as (
  select id, string_agg(form, '|' order by rank) as search_index
  from firsts
  group by id
)
update public.cities c
set search_index = rebuilt.search_index
from rebuilt
where rebuilt.id = c.id
  and rebuilt.search_index is distinct from c.search_index;
