import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { asAnon, asUser, createTestDatabase, createUser } from './harness.mjs';

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

  it('is not available to a signed-out visitor', async () => {
    await assert.rejects(() =>
      asAnon(db, () => db.query(`select * from public.search_cities('berlin', 20)`)),
    );
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
    await assert.rejects(() => asAnon(db, () => db.query(`select 1 from public.cities limit 1`)));
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
