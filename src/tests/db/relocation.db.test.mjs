import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { cityId, createCourier, makeFriends, rpc, setCity } from './fixtures.mjs';
import { asUser, createTestDatabase } from './harness.mjs';

/**
 * Moving house, and why it takes a day.
 *
 * A courier chooses their own city. If a change took effect at once, they could
 * switch to a friend's city, send a twenty-minute letter, and switch back -
 * choosing their own flight time. So a new city becomes where letters leave
 * from, and arrive at, only a day after the move (RELOCATION_HOURS). A first
 * city counts at once.
 */

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

async function annaInBerlinBenInMunich() {
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
