import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cityId, createCourier, makeFriends, rpc, setCity } from './fixtures.mjs';
import {
  applyMigrations,
  asUser,
  createTestDatabase,
  createUser,
  migrationFiles,
} from './harness.mjs';

/**
 * Moving house, and why it takes a day.
 *
 * A courier chooses their own city. If a change took effect at once, they could
 * switch to a friend's city, send a twenty-minute letter, and switch back -
 * choosing their own flight time. So a new city becomes where letters leave
 * from, and arrive at, only a day after the move (RELOCATION_HOURS). A first
 * city counts at once, and so does every move before a courier's first letter,
 * sent or received: there is no flight yet to shorten.
 */

/** The migration that let a move before the first letter count at once, and the one before it. */
const FIRST_LETTER_MIGRATION = '20261121120003_moves_before_the_first_letter.sql';
const BEFORE_FIRST_LETTER = migrationFiles()
  .filter((file) => file < FIRST_LETTER_MIGRATION)
  .at(-1);

let db;

before(async () => {
  db = await createTestDatabase();
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`
    truncate auth.users cascade;
    update private.flight_settings set time_multiplier = 1;
  `);
});

/** Moves a courier the way the city picker does: their own update, through the API role. */
const moveTo = async (who, city) =>
  asUser(db, who, async () =>
    db.query(`update public.profiles set city_id = $1 where id = $2`, [
      await cityId(db, city[0], city[1]),
      who,
    ]),
  );

/** Pretends the courier's last move happened `hours` ago. */
const moveHappenedAgo = (who, hours) =>
  db.query(
    `update public.profiles set city_changed_at = now() - make_interval(hours => $2) where id = $1`,
    [who, hours],
  );

/**
 * Lets `hours` go by for a move that is settling, whenever the database says
 * it began. Unlike moveHappenedAgo, this keeps what the trigger recorded, which
 * is the thing to use where the trigger's own record is what a test is about.
 */
const hoursPass = (who, hours) =>
  db.query(
    `update public.profiles set city_changed_at = city_changed_at - make_interval(hours => $2)
     where id = $1`,
    [who, hours],
  );

const send = async (from, to, body = 'Good evening.') =>
  (await rpc(db, from, 'send_message', { recipient_id: to, body }))[0];

/** How far apart two seeded cities are, as the database measures it. */
const kmBetween = async (from, to) =>
  (
    await db.query(
      `select private.distance_km(a.latitude, a.longitude, b.latitude, b.longitude) as km
       from public.cities a, public.cities b
       where a.id = $1 and b.id = $2`,
      [await cityId(db, from[0], from[1]), await cityId(db, to[0], to[1])],
    )
  ).rows[0].km;

const flightMinutes = async (messageId) => {
  const { rows } = await db.query(
    `select extract(epoch from deliver_at - sent_at) / 60 as minutes, distance_km
     from public.messages where id = $1`,
    [messageId],
  );
  return { minutes: Number(rows[0].minutes), km: rows[0].distance_km };
};

/** Where a courier's move stands: the city in effect until it settles, and since when. */
const settling = async (who) =>
  (
    await db.query(
      `select settled_city_id, city_changed_at is not null as pending
       from public.profiles where id = $1`,
      [who],
    )
  ).rows[0];

/**
 * Two friends who have written to each other already: from the first letter
 * on, a move takes a day. Anna's letter to Ben is still in the air.
 */
async function annaInBerlinBenInMunich() {
  const { anna, ben } = await strangersToLetters();
  await send(anna, ben, 'The first.');
  return { anna, ben };
}

/** Two friends no letter has passed between yet. */
async function strangersToLetters() {
  const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
  const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
  await makeFriends(db, anna, ben);
  return { anna, ben };
}

describe('a first city', () => {
  it('takes effect at once, so a new account can write straight away', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
    await makeFriends(db, anna, ben);

    await moveTo(anna, ['Berlin', 'DE']);
    const sent = await send(anna, ben);

    assert.ok(Math.abs((await flightMinutes(sent.message_id)).km - 505) < 5);
  });
});

