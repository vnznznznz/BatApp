import assert from 'node:assert/strict';

import { asUser, createUser } from './harness.mjs';

/**
 * Domain helpers shared by the database tests: couriers with cities, friends,
 * calls to the API functions as a given user, and moving time forward.
 *
 * Setup that the app would do through the API is done here as the superuser
 * where the API path is not what the test is about — a test of delivery should
 * not fail because friend requests broke. Where the API path is the subject,
 * the tests call it explicitly.
 */

let sequence = 0;

/** The id of a seeded city, looked up by name and country. */
export async function cityId(db, name, countryCode) {
  const { rows } = await db.query(
    `select id from public.cities where name = $1 and country_code = $2`,
    [name, countryCode],
  );
  assert.equal(rows.length, 1, `expected exactly one ${name}, ${countryCode} in the seed data`);
  return rows[0].id;
}

/** A new courier, optionally living somewhere. */
export async function createCourier(db, { name, city } = {}) {
  const username = name ?? `courier${sequence++}`;
  const id = await createUser(db, { username, displayName: username });
  if (city) await setCity(db, id, city);
  return id;
}

/** `city` is `[name, countryCode]`, or null to clear it. */
export async function setCity(db, userId, city) {
  const id = city ? await cityId(db, city[0], city[1]) : null;
  await db.query(`update public.profiles set city_id = $1 where id = $2`, [id, userId]);
}

/** Two couriers who are already friends, without going through requests. */
export async function makeFriends(db, a, b) {
  await db.query(
    `insert into public.friendships (requester_id, addressee_id, status, accepted_at)
     values ($1, $2, 'accepted', now())`,
    [a, b],
  );
}

/**
 * Calls an API function as `userId`, with named arguments, and returns its rows.
 * Named notation is how PostgREST calls them, so a renamed parameter fails here
 * the way it would fail in the app.
 */
export async function rpc(db, userId, fn, args = {}) {
  const names = Object.keys(args);
  const call = `select * from public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
  return asUser(db, userId, async () => (await db.query(call, Object.values(args))).rows);
}

/** Asserts that `promise` fails with the given machine-readable reason. */
export async function rejectsWithHint(promise, hint) {
  await assert.rejects(promise, (error) => {
    assert.equal(
      error.hint,
      hint,
      `expected hint "${hint}", got "${error.hint}": ${error.message}`,
    );
    return true;
  });
}

/**
 * Moves a letter's whole flight into the past, so that it is due now, keeping
 * its duration. Both timestamps move together because the schema insists a
 * letter lands strictly after it left.
 */
export async function fastForward(db, messageId) {
  const { rows } = await db.query(
    `update public.messages
     set sent_at = sent_at - (deliver_at - now()) - interval '1 second',
         deliver_at = now() - interval '1 second'
     where id = $1
     returning id`,
    [messageId],
  );
  assert.equal(rows.length, 1, `no letter ${messageId} to fast-forward`);
}

/** Runs the scheduled worker the way pg_cron does, and returns how many landed. */
export async function runWorker(db) {
  const { rows } = await db.query(`select private.deliver_due_messages() as landed`);
  return rows[0].landed;
}

/** The statuses of a courier's bats, by slot, read as the superuser. */
export async function batStatuses(db, ownerId) {
  const { rows } = await db.query(
    `select status from public.bats where owner_id = $1 order by slot`,
    [ownerId],
  );
  return rows.map((row) => row.status);
}

export async function count(db, sql, params = []) {
  const { rows } = await db.query(`select count(*)::int as count from (${sql}) as counted`, params);
  return rows[0].count;
}
