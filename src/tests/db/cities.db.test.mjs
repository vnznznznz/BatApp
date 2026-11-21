import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { fastForward, rpc } from './fixtures.mjs';
import {
  applyMigrations,
  asAnon,
  asUser,
  createTestDatabase,
  createUser,
  migrationFiles,
} from './harness.mjs';

/**
 * What the client's fold makes of a name or a spelling, as the generator
 * pinned it: search.test.ts holds the client to these pairs, so they are what
 * the app sends.
 */
const FIXTURE = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'features',
      'cities',
      'fold-parity.fixture.json',
    ),
    'utf8',
  ),
);

/** The query the app sends for `spelling`, from the fixture's spellings. */
function sent(spelling) {
  const pair = (FIXTURE.spellings ?? []).find(([raw]) => raw === spelling);
  assert.ok(pair, `the fixture has no spelling "${spelling}"`);
  return pair[1];
}

/** The migration that gave the search one form for the saints, and the one before it. */
const SPELLINGS_MIGRATION = '20261121120000_city_search_spellings.sql';
const BEFORE_SPELLINGS = migrationFiles()
  .filter((file) => file < SPELLINGS_MIGRATION)
  .at(-1);

/** The migration that settled the rows nothing could find, and the one before it. */
const DEAD_ROWS_MIGRATION = '20261121120001_dead_city_rows.sql';
const BEFORE_DEAD_ROWS = migrationFiles()
  .filter((file) => file < DEAD_ROWS_MIGRATION)
  .at(-1);

const KOLN = 2886242;
const NEUSTADT_SUD = 8593856;
const NEUSTADT_NORD = 8593855;

let db;

before(async () => {
  db = await createTestDatabase();
});

after(async () => {
  await db?.close();
});

/** Calls the search function the app calls, as a signed-in user. */
async function search(userId, term, limit) {
  return asUser(db, userId, async () => {
    const { rows } = await db.query(`select * from public.search_cities($1, $2)`, [
      term,
      limit ?? 20,
    ]);
    return rows;
  });
}

describe('city reference data', () => {
  it('is seeded', async () => {
    const { rows } = await db.query(`select count(*)::int as count from public.cities`);
    assert.ok(rows[0].count > 4000, `expected the full list, got ${rows[0].count}`);
  });

  it('holds plausible coordinates for a known town', async () => {
    const { rows } = await db.query(
      `select latitude, longitude, country_code from public.cities where name = 'Rösrath'`,
    );
    assert.equal(rows[0].country_code, 'DE');
    // Rösrath sits just east of Cologne; a degree either way would mean the
    // columns had been transposed or the parse had drifted.
    assert.ok(Math.abs(rows[0].latitude - 50.9) < 0.5, `latitude ${rows[0].latitude}`);
    assert.ok(Math.abs(rows[0].longitude - 7.18) < 0.5, `longitude ${rows[0].longitude}`);
  });
});

