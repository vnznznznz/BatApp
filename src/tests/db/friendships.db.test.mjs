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
const withdraw = (by, friendshipId) =>
  rpc(db, by, 'withdraw_request', { friendship_id: friendshipId });
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

const statusOf = async (a, b) => {
  const { rows } = await db.query(
    `select status from public.friendships
     where least(requester_id, addressee_id) = least($1::uuid, $2::uuid)
       and greatest(requester_id, addressee_id) = greatest($1::uuid, $2::uuid)`,
    [a, b],
  );
  return rows[0]?.status;
};

/** Catches a refusal, to compare it with another one whole. */
async function refusal(promise) {
  try {
    await promise;
  } catch (error) {
    return { message: error.message, hint: error.hint, code: error.code };
  }
  assert.fail('expected a refusal');
}

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

  /**
   * Refused by the grant, not by the function: private.caller() would refuse
   * a visitor anyway, so a refusal without its reason would pass as well for
   * a function granted to everyone, or one that does not exist.
   */
  it('is not available to a signed-out visitor', async () => {
    await createCourier(db, { name: 'ben' });

    await assert.rejects(
      () => asAnon(db, () => db.query(`select public.request_friend('ben')`)),
      /permission denied for function request_friend/,
    );
    await assert.rejects(
      () =>
        asAnon(db, () =>
          db.query(`select public.withdraw_request('00000000-0000-4000-8000-000000000000')`),
        ),
      /permission denied for function withdraw_request/,
    );
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

  it('lets the person asking take a request back while it is still waiting', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(anna, 'ben');

    await withdraw(anna, await friendshipId(anna, ben));

    assert.equal(await pairRows(anna, ben), 0);
  });

  /**
   * "Withdraw" is a button on a list loaded a while ago. Through remove_friend,
   * pressing it after the other person had accepted ended the friendship they
   * had just made, without a word to either of them. (Found in review.)
   */
  it('does not end a friendship when a request accepted in the meantime is taken back', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(anna, 'ben');
    const id = await friendshipId(anna, ben);
    await accept(ben, id);

    await rejectsWithHint(withdraw(anna, id), 'request_not_found');

    assert.equal(await statusOf(anna, ben), 'accepted');
  });

  it('does not let the person asked, or anyone else, take a request back', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cara = await createCourier(db, { name: 'cara' });
    await request(anna, 'ben');
    const id = await friendshipId(anna, ben);

    await rejectsWithHint(withdraw(ben, id), 'request_not_found');
    await rejectsWithHint(withdraw(cara, id), 'request_not_found');

    assert.equal(await statusOf(anna, ben), 'pending');
  });

  it('says so when the request to take back has already gone', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(anna, 'ben');
    const id = await friendshipId(anna, ben);
    await remove(ben, id);

    await rejectsWithHint(withdraw(anna, id), 'request_not_found');
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

/**
 * Nothing limited asking: one account could put a request, and the name it had
 * chosen, in front of every courier whose username it could find, and ask again
 * the moment it was declined. (Found in review.)
 */
describe('asking a lot', () => {
  let limit;

  before(async () => {
    limit = (await db.query(`select private.friend_requests_per_hour() as limit`)).rows[0].limit;
  });

  /** New couriers named `<prefix>0`, `<prefix>1`, ..., each asked by `from`. */
  async function askNew(from, howMany, prefix = 'other') {
    for (let i = 0; i < howMany; i++) {
      await createCourier(db, { name: `${prefix}${i}` });
      assert.equal(outcome(await request(from, `${prefix}${i}`)), 'requested');
    }
  }

  const counted = async (who) =>
    (
      await db.query(
        `select requests, hour_began_at from private.friend_request_counts where courier_id = $1`,
        [who],
      )
    ).rows;

  it('takes twenty new requests in an hour, and refuses the next', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await createCourier(db, { name: 'onemore' });
    assert.equal(limit, 20);

    await askNew(anna, limit);

    await rejectsWithHint(request(anna, 'onemore'), 'too_many_friend_requests');
    assert.equal(
      await count(db, `select 1 from public.friendships where requester_id = $1`, [anna]),
      limit,
    );
  });

  /**
   * Decided before the username is looked up, so the refusal cannot be used to
   * go on finding out which usernames exist.
   */
  it('refuses every call past the limit alike, whoever is named', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await createCourier(db, { name: 'stranger' });
    const friend = await createCourier(db, { name: 'friend' });
    const asker = await createCourier(db, { name: 'asker' });
    await makeFriends(db, anna, friend);
    await request(asker, 'anna');
    await askNew(anna, limit);

    const refused = await refusal(request(anna, 'nobody'));

    assert.equal(refused.hint, 'too_many_friend_requests');
    assert.equal(refused.code, 'P0001');
    for (const username of ['stranger', 'other0', 'friend', 'asker', 'anna']) {
      assert.deepEqual(await refusal(request(anna, username)), refused, username);
    }
    // The request that was waiting for Anna is still hers to accept.
    assert.equal(await statusOf(anna, asker), 'pending');
    await accept(anna, await friendshipId(anna, asker));
    assert.equal(await statusOf(anna, asker), 'accepted');
  });

  it('does not count what made no new request', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const friend = await createCourier(db, { name: 'friend' });
    const asker = await createCourier(db, { name: 'asker' });
    await createCourier(db, { name: 'last' });
    await createCourier(db, { name: 'onemore' });
    await makeFriends(db, anna, friend);
    await request(asker, 'anna');
    await askNew(anna, limit - 1);

    // A name nobody has, her own, a repeat, a friend, and an answer to someone who asked first.
    await rejectsWithHint(request(anna, 'nobody'), 'unknown_username');
    await rejectsWithHint(request(anna, 'anna'), 'cannot_befriend_self');
    assert.equal(outcome(await request(anna, 'other0')), 'already_requested');
    assert.equal(outcome(await request(anna, 'friend')), 'already_friends');
    assert.equal(outcome(await request(anna, 'asker')), 'accepted');

    assert.equal((await counted(anna))[0].requests, limit - 1);
    assert.equal(outcome(await request(anna, 'last')), 'requested');
    await rejectsWithHint(request(anna, 'onemore'), 'too_many_friend_requests');
  });

  /** Otherwise asking, being declined and asking again would never run out. */
  it('still counts a request that was declined or taken back', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });

    for (let i = 0; i < limit; i++) {
      assert.equal(outcome(await request(anna, 'ben')), 'requested');
      const id = await friendshipId(anna, ben);
      if (i % 2) await remove(ben, id);
      else await withdraw(anna, id);
    }

    await rejectsWithHint(request(anna, 'ben'), 'too_many_friend_requests');
    assert.equal(await pairRows(anna, ben), 0);
  });

  it('counts each courier on their own', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await askNew(anna, limit);

    assert.equal(outcome(await request(ben, 'other0')), 'requested');
  });

  it('starts again when the hour is over, and not a moment before', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await createCourier(db, { name: 'later' });
    await askNew(anna, limit);
    const hourBegan = (minutesAgo) =>
      db.query(
        `update private.friend_request_counts
         set hour_began_at = now() - make_interval(mins => $2) where courier_id = $1`,
        [anna, minutesAgo],
      );

    await hourBegan(59);
    await rejectsWithHint(request(anna, 'later'), 'too_many_friend_requests');

    await hourBegan(61);
    assert.equal(outcome(await request(anna, 'later')), 'requested');

    const [row] = await counted(anna);
    assert.equal(row.requests, 1);
    assert.ok(Date.now() - row.hour_began_at.getTime() < 60_000, 'a new hour began with it');
  });

  /** The smallest record that can do this: nothing in it says who was asked. */
  it('keeps one row for a courier: when the hour began, and how many', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await askNew(anna, 3);

    const { rows: columns } = await db.query(
      `select column_name from information_schema.columns
       where table_schema = 'private' and table_name = 'friend_request_counts'
       order by 1`,
    );
    assert.deepEqual(
      columns.map((column) => column.column_name),
      ['courier_id', 'hour_began_at', 'requests'],
    );
    assert.equal(await count(db, `select 1 from private.friend_request_counts`), 1);
    assert.equal((await counted(anna))[0].requests, 3);
  });

  it('forgets the count with the account, however the account goes', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(anna, 'ben');
    await request(ben, 'anna');
    await askNew(ben, 1);

    await rpc(db, anna, 'delete_own_account');
    await db.query(`select private.remove_account($1)`, [ben]);

    assert.equal(await count(db, `select 1 from private.friend_request_counts`), 0);
  });

  it('cannot be read or reset through the API', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await askNew(anna, 1);

    for (const sql of [
      `select * from private.friend_request_counts`,
      `delete from private.friend_request_counts`,
      `select private.over_friend_request_limit('${anna}')`,
    ]) {
      await assert.rejects(
        asUser(db, anna, () => db.query(sql)),
        /permission denied/,
        sql,
      );
    }
  });
});

describe('list_friends', () => {
  /**
   * The API hands over at most a thousand rows of any answer. Newest first,
   * a thousand waiting requests pushed every friend off the end of the list,
   * and the app said "No friends yet". (Found in review, with 1,005 accounts.)
   */
  it('lists friends before requests, so the API’s row cap cannot hide a friend', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cara = await createCourier(db, { name: 'cara' });
    await createCourier(db, { name: 'dora' });
    await makeFriends(db, anna, ben);
    await db.query(
      `update public.friendships
       set created_at = now() - interval '30 days', accepted_at = now() - interval '29 days'`,
    );
    await request(cara, 'anna');
    await db.query(
      `update public.friendships set created_at = now() - interval '1 day' where requester_id = $1`,
      [cara],
    );
    await request(anna, 'dora');

    const rows = await listFriends(anna);

    assert.deepEqual(
      rows.map((row) => [row.status, row.username]),
      [
        ['accepted', 'ben'],
        ['pending', 'dora'],
        ['pending', 'cara'],
      ],
    );
  });

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
    // Before a courier's first letter a move counts at once: Ben has had one.
    await db.query(`update public.profiles set has_corresponded = true where id = $1`, [ben]);
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
