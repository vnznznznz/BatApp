import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { count, createCourier, makeFriends, rejectsWithHint, rpc, setCity } from './fixtures.mjs';
import { asAnon, asUser, createTestDatabase } from './harness.mjs';

let db;

before(async () => {
  db = await createTestDatabase();
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`truncate auth.users cascade;`);
});

const request = (from, username) => rpc(db, from, 'request_friend', { username });
const accept = (by, friendshipId) => rpc(db, by, 'accept_friend', { friendship_id: friendshipId });
const remove = (by, friendshipId) => rpc(db, by, 'remove_friend', { friendship_id: friendshipId });
const listFriends = (who) => rpc(db, who, 'list_friends');

/** The single result of a scalar-returning function. */
const outcome = (rows) => Object.values(rows[0])[0];

const pairRows = (a, b) =>
  count(
    db,
    `select 1 from public.friendships
     where least(requester_id, addressee_id) = least($1::uuid, $2::uuid)
       and greatest(requester_id, addressee_id) = greatest($1::uuid, $2::uuid)`,
    [a, b],
  );

const friendshipId = async (a, b) => {
  const { rows } = await db.query(
    `select id from public.friendships
     where least(requester_id, addressee_id) = least($1::uuid, $2::uuid)
       and greatest(requester_id, addressee_id) = greatest($1::uuid, $2::uuid)`,
    [a, b],
  );
  return rows[0]?.id;
};

describe('asking', () => {
  it('creates a pending request addressed by username', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });

    assert.equal(outcome(await request(anna, 'ben')), 'requested');

    const { rows } = await db.query(
      `select requester_id, addressee_id, status, accepted_at from public.friendships`,
    );
    assert.deepEqual(rows, [
      { requester_id: anna, addressee_id: ben, status: 'pending', accepted_at: null },
    ]);
  });

  it('matches the username however it was typed', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await createCourier(db, { name: 'ben' });

    assert.equal(outcome(await request(anna, '  BEN ')), 'requested');
  });

  it('says so when nobody has that username', async () => {
    const anna = await createCourier(db, { name: 'anna' });

    await rejectsWithHint(request(anna, 'nobody'), 'unknown_username');
  });

  /** Exact match only: a prefix must not find anyone, or the service is browsable. */
  it('does not match a username by prefix', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await createCourier(db, { name: 'benjamin' });

    await rejectsWithHint(request(anna, 'ben'), 'unknown_username');
  });

  it('refuses a request to yourself', async () => {
    const anna = await createCourier(db, { name: 'anna' });

    await rejectsWithHint(request(anna, 'anna'), 'cannot_befriend_self');
  });

  it('does not duplicate a request asked twice', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });

    await request(anna, 'ben');
    assert.equal(outcome(await request(anna, 'ben')), 'already_requested');

    assert.equal(await pairRows(anna, ben), 1);
  });

  it('treats asking back as accepting', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });

    await request(anna, 'ben');
    assert.equal(outcome(await request(ben, 'anna')), 'accepted');

    const { rows } = await db.query(`select status, accepted_at from public.friendships`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'accepted');
    assert.ok(rows[0].accepted_at);
  });

  it('says so when they are already friends', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await makeFriends(db, anna, ben);

    assert.equal(outcome(await request(anna, 'ben')), 'already_friends');
    assert.equal(outcome(await request(ben, 'anna')), 'already_friends');
  });

  it('keeps one row per pair whichever way round it is written', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await makeFriends(db, anna, ben);

    await assert.rejects(
      () =>
        db.query(`insert into public.friendships (requester_id, addressee_id) values ($1, $2)`, [
          ben,
          anna,
        ]),
      /friendships_pair_idx/,
    );
  });

  it('is not available to a signed-out visitor', async () => {
    await createCourier(db, { name: 'ben' });

    await assert.rejects(() => asAnon(db, () => db.query(`select public.request_friend('ben')`)));
  });
});

describe('answering', () => {
  it('lets the person asked accept', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(anna, 'ben');

    await accept(ben, await friendshipId(anna, ben));

    const { rows } = await db.query(`select status from public.friendships`);
    assert.equal(rows[0].status, 'accepted');
  });

  it('does not let the person asking accept their own request', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(anna, 'ben');

    await rejectsWithHint(accept(anna, await friendshipId(anna, ben)), 'request_not_found');
  });

  it('does not let anyone else accept it', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cara = await createCourier(db, { name: 'cara' });
    await request(anna, 'ben');

    await rejectsWithHint(accept(cara, await friendshipId(anna, ben)), 'request_not_found');

    const { rows } = await db.query(`select status from public.friendships`);
    assert.equal(rows[0].status, 'pending');
  });

  it('lets the person asked decline', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(anna, 'ben');

    await remove(ben, await friendshipId(anna, ben));

    assert.equal(await pairRows(anna, ben), 0);
  });

  it('lets the person asking withdraw', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(anna, 'ben');

    await remove(anna, await friendshipId(anna, ben));

    assert.equal(await pairRows(anna, ben), 0);
  });

  it('lets either friend end a friendship', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cara = await createCourier(db, { name: 'cara' });
    await makeFriends(db, anna, ben);
    await makeFriends(db, cara, ben);

    await remove(ben, await friendshipId(anna, ben));
    await remove(cara, await friendshipId(cara, ben));

    assert.equal(await count(db, `select 1 from public.friendships`), 0);
  });

  it('does not let a third person end it', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cara = await createCourier(db, { name: 'cara' });
    await makeFriends(db, anna, ben);

    await rejectsWithHint(remove(cara, await friendshipId(anna, ben)), 'friendship_not_found');

    assert.equal(await pairRows(anna, ben), 1);
  });

  it('lets two people become friends again after parting', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await makeFriends(db, anna, ben);
    await remove(anna, await friendshipId(anna, ben));

    assert.equal(outcome(await request(ben, 'anna')), 'requested');
  });
});