/**
 * A first city chosen by mistake - the other Friedberg, a slip on the list -
 * used to stand for a day when put right, for every flight and for what
 * friends were shown. (Found in review.) Until a letter has gone to or from a
 * courier there is no flight to shorten, so until then a move counts at once,
 * as the first choice did.
 */
describe('before the first letter', () => {
  it('counts a move at once', async () => {
    const { anna, ben } = await strangersToLetters();

    await moveTo(anna, ['Hamburg', 'DE']);
    const sent = await send(anna, ben);

    assert.deepEqual(await settling(anna), { settled_city_id: null, pending: false });
    const fromHamburg = await kmBetween(['Hamburg', 'DE'], ['Munich', 'DE']);
    assert.ok(Math.abs((await flightMinutes(sent.message_id)).km - fromHamburg) < 0.001);
  });

  it('counts a move for the recipient at once too, until a letter is on its way to them', async () => {
    const { anna, ben } = await strangersToLetters();

    await moveTo(ben, ['Berlin', 'DE']);
    const sent = await send(anna, ben);

    assert.equal((await flightMinutes(sent.message_id)).km, 0);
  });

  it('holds a move to a day once a letter has gone from the courier', async () => {
    const { anna, ben } = await strangersToLetters();
    await send(anna, ben);

    await moveTo(anna, ['Munich', 'DE']);

    assert.deepEqual(await settling(anna), {
      settled_city_id: await cityId(db, 'Berlin', 'DE'),
      pending: true,
    });
  });

  it('holds a move to a day once a letter is on its way to the courier', async () => {
    const { anna, ben } = await strangersToLetters();
    await send(ben, anna);

    await moveTo(anna, ['Munich', 'DE']);

    assert.equal((await settling(anna)).pending, true);
  });

  /**
   * The first letter may fly from where the courier moved at once: so may a
   * new account's. But the courier then lives there, and a move back takes a
   * day like any other, with every letter of that day flying from there.
   */
  it('lets the first letter fly from where the courier moved, and holds the move back to a day', async () => {
    const { anna, ben } = await strangersToLetters();
    await moveTo(anna, ['Munich', 'DE']);
    const first = await send(anna, ben);

    await moveTo(anna, ['Berlin', 'DE']);
    const second = await send(anna, ben);

    assert.equal((await flightMinutes(first.message_id)).km, 0);
    assert.equal((await flightMinutes(second.message_id)).km, 0);
    assert.equal((await settling(anna)).pending, true);
  });

  /** Letters go with an account; that a courier has had one does not. */
  it('still holds a move to a day after the only letter has gone with its sender', async () => {
    const { anna, ben } = await strangersToLetters();
    await send(ben, anna);
    await asUser(db, ben, () => db.query(`select public.delete_own_account()`));

    await moveTo(anna, ['Munich', 'DE']);

    assert.equal((await settling(anna)).pending, true);
  });

  it('is known to both ends of a letter from the moment it is sent', async () => {
    const { anna, ben } = await strangersToLetters();
    const cara = await createCourier(db, { name: 'cara', city: ['Hamburg', 'DE'] });

    await send(anna, ben);

    const { rows } = await db.query(
      `select id, has_corresponded from public.profiles where id = any($1) order by username`,
      [[anna, ben, cara]],
    );
    assert.deepEqual(
      rows.map((row) => row.has_corresponded),
      [true, true, false],
    );
  });

  it('is read by the courier with the rest of their profile, and cannot be written', async () => {
    const { anna } = await strangersToLetters();

    const read = await asUser(
      db,
      anna,
      async () =>
        (await db.query(`select has_corresponded from public.profiles where id = $1`, [anna])).rows,
    );
    assert.deepEqual(read, [{ has_corresponded: false }]);
    await assert.rejects(() =>
      asUser(db, anna, () =>
        db.query(`update public.profiles set has_corresponded = true where id = $1`, [anna]),
      ),
    );
  });
});