describe('search_cities', () => {
  let anna;

  before(async () => {
    anna = await createUser(db, { username: 'anna', displayName: 'Anna' });
  });

  it('finds a city by its own name', async () => {
    const rows = await search(anna, 'berlin');
    assert.equal(rows[0].name, 'Berlin');
  });

  /**
   * GeoNames stores the English name, so without alias search a German-speaking
   * user typing the name they actually use would find nothing.
   */
  it('finds a city by its German exonym', async () => {
    assert.equal((await search(anna, 'wien'))[0].name, 'Vienna');
    assert.equal((await search(anna, 'munchen'))[0].name, 'Munich');
    assert.equal((await search(anna, 'mailand'))[0].name, 'Milan');
  });

  it('finds a city typed without its diacritics', async () => {
    assert.equal((await search(anna, 'zurich'))[0].name, 'Zürich');
    assert.equal((await search(anna, 'koln'))[0].name, 'Köln');
  });

  it('ranks the larger city first', async () => {
    const rows = await search(anna, 'frankfurt');
    assert.match(rows[0].name, /^Frankfurt am Main$/);
  });

  it('prefers a name match over an alias match', async () => {
    // Several places have "Bern" as an alias fragment; the Swiss capital should
    // still lead because its own name starts with the query.
    const rows = await search(anna, 'bern');
    assert.equal(rows[0].name, 'Bern');
  });

  it('returns nothing for a query below the minimum length', async () => {
    assert.equal((await search(anna, 'b')).length, 0);
    assert.equal((await search(anna, '')).length, 0);
  });

  /**
   * The folded query is interpolated into a LIKE pattern. The client strips
   * wildcards, but the client is not trusted, so the function strips them too.
   */
  it('does not let a wildcard match the whole table', async () => {
    assert.equal((await search(anna, '%')).length, 0);
    assert.equal((await search(anna, '%%%')).length, 0);
  });

  it('treats underscores as literal rather than as single-character wildcards', async () => {
    assert.equal((await search(anna, 'b_rlin')).length, 0);
  });

  it('caps the number of results however many are asked for', async () => {
    const rows = await search(anna, 'san', 1000);
    assert.ok(rows.length <= 50, `expected at most 50, got ${rows.length}`);
  });

  /**
   * The query used to be folded again for each of the 4,310 cities, so the
   * cost of a search grew with the length of what was sent: 100,000
   * characters held a database connection and a core until the API's
   * eight-second timeout. (Found in review.)
   *
   * PGlite is PostgreSQL 18, which folds the query once whatever the function
   * says, and answers in milliseconds either way. Forcing a generic plan gives
   * it the plan Postgres 16 and 17 use; without that line this test passes on
   * the function as it was. concurrency.pg.test.mjs runs the real thing.
   */
  it('answers a very long query as quickly as a short one', async () => {
    await db.exec(`set plan_cache_mode = force_generic_plan`);
    try {
      const started = Date.now();
      const rows = await search(anna, 'ber' + 'x'.repeat(100_000));
      const took = Date.now() - started;

      assert.deepEqual(rows, []);
      assert.ok(took < 2000, `a 100,003-character query took ${took} ms`);
      assert.equal((await search(anna, 'berlin'))[0].name, 'Berlin');
    } finally {
      await db.exec(`reset plan_cache_mode`);
    }
  });

  /**
   * The test above sees only that a long query is cheap, which a cut at ten
   * thousand characters would also pass. This pins where the cut is: the
   * marks are tidied away whatever their number, so what decides is whether
   * the "x" is still inside the first 64 characters.
   */
  it('reads the first 64 characters of a query, and not one more', async () => {
    const xAt = (position) => 'ber' + '!'.repeat(position - 4) + 'x';

    assert.deepEqual(await search(anna, xAt(64)), []);
    assert.equal((await search(anna, xAt(65)))[0]?.name, 'Berlin');
  });

  /**
   * The same, with letters that matter: whether the 61st to the 64th
   * character are read decides between Bern, which "bern" names exactly, and
   * Berlin, the largest city that "ber" begins. The marks before them are
   * tidied away once the query has been cut.
   */
  it('lets the 61st to the 64th character decide what is found', async () => {
    const at61 = '!'.repeat(60) + 'bern';

    assert.equal(at61.length, 64);
    assert.equal((await search(anna, at61))[0]?.name, 'Bern');
    assert.equal((await search(anna, '!' + at61))[0]?.name, 'Berlin');
  });

  it('is not available to a signed-out visitor', async () => {
    await assert.rejects(
      () => asAnon(db, () => db.query(`select * from public.search_cities('berlin', 20)`)),
      /permission denied for function search_cities/,
    );
  });
});

/**
 * The ways people write the names in the list. "St Gallen", "St. Ingbert",
 * "Halle (Saale)" and "Biel/Bienne" found nothing, although the towns are
 * there. (Found in review.)
 */
