import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

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
    await applyMigrations(after_, { after: BEFORE_SPELLINGS });
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