/** Couriers who had letters before the migration have had them after it too. */
describe('the first letters there were before', () => {
  let older;

  before(async () => {
    older = await createTestDatabase({ until: BEFORE_FIRST_LETTER });
  });

  after(async () => {
    await older?.close();
  });

  it('are counted for everyone who sent or received one', async () => {
    const courier = async (name) => {
      const id = await createUser(older, { username: name, displayName: name });
      await older.query(
        `update public.profiles set city_id = (select id from public.cities where name = 'Berlin')
         where id = $1`,
        [id],
      );
      return id;
    };
    const [dora, emil, fritz] = [
      await courier('dora'),
      await courier('emil'),
      await courier('fritz'),
    ];
    await older.query(
      `insert into public.friendships (requester_id, addressee_id, status, accepted_at)
       values ($1, $2, 'accepted', now())`,
      [dora, emil],
    );
    await asUser(older, dora, () =>
      older.query(`select public.send_message($1, 'Hallo.')`, [emil]),
    );
    // Dora and Fritz both moved to Munich a moment ago, and wait for it to count.
    for (const who of [dora, fritz]) {
      await asUser(older, who, () =>
        older.query(
          `update public.profiles set city_id = (select id from public.cities where name = 'Munich')
           where id = $1`,
          [who],
        ),
      );
    }

    await applyMigrations(older, { after: BEFORE_FIRST_LETTER });

    const { rows } = await older.query(
      `select has_corresponded, city_changed_at is not null as settling
       from public.profiles where id = any($1) order by username`,
      [[dora, emil, fritz]],
    );
    assert.deepEqual(rows, [
      { has_corresponded: true, settling: true },
      { has_corresponded: true, settling: false },
      // Fritz has had no letter: his move counts now, as it would have under the rule.
      { has_corresponded: false, settling: false },
    ]);
  });
});