describe('search_cities, the way a town is typed', () => {
  let anna;

  before(async () => {
    anna = await createUser(db, { username: 'spelling', displayName: 'Spelling' });
  });

  for (const [spelling, town] of [
    ['St Gallen', 'Sankt Gallen'],
    ['St. Gallen', 'Sankt Gallen'],
    ['St.Gallen', 'Sankt Gallen'],
    ['Saint Gallen', 'Sankt Gallen'],
    ['St Pölten', 'Sankt Pölten'],
    ['St. Augustin', 'Sankt Augustin'],
    ['St. Ingbert', 'Sankt Ingbert'],
    ['St. Wendel', 'Sankt Wendel'],
    ['St. Leonhard', 'Sankt Leonhard'],
    ['Halle (Saale)', 'Halle (Saale)'],
    ['Halle/Saale', 'Halle (Saale)'],
    ['Kempten (Allgäu)', 'Kempten (Allgäu)'],
    ['Frankfurt (Oder)', 'Frankfurt (Oder)'],
    ['Biel/Bienne', 'Biel/Bienne'],
    ['St. Paul', 'Saint Paul'],
    ['Saint Louis', 'St. Louis'],
    ['Ra’s Bayrūt', 'Ra’s Bayrūt'],
  ]) {
    it(`finds ${town} typed as "${spelling}"`, async () => {
      const rows = await search(anna, sent(spelling));
      assert.equal(rows[0]?.name, town, `found ${rows.map((row) => row.name).join(', ')}`);
    });
  }

  /** Typed so far, "St" may still become Stuttgart. */
  it('still finds a town that begins with the letters of a saint', async () => {
    const rows = await search(anna, sent('St'), 50);
    assert.ok(rows.some((row) => row.name === 'Stuttgart'));
  });

  /**
   * The fixture's names are the generator's own sample of the list, folded
   * as the client folds them. Each must find its city: this is where the
   * client and the rows in the database are held together.
   */
  it('finds every city in the fixture by the name the client sends for it', async () => {
    const { rows: names } = await db.query(`select distinct name from public.cities`);
    const inTable = new Set(names.map((row) => row.name));
    const listed = [...FIXTURE.pairs, ...(FIXTURE.spellings ?? [])].filter(([raw]) =>
      inTable.has(raw),
    );
    assert.ok(listed.length > 150, `only ${listed.length} of the fixture's names are cities`);

    const missed = [];
    for (const [raw, folded] of listed) {
      const rows = await search(anna, folded, 50);
      if (!rows.some((row) => row.name === raw)) missed.push(`${raw} as "${folded}"`);
    }
    assert.deepEqual(missed, []);
  });

  /**
   * The rows were brought to the new form in SQL, by private.search_form.
   * On text that needs no letters folded, it has to say what the client says.
   */
  it('agrees with the client on every spelling that needs no letter folded', async () => {
    const plain = (FIXTURE.spellings ?? []).filter(([raw]) => /^[A-Za-z0-9 .'-]+$/.test(raw));
    assert.ok(plain.length > 5);

    const { rows } = await db.query(
      `select raw, private.search_form(lower(raw)) as folded
       from unnest($1::text[]) as raw`,
      [plain.map(([raw]) => raw)],
    );
    assert.deepEqual(
      rows.map((row) => [row.raw, row.folded]),
      plain.map(([raw, folded]) => [raw, folded]),
    );
  });
});

/**
 * Nothing that found a city before the saints became one form may find it
 * no longer: every term each of the 4,310 rows had, typed in full or only
 * the first two letters of it, or anything in between, still finds the row.
 * What is typed is folded the way the client folds it, which for these
 * terms - folded already - is private.search_form.
 */
describe('search_index, brought to one form for the saints', () => {
  let before_;
  let after_;

  before(async () => {
    before_ = await createTestDatabase({ until: BEFORE_SPELLINGS });
    after_ = await createTestDatabase({ until: BEFORE_SPELLINGS });
    // That migration alone, so that every row is still there to be asked about.
    await applyMigrations(after_, { after: BEFORE_SPELLINGS, until: SPELLINGS_MIGRATION });
  });

  after(async () => {
    await before_?.close();
    await after_?.close();
  });

  it('loses no row a match it had', async () => {
    const { rows: old } = await before_.query(
      `select id, search_index from public.cities order by id`,
    );
    assert.equal(old.length, 4310);

    await after_.query(`create temporary table old_index (id integer, search_index text)`);
    await after_.query(
      `insert into old_index
       select * from unnest($1::integer[], $2::text[])`,
      [old.map((row) => row.id), old.map((row) => row.search_index)],
    );

    const { rows: still } = await after_.query(`select count(*)::int as rows from public.cities`);
    assert.equal(still[0].rows, 4310);

    const { rows } = await after_.query(`
      with typed as (
        select distinct o.id, btrim(left(term, n)) as typed
        from old_index o,
             unnest(string_to_array(o.search_index, '|')) as term,
             generate_series(2, char_length(term)) as n
      ),
      asked as (
        select id, typed, private.search_form(typed) as query
        from typed
        where char_length(typed) >= 2
      )
      select count(*)::int as asked,
             coalesce(array_agg(a.typed || ' -> ' || c.name)
               filter (where ('|' || c.search_index) not like '%|' || a.query || '%'),
               '{}') as lost
      from asked a
      join public.cities c on c.id = a.id
    `);

    assert.ok(rows[0].asked > 250_000, `only ${rows[0].asked} were asked`);
    assert.deepEqual(rows[0].lost, []);
  });

  it('leaves no term longer than the 64 characters search_cities reads', async () => {
    const { rows } = await after_.query(
      `select max(char_length(term)) as longest
       from public.cities, unnest(string_to_array(search_index, '|')) as term`,
    );
    assert.ok(rows[0].longest <= 64, `a term is ${rows[0].longest} characters long`);
  });
});

/**
 * Sixteen rows had an empty search index and could never be found. (Found in
 * review.) Fourteen are found by their names now; the two quarters of Köln
 * called Neustadt are gone, and whatever named them names Köln.
 */
/**
 * 28 pairs of cities share their name and their country - Friedberg in Hessen
 * and in Bavaria, Hamm in Westphalia and in Hamburg - and were listed as the
 * same row twice. (Found in review.) Each now says where it is.
 */
describe('cities.qualifier, for towns of the same name', () => {
  let anna;

  before(async () => {
    anna = await createUser(db, { username: 'twins', displayName: 'Twins' });
  });

  /** Every city that has a twin, with what tells it apart and what that names. */
  const twins = async () =>
    (
      await db.query(`
        select c.id, c.name, c.country_code, c.qualifier, c.population,
               coalesce(substring(c.qualifier from '^near (.*)$'),
                        substring(c.qualifier from '^[0-9]+ km from (.*)$')) as named,
               substring(c.qualifier from '^([0-9]+) km from ')::int as km_said
        from public.cities c
        where exists (
          select 1 from public.cities o
          where o.name = c.name and o.country_code = c.country_code and o.id <> c.id
        )
        order by c.name, c.population desc
      `)
    ).rows;

  it('tells apart every city that shares its name and country with another', async () => {
    const rows = await twins();
    assert.equal(rows.length, 56);

    const groups = Map.groupBy(rows, (row) => `${row.name}, ${row.country_code}`);
    assert.equal(groups.size, 28);
    for (const [town, members] of groups) {
      const said = members.map((member) => member.qualifier);
      assert.ok(!said.includes(null), `${town} has a row without a qualifier`);
      assert.equal(new Set(said).size, said.length, `${town}: ${said.join(' / ')}`);
    }

    const { rows: others } = await db.query(
      `select count(*)::int as count from public.cities c
       where c.qualifier is not null
         and not exists (
           select 1 from public.cities o
           where o.name = c.name and o.country_code = c.country_code and o.id <> c.id
         )`,
    );
    assert.equal(others[0].count, 0, 'a city whose name is its own has a qualifier');
  });

  /**
   * "Near" names a city of the same country, one of a name of its own, within
   * 50 km; farther, the qualifier gives the distance instead. Measured again
   * here for every row.
   */
  it('names a city of the same country, near when it says near, as far as it says otherwise', async () => {
    for (const row of await twins()) {
      const { rows: named } = await db.query(
        `select n.name, n.population,
                private.distance_km(c.latitude, c.longitude, n.latitude, n.longitude) as km,
                (select count(*) from public.cities o
                 where o.name = n.name and o.country_code = n.country_code)::int as same_name
         from public.cities c
         join public.cities n on n.country_code = c.country_code and n.name = $2
         where c.id = $1`,
        [row.id, row.named],
      );
      assert.equal(named.length, 1, `${row.name}: "${row.qualifier}" names no one city`);
      const [place] = named;
      assert.equal(place.same_name, 1, `${row.name}: ${place.name} has a twin itself`);

      if (row.qualifier.startsWith('near ')) {
        assert.ok(place.km <= 50, `${row.name} is ${place.km} km from ${place.name}`);
      } else {
        assert.equal(row.km_said, Math.round(place.km), `${row.name}: ${row.qualifier}`);
      }
    }
  });

  it('says where each of the German and Austrian twins is', async () => {
    const said = Object.fromEntries(
      (await twins())
        .filter((row) => ['DE', 'AT'].includes(row.country_code))
        .map((row) => [`${row.name} ${row.population}`, row.qualifier]),
    );

    assert.deepEqual(said, {
      'Friedberg 29953': 'near Augsburg',
      'Friedberg 27484': 'near Frankfurt am Main',
      'Hamm 178967': 'near Dortmund',
      'Hamm 37989': 'near Hamburg',
      'Langen 38785': 'near Frankfurt am Main',
      'Langen 18863': 'near Bremerhaven',
      'Mülheim 173050': 'near Düsseldorf',
      'Mülheim 41711': 'near Köln',
      'Sankt Peter 20320': 'near Klagenfurt am Wörthersee',
      'Sankt Peter 15187': 'near Graz',
      'Senden 22275': 'near Ulm',
      'Senden 20363': 'near Münster',
    });
  });

  /** Two rows a few kilometres apart, and no larger city within 130 km. */
  it('gives the distance where no larger city is near', async () => {
    const said = (await twins())
      .filter((row) => row.name === 'La Ceiba')
      .map((row) => row.qualifier);

    assert.deepEqual(said, ['136 km from San Pedro Sula', '131 km from San Pedro Sula']);
  });

  it('is what search_cities returns beside the name', async () => {
    const rows = await search(anna, 'friedberg');

    assert.deepEqual(
      rows
        .filter((row) => row.name === 'Friedberg')
        .map((row) => row.qualifier)
        .sort(),
      ['near Augsburg', 'near Frankfurt am Main'],
    );
    assert.equal((await search(anna, 'berlin'))[0].qualifier, null);
  });
});

/**
 * The picker told the two Friedbergs apart, and nothing else did: a friend in
 * one of them was "Friedberg, DE" in the friends list, on their page, on the
 * compose screen and on every letter - the trouble the picker had, seen from
 * the friend's side. (Found in review.) Wherever the app reads a city with
 * its country, what tells it apart comes with it.
 */
describe('cities.qualifier, wherever a city is read with its country', () => {
  const HESSEN = 'near Frankfurt am Main';
  const BAVARIA = 'near Augsburg';
  let anna;
  let ben;
  let cara;
  let dora;
  let letter;

  /** A courier living in one of the two Friedbergs, or in Berlin. */
  const courier = async (username, qualifier) => {
    const id = await createUser(db, { username, displayName: username });
    await db.query(
      `update public.profiles
       set city_id = (select c.id from public.cities c
                      where c.country_code = 'DE'
                        and (c.name, c.qualifier) is not distinct from ($2, $3))
       where id = $1`,
      [id, qualifier ? 'Friedberg' : 'Berlin', qualifier],
    );
    return id;
  };
  const befriend = (a, b, status = 'accepted') =>
    db.query(
      `insert into public.friendships (requester_id, addressee_id, status, accepted_at)
       values ($1, $2, $3, case when $3 = 'accepted' then now() end)`,
      [a, b, status],
    );

  before(async () => {
    anna = await courier('friedberg_hessen', HESSEN);
    ben = await courier('friedberg_bavaria', BAVARIA);
    cara = await courier('berlin_cara', null);
    dora = await courier('friedberg_dora', BAVARIA);
    await befriend(anna, ben);
    await befriend(anna, cara);
    // Dora has asked Anna, who has not answered: no city is shown either way.
    await befriend(dora, anna, 'pending');

    [letter] = await rpc(db, anna, 'send_message', {
      recipient_id: ben,
      body: 'Grüße aus der Wetterau.',
    });
    await fastForward(db, letter.message_id);
  });

  it('comes with a friend’s city in list_friends, and only once they are friends', async () => {
    const cities = Object.fromEntries(
      (await rpc(db, anna, 'list_friends')).map((row) => [
        row.username,
        [row.city_name, row.country_code, row.city_qualifier],
      ]),
    );

    assert.deepEqual(cities, {
      friedberg_bavaria: ['Friedberg', 'DE', BAVARIA],
      berlin_cara: ['Berlin', 'DE', null],
      friedberg_dora: [null, null, null],
    });
    const [annaSeenByBen] = await rpc(db, ben, 'list_friends');
    assert.equal(annaSeenByBen.city_qualifier, HESSEN);
  });

  it('comes with where a letter landed in list_sent', async () => {
    const [sent] = await rpc(db, anna, 'list_sent');

    assert.deepEqual(
      [sent.destination_city_name, sent.destination_country_code, sent.destination_qualifier],
      ['Friedberg', 'DE', BAVARIA],
    );
  });

  it('comes with where a letter came from in list_inbox', async () => {
    const [received] = await rpc(db, ben, 'list_inbox');

    assert.deepEqual(
      [received.origin_city_name, received.origin_country_code, received.origin_qualifier],
      ['Friedberg', 'DE', HESSEN],
    );
  });

  it('comes with both ends of a letter in read_message, for its sender and its recipient', async () => {
    for (const reader of [anna, ben]) {
      const [read] = await rpc(db, reader, 'read_message', { message_id: letter.message_id });

      assert.deepEqual(
        [read.origin_city_name, read.origin_qualifier],
        ['Friedberg', HESSEN],
        `as ${reader === anna ? 'its sender' : 'its recipient'}`,
      );
      assert.deepEqual(
        [read.destination_city_name, read.destination_qualifier],
        ['Friedberg', BAVARIA],
      );
    }
  });
});

describe('the rows nothing could find', () => {
  let anna;

  before(async () => {
    anna = await createUser(db, { username: 'quarters', displayName: 'Quarters' });
  });

  it('leaves no city in the list that nothing can find', async () => {
    const { rows } = await db.query(`select name from public.cities where search_index = ''`);
    assert.deepEqual(rows, []);
  });

  for (const [query, town] of [
    [sent('Zürich (Kreis 11)'), 'Zürich (Kreis 11)'],
    ['zurich kreis 3', 'Zürich (Kreis 3)'],
    ['oberwinterthur', 'Oberwinterthur (Kreis 2)'],
    ['stadt winterthur', 'Stadt Winterthur (Kreis 1)'],
    ['seen kreis', 'Seen (Kreis 3)'],
    [sent('Mianzhu, Deyang, Sichuan'), 'Mianzhu, Deyang, Sichuan'],
    ['mianzhu', 'Mianzhu, Deyang, Sichuan'],
    [sent('Ra’s Bayrūt'), 'Ra’s Bayrūt'],
  ]) {
    it(`finds ${town} as "${query}"`, async () => {
      const rows = await search(anna, query);
      assert.equal(rows[0]?.name, town, `found ${rows.map((row) => row.name).join(', ')}`);
    });
  }

  it('lists the Neustadts there are, and not the two quarters of Köln', async () => {
    const names = (await search(anna, 'neustadt')).map((row) => row.name);

    assert.deepEqual(names.filter((name) => name.startsWith('Neustadt')).sort(), [
      'Neustadt am Rübenberge',
      'Neustadt an der Weinstraße',
      'Neustadt in Holstein',
    ]);
    const { rows } = await db.query(`select id from public.cities where id = any($1)`, [
      [NEUSTADT_SUD, NEUSTADT_NORD],
    ]);
    assert.deepEqual(rows, []);
  });

  /**
   * A profile can name a city the search never offered - the column takes any
   * id there is - and a letter names the city it flew from and the one it flew
   * to, which no city can be deleted from under. Taking the two rows out must
   * not fail on a database where either happened, and must not cost anyone a
   * day: their city is the same place under another name.
   */
  describe('on a database where couriers and letters name them', () => {
    let older;
    const couriers = {};

    before(async () => {
      older = await createTestDatabase({ until: BEFORE_DEAD_ROWS });
      const courier = async (name, city) => {
        const id = await createUser(older, { username: name, displayName: name });
        await older.query(`update public.profiles set city_id = $2 where id = $1`, [id, city]);
        return id;
      };

      // Lives in Neustadt/Süd, and has for long.
      couriers.dora = await courier('dora', NEUSTADT_SUD);
      // Has moved from Neustadt/Nord to Munich, and is still settling.
      couriers.emil = await courier('emil', NEUSTADT_NORD);
      await older.query(
        `update public.profiles
         set city_id = (select id from public.cities where name = 'Munich'),
             settled_city_id = $2, city_changed_at = now() - interval '2 hours'
         where id = $1`,
        [couriers.emil, NEUSTADT_NORD],
      );
      // Has moved from Köln to Neustadt/Süd, and is still settling.
      couriers.fritz = await courier('fritz', NEUSTADT_SUD);
      await older.query(
        `update public.profiles
         set settled_city_id = $2, city_changed_at = now() - interval '3 hours'
         where id = $1`,
        [couriers.fritz, KOLN],
      );
      // Has moved from Munich to Neustadt/Nord, five hours ago.
      couriers.gerda = await courier('gerda', NEUSTADT_NORD);
      await older.query(
        `update public.profiles
         set settled_city_id = (select id from public.cities where name = 'Munich'),
             city_changed_at = now() - interval '5 hours'
         where id = $1`,
        [couriers.gerda],
      );
      couriers.gerdaMovedAt = (
        await older.query(`select city_changed_at from public.profiles where id = $1`, [
          couriers.gerda,
        ])
      ).rows[0].city_changed_at;
      // A letter from Neustadt/Süd to Neustadt/Nord, where Emil's bats still are.
      await older.query(
        `insert into public.friendships (requester_id, addressee_id, status, accepted_at)
         values ($1, $2, 'accepted', now())`,
        [couriers.dora, couriers.emil],
      );
      await asUser(older, couriers.dora, () =>
        older.query(`select public.send_message($1, 'Hallo aus der Südstadt.')`, [couriers.emil]),
      );

      // This migration alone: a later one settles at once the moves of couriers
      // who have had no letter, as these have not.
      await applyMigrations(older, { after: BEFORE_DEAD_ROWS, until: DEAD_ROWS_MIGRATION });
    });

    after(async () => {
      await older?.close();
    });

    const profile = async (id) =>
      (
        await older.query(
          `select city_id, settled_city_id, city_changed_at is not null as settling
           from public.profiles where id = $1`,
          [id],
        )
      ).rows[0];

    it('moves a courier who lived there to Köln, without a day of settling', async () => {
      assert.deepEqual(await profile(couriers.dora), {
        city_id: KOLN,
        settled_city_id: null,
        settling: false,
      });
    });

    it('lets a courier settling away from there go on settling, from Köln', async () => {
      const emil = await profile(couriers.emil);
      assert.equal(emil.settled_city_id, KOLN);
      assert.equal(emil.settling, true);
      assert.notEqual(emil.city_id, KOLN);
    });

    /** Her move is not a new one: the day she waits began when she moved. */
    it('lets a courier moving there settle in Köln when she would have settled there', async () => {
      const { rows } = await older.query(
        `select city_id, city_changed_at from public.profiles where id = $1`,
        [couriers.gerda],
      );
      assert.equal(rows[0].city_id, KOLN);
      assert.deepEqual(rows[0].city_changed_at, couriers.gerdaMovedAt);
    });

    it('ends the move of a courier who was moving from Köln to there', async () => {
      assert.deepEqual(await profile(couriers.fritz), {
        city_id: KOLN,
        settled_city_id: null,
        settling: false,
      });
    });

    it('has the letter fly from Köln to Köln, as before to the same places', async () => {
      const { rows } = await older.query(
        `select origin_city_id, destination_city_id from public.messages where sender_id = $1`,
        [couriers.dora],
      );
      assert.deepEqual(rows, [{ origin_city_id: KOLN, destination_city_id: KOLN }]);
    });

    it('takes the two rows out', async () => {
      const { rows } = await older.query(`select id from public.cities where id = any($1)`, [
        [NEUSTADT_SUD, NEUSTADT_NORD],
      ]);
      assert.deepEqual(rows, []);
    });
  });
});

describe('cities table permissions', () => {
  let anna;

  before(async () => {
    anna = await createUser(db, { username: 'ben', displayName: 'Ben' });
  });

  it('is readable by a signed-in user', async () => {
    const rows = await asUser(db, anna, async () => {
      const r = await db.query(`select count(*)::int as count from public.cities`);
      return r.rows;
    });
    assert.ok(rows[0].count > 4000);
  });

  it('is not readable by a signed-out visitor', async () => {
    await assert.rejects(
      () => asAnon(db, () => db.query(`select 1 from public.cities limit 1`)),
      /permission denied for table cities/,
    );
  });

  // Reference data is maintained by migrations only. No policy grants writes.
  it('cannot be written by a signed-in user', async () => {
    await assert.rejects(() =>
      asUser(db, anna, () =>
        db.query(
          `insert into public.cities (id, name, country_code, latitude, longitude, search_index)
           values (-1, 'Nowhere', 'XX', 0, 0, 'nowhere')`,
        ),
      ),
    );
    await assert.rejects(() =>
      asUser(db, anna, () => db.query(`update public.cities set latitude = 0`)),
    );
    await assert.rejects(() => asUser(db, anna, () => db.query(`delete from public.cities`)));
  });
});

describe('profiles.city_id', () => {
  it('starts empty', async () => {
    const user = await createUser(db, { username: 'cara', displayName: 'Cara' });
    const { rows } = await db.query(`select city_id from public.profiles where id = $1`, [user]);
    assert.equal(rows[0].city_id, null);
  });

  it('accepts a real city and can be read back by its owner', async () => {
    const user = await createUser(db, { username: 'dora', displayName: 'Dora' });
    const { rows: city } = await db.query(`select id from public.cities where name = 'Rösrath'`);

    await asUser(db, user, () =>
      db.query(`update public.profiles set city_id = $1 where id = $2`, [city[0].id, user]),
    );

    const read = await asUser(db, user, async () => {
      const r = await db.query(`select city_id from public.profiles where id = $1`, [user]);
      return r.rows;
    });
    assert.equal(read[0].city_id, city[0].id);
  });

  /** A city id the client invented must not be storable. */
  it('rejects a city that does not exist', async () => {
    const user = await createUser(db, { username: 'emil', displayName: 'Emil' });

    await assert.rejects(() =>
      asUser(db, user, () =>
        db.query(`update public.profiles set city_id = $1 where id = $2`, [-12345, user]),
      ),
    );
  });

  it('no longer has a free-text city column', async () => {
    const { rows } = await db.query(
      `select count(*)::int as count from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles' and column_name = 'city'`,
    );
    assert.equal(rows[0].count, 0);
  });
});