describe('list_friends', () => {
  /**
   * Somebody who has merely been asked has agreed to nothing. A stranger who
   * guesses a username must learn no more than that it exists.
   */
  it('shows only the username of someone you have asked', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
    await request(anna, 'ben');

    const [row] = await listFriends(anna);

    assert.equal(row.status, 'pending');
    assert.equal(row.direction, 'outgoing');
    assert.equal(row.friend_id, ben);
    assert.equal(row.username, 'ben');
    assert.equal(row.display_name, null);
    assert.equal(row.city_name, null);
    assert.equal(row.country_code, null);
    assert.equal(row.distance_km, null);
    assert.equal(row.flight_seconds, null);
  });

  it('shows the name, but not the city, of someone asking you', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
    await request(anna, 'ben');

    const [row] = await listFriends(ben);

    assert.equal(row.direction, 'incoming');
    assert.equal(row.friend_id, anna);
    assert.equal(row.display_name, 'anna');
    assert.equal(row.city_name, null);
    assert.equal(row.distance_km, null);
    assert.equal(row.flight_seconds, null);
  });

  it('shows a friend’s city, the distance, and how long a bat takes', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
    await makeFriends(db, anna, ben);

    const [row] = await listFriends(anna);

    assert.equal(row.status, 'accepted');
    assert.equal(row.display_name, 'ben');
    assert.equal(row.city_name, 'Munich');
    assert.equal(row.country_code, 'DE');
    // Berlin to Munich is about 505 km as the bat flies.
    assert.ok(Math.abs(row.distance_km - 505) < 5, `distance ${row.distance_km}`);
    // ...which at 80 km/h is a little over six hours.
    assert.ok(Math.abs(row.flight_seconds - (row.distance_km / 80) * 3600) <= 1);
  });

  it('gives no flight time while either side has no city', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
    const cara = await createCourier(db, { name: 'cara', city: ['Berlin', 'DE'] });
    const dora = await createCourier(db, { name: 'dora' });
    await makeFriends(db, anna, ben);
    await makeFriends(db, cara, dora);

    const [fromNowhere] = await listFriends(anna);
    const [toNowhere] = await listFriends(cara);

    assert.equal(fromNowhere.distance_km, null);
    assert.equal(fromNowhere.flight_seconds, null);
    assert.equal(fromNowhere.city_name, 'Munich');
    assert.equal(toNowhere.distance_km, null);
    assert.equal(toNowhere.flight_seconds, null);
    assert.equal(toNowhere.city_name, null);
  });

  it('applies the same minimum flight time as a real send', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben', city: ['Berlin', 'DE'] });
    await makeFriends(db, anna, ben);

    const [row] = await listFriends(anna);

    assert.equal(row.distance_km, 0);
    assert.equal(row.flight_seconds, 20 * 60);
  });

  it('lists only the caller’s own friendships', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cara = await createCourier(db, { name: 'cara' });
    const dora = await createCourier(db, { name: 'dora' });
    await makeFriends(db, anna, ben);
    await makeFriends(db, cara, dora);

    const rows = await listFriends(anna);

    assert.deepEqual(
      rows.map((row) => row.username),
      ['ben'],
    );
  });

  /** A new city counts a day after the move; see relocation.db.test.mjs. */
  it('follows a friend who moves, once their bats have settled', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
    await makeFriends(db, anna, ben);
    await setCity(db, ben, ['Hamburg', 'DE']);

    assert.equal((await listFriends(anna))[0].city_name, 'Munich');

    await db.query(
      `update public.profiles set city_changed_at = now() - interval '25 hours' where id = $1`,
      [ben],
    );

    assert.equal((await listFriends(anna))[0].city_name, 'Hamburg');
  });
});

describe('row level security', () => {
  it('lets each side see the row, and nobody else', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cara = await createCourier(db, { name: 'cara' });
    await makeFriends(db, anna, ben);

    const seenBy = async (who) =>
      (await asUser(db, who, () => db.query(`select id from public.friendships`))).rows.length;

    assert.equal(await seenBy(anna), 1);
    assert.equal(await seenBy(ben), 1);
    assert.equal(await seenBy(cara), 0);
  });

  /** Otherwise "pending" could be turned into "accepted" without being asked. */
  it('refuses every direct write', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(anna, 'ben');

    await assert.rejects(() =>
      asUser(db, anna, () =>
        db.query(
          `update public.friendships set status = 'accepted', accepted_at = now() where requester_id = $1`,
          [anna],
        ),
      ),
    );
    await assert.rejects(() =>
      asUser(db, anna, () =>
        db.query(
          `insert into public.friendships (requester_id, addressee_id, status, accepted_at)
           values ($1, $2, 'accepted', now())`,
          [ben, anna],
        ),
      ),
    );
    await assert.rejects(() => asUser(db, anna, () => db.query(`delete from public.friendships`)));

    const { rows } = await db.query(`select status from public.friendships`);
    assert.deepEqual(rows, [{ status: 'pending' }]);
  });
});

describe('account deletion', () => {
  it('ends every friendship the account had', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cara = await createCourier(db, { name: 'cara' });
    await makeFriends(db, anna, ben);
    await request(cara, 'anna');

    await asUser(db, anna, () => db.query(`select public.delete_own_account()`));

    assert.equal(await count(db, `select 1 from public.friendships`), 0);
  });
});