describe('moving', () => {
  /** The reason this file exists. */
  it('cannot shorten a flight by borrowing a friend’s city', async () => {
    const { anna, ben } = await annaInBerlinBenInMunich();

    await moveTo(anna, ['Munich', 'DE']);
    const sent = await send(anna, ben);
    await moveTo(anna, ['Berlin', 'DE']);

    const flight = await flightMinutes(sent.message_id);
    assert.ok(Math.abs(flight.km - 505) < 5, `flew ${flight.km} km`);
    assert.ok(flight.minutes > 6 * 60, `took ${flight.minutes} minutes`);
  });

  it('makes the new city where letters leave from once a day has passed', async () => {
    const { anna, ben } = await annaInBerlinBenInMunich();
    await moveTo(anna, ['Munich', 'DE']);
    await moveHappenedAgo(anna, 25);

    const sent = await send(anna, ben);

    assert.equal((await flightMinutes(sent.message_id)).km, 0);
  });

  it('still counts the old city a moment before the day is out', async () => {
    const { anna, ben } = await annaInBerlinBenInMunich();
    await moveTo(anna, ['Munich', 'DE']);
    await moveHappenedAgo(anna, 23);

    const sent = await send(anna, ben);

    assert.ok((await flightMinutes(sent.message_id)).km > 500);
  });

  /**
   * Otherwise: move anywhere today, switch to a friend's city a minute before
   * the day is out, and the friend's city counts a minute later.
   *
   * This test used to set the time of the second move by hand, which wrote
   * over the very thing it is about - whether the database restarted the wait
   * - and passed with a trigger that did not. (Found in review.) Time now only
   * goes by; when the second move began is left as the trigger recorded it.
   */
  it('restarts the wait when a courier moves on again before settling', async () => {
    const { anna, ben } = await annaInBerlinBenInMunich();
    await moveTo(anna, ['Hamburg', 'DE']);
    await moveHappenedAgo(anna, 23);
    await moveTo(anna, ['Munich', 'DE']);
    // Twenty-five hours after the first move, two after the second.
    await hoursPass(anna, 2);

    const sent = await send(anna, ben);

    // Still from Berlin: neither Hamburg nor Munich has been home for a day.
    assert.ok(Math.abs((await flightMinutes(sent.message_id)).km - 505) < 5);
  });

  it('counts the second city a day after the second move', async () => {
    const { anna, ben } = await annaInBerlinBenInMunich();
    await moveTo(anna, ['Hamburg', 'DE']);
    await moveHappenedAgo(anna, 23);
    await moveTo(anna, ['Munich', 'DE']);
    await hoursPass(anna, 25);

    const sent = await send(anna, ben);

    assert.equal((await flightMinutes(sent.message_id)).km, 0);
  });

  /**
   * The city a courier moved away from stays on the profile until the nightly
   * tidy-up forgets it, long after the move has settled. A later move must
   * leave from where the courier has come to live since, not from there.
   */
  it('leaves from the city that became home when a courier moves again later', async () => {
    const { anna, ben } = await annaInBerlinBenInMunich();
    await moveTo(anna, ['Hamburg', 'DE']);
    await moveHappenedAgo(anna, 25);
    await moveTo(anna, ['Munich', 'DE']);

    const sent = await send(anna, ben);

    const flown = (await flightMinutes(sent.message_id)).km;
    const fromHamburg = await kmBetween(['Hamburg', 'DE'], ['Munich', 'DE']);
    assert.ok(fromHamburg > 550, `Hamburg to Munich is ${fromHamburg} km`);
    assert.ok(Math.abs(flown - fromHamburg) < 0.001, `flew ${flown} km, not from Hamburg`);
  });

  it('cancels the move when a courier goes back before settling', async () => {
    const { anna } = await annaInBerlinBenInMunich();
    await moveTo(anna, ['Munich', 'DE']);
    await moveTo(anna, ['Berlin', 'DE']);

    const { rows } = await db.query(
      `select settled_city_id, city_changed_at from public.profiles where id = $1`,
      [anna],
    );
    assert.deepEqual(rows[0], { settled_city_id: null, city_changed_at: null });
  });

  it('is not skipped by clearing the city and choosing again', async () => {
    const { anna, ben } = await annaInBerlinBenInMunich();
    await setCity(db, anna, null);
    await moveTo(anna, ['Munich', 'DE']);

    const sent = await send(anna, ben);

    assert.ok(Math.abs((await flightMinutes(sent.message_id)).km - 505) < 5);
  });

  it('applies to the recipient too: letters aim for where they lived until they settle', async () => {
    const { anna, ben } = await annaInBerlinBenInMunich();
    await moveTo(ben, ['Berlin', 'DE']);

    const sent = await send(anna, ben);

    assert.ok(Math.abs((await flightMinutes(sent.message_id)).km - 505) < 5);
  });

  it('quotes the same flight in the friend list as a send would take', async () => {
    const { anna, ben } = await annaInBerlinBenInMunich();
    await moveTo(anna, ['Munich', 'DE']);

    const [route] = await rpc(db, anna, 'list_friends');
    const sent = await send(anna, ben);

    assert.ok(Math.abs(route.distance_km - (await flightMinutes(sent.message_id)).km) < 0.001);
  });
});

describe('the settling columns', () => {
  it('cannot be written by the courier', async () => {
    const { anna } = await annaInBerlinBenInMunich();
    await moveTo(anna, ['Munich', 'DE']);

    await assert.rejects(() =>
      asUser(db, anna, () =>
        db.query(
          `update public.profiles set city_changed_at = null, settled_city_id = null where id = $1`,
          [anna],
        ),
      ),
    );
    await assert.rejects(() =>
      asUser(db, anna, () =>
        db.query(
          `update public.profiles set city_changed_at = now() - interval '2 days' where id = $1`,
          [anna],
        ),
      ),
    );
  });

  it('are left alone by an update that does not change the city', async () => {
    const { anna } = await annaInBerlinBenInMunich();
    await moveTo(anna, ['Munich', 'DE']);
    const before = (
      await db.query(`select settled_city_id, city_changed_at from public.profiles where id = $1`, [
        anna,
      ])
    ).rows[0];

    await asUser(db, anna, () =>
      db.query(`update public.profiles set display_name = 'Anna W.' where id = $1`, [anna]),
    );

    const afterUpdate = (
      await db.query(`select settled_city_id, city_changed_at from public.profiles where id = $1`, [
        anna,
      ])
    ).rows[0];
    assert.deepEqual(afterUpdate, before);
  });
});

/**
 * The city picker's question says where the bats leave from, and the move is
 * saved only while they still leave from there when the save arrives: on a
 * PostgREST filter the app builds from the row the way private.settle_city
 * reads it (departingFrom in use-profile.ts). Pinned in Jest only as words, the
 * filter could read a city cleared by hand, a settled city with no time of the
 * move, or the last millisecond of the day differently from the trigger, and
 * nothing would notice. (Found in review.) So each filter the app sends - the
 * fixture's, which use-profile.test.ts holds to the function - is applied here
 * as PostgREST applies it, in the courier's own save, to a courier in each
 * state, next to what the trigger decides for that state.
 *
 * The filters were built at the fixture's `now`, and the trigger reads the
 * clock: so each state is put in twice, its times measured once from the
 * fixture's moment for the filters and once from the database's own for the
 * trigger. Both decide by how long ago the move was, and by nothing else.
 */
describe('the condition the city picker saves a move on', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const FIXTURE = JSON.parse(
    readFileSync(
      join(HERE, '..', '..', 'features', 'profile', 'departing-filter.fixture.json'),
      'utf8',
    ),
  );
  const CONFIG = readFileSync(join(HERE, '..', '..', 'constants', 'config.ts'), 'utf8');
  const RELOCATION_HOURS = Number(/export const RELOCATION_HOURS = ([0-9.]+)/.exec(CONFIG)[1]);

  const MILLISECOND = 1;
  const HOUR = 3_600_000;
  const DAY = RELOCATION_HOURS * HOUR;

  /** PostgREST's operators, for those the app's filters use. */
  const OPERATORS = { eq: '=', gt: '>', lte: '<=' };

  /**
   * A filter as `.or()` sends it, in the SQL PostgREST makes of it: the terms
   * of `or=(...)` joined by OR, `and(...)` and `or(...)` within them, and each
   * `column.operator.value` with its value bound as a parameter. An operator
   * the app does not send is an error here rather than a filter read wrongly.
   */
  function sqlOf(filter, values) {
    return `(${terms(filter)
      .map((term) => termSql(term, values))
      .join(' or ')})`;
  }

  function termSql(term, values) {
    const group = /^(and|or)\((.*)\)$/.exec(term);
    if (group) {
      return `(${terms(group[2])
        .map((inner) => termSql(inner, values))
        .join(` ${group[1]} `)})`;
    }
    const [, column, operator, value] = /^([a-z_]+)\.([a-z]+)\.(.+)$/.exec(term) ?? [];
    if (operator === 'is' && value === 'null') return `${column} is null`;
    if (!column || !Object.hasOwn(OPERATORS, operator)) {
      throw new Error(`not a filter the app sends: ${term}`);
    }
    values.push(value);
    return `${column} ${OPERATORS[operator]} $${values.length}`;
  }

  /** The terms of a list, split at the commas outside brackets. */
  function terms(list) {
    const found = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i] === '(') depth++;
      else if (list[i] === ')') depth--;
      else if (list[i] === ',' && depth === 0) {
        found.push(list.slice(start, i));
        start = i + 1;
      }
    }
    found.push(list.slice(start));
    return found;
  }

  /** Runs `fn` in a transaction that is then undone, so that what it saved is not kept. */
  async function undone(fn) {
    await db.exec('begin');
    try {
      return await fn();
    } finally {
      await db.exec('rollback');
    }
  }

  /**
   * Puts a courier who has had letters into `state`: a city, the city a move
   * is settling away from, and how long ago the move was, in milliseconds
   * before `moment` - or, for a null moment, before this transaction's now(),
   * which is what the trigger reads.
   */
  async function putIn(who, { city, settled, before }, moment) {
    // The city first: changing it fires the trigger, which writes the other
    // two columns itself.
    await db.query(
      `update public.profiles set city_id = $2, has_corresponded = true where id = $1`,
      [who, city],
    );
    await db.query(
      `update public.profiles
       set settled_city_id = $2,
           city_changed_at = coalesce($4::timestamptz, date_trunc('milliseconds', now()))
                             - $3 * interval '1 millisecond'
       where id = $1`,
      [who, settled, before, moment],
    );
  }

  /**
   * Where private.settle_city has the bats leave from: the city it keeps them
   * in for a day when the courier moves on to one they are not in - Köln, here
   * - or null for nowhere, when the move counts at once.
   */
  const departingFor = (who, state) =>
    undone(async () => {
      await putIn(who, state, null);
      const koeln = await cityId(db, 'Köln', 'DE');
      await asUser(db, who, () =>
        db.query(`update public.profiles set city_id = $2 where id = $1`, [who, koeln]),
      );
      const { rows } = await db.query(
        `select settled_city_id, city_changed_at is not null as settling
         from public.profiles where id = $1`,
        [who],
      );
      assert.equal(rows[0].settling, rows[0].settled_city_id !== null);
      return rows[0].settled_city_id;
    });

  /** Whether the courier's save on `filter` changes their row, as PostgREST runs it. */
  const savesOn = (who, state, filter) =>
    undone(async () => {
      await putIn(who, state, FIXTURE.now);
      const values = [await cityId(db, 'Köln', 'DE'), who];
      const where = sqlOf(filter, values);
      const { rows } = await asUser(db, who, () =>
        db.query(
          `update public.profiles set city_id = $1 where id = $2 and ${where} returning id`,
          values,
        ),
      );
      return rows.length === 1;
    });

  it('has a filter for each city its states name, by the id the seed data gives it', async () => {
    for (const { city, departing } of FIXTURE.filters) {
      assert.equal(city === null ? null : await cityId(db, city[0], city[1]), departing);
    }
  });

  // Each state: a city, the one a move is settling away from, how long ago
  // the move was - and where the bats leave from, as the trigger reads it.
  const BERLIN = ['Berlin', 'DE'];
  const MUNICH = ['Munich', 'DE'];
  const STATES = [
    ['no city and no move', [null, null, null], null],
    ['a city and no move', [MUNICH, null, null], MUNICH],
    ['a move an hour old', [MUNICH, BERLIN, HOUR], BERLIN],
    ['a move that settled an hour ago', [MUNICH, BERLIN, DAY + HOUR], MUNICH],
    ['a move a day old to the millisecond', [MUNICH, BERLIN, DAY], MUNICH],
    ['a move a millisecond short of a day', [MUNICH, BERLIN, DAY - MILLISECOND], BERLIN],
    ['a move a millisecond over a day', [MUNICH, BERLIN, DAY + MILLISECOND], MUNICH],
    ['a settled city and no time of the move', [MUNICH, BERLIN, null], MUNICH],
    ['a time of a move and no settled city', [MUNICH, null, HOUR], MUNICH],
    ['the city cleared while a move settles', [null, BERLIN, HOUR], BERLIN],
    ['the city cleared and the move settled', [null, BERLIN, DAY + HOUR], null],
    ['the city cleared, a settled city and no time', [null, BERLIN, null], null],
  ];

  const idOf = async (city) => (city ? cityId(db, city[0], city[1]) : null);

  for (const [description, [city, settled, before], expected] of STATES) {
    it(`saves for ${description} only on leaving from where the trigger has the bats leave`, async () => {
      const anna = await createCourier(db, { name: 'anna' });
      const state = { city: await idOf(city), settled: await idOf(settled), before };

      const departing = await departingFor(anna, state);
      assert.equal(departing, await idOf(expected), 'where the trigger has them leave from');

      for (const { departing: asked, filter } of FIXTURE.filters) {
        assert.equal(
          await savesOn(anna, state, filter),
          asked === departing,
          `the save on leaving from ${asked ?? 'nowhere'}`,
        );
      }
    });
  }
});
