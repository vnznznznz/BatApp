import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { count, createCourier, makeFriends, rejectsWithHint, rpc } from './fixtures.mjs';
import { createTestDatabase, createUser } from './harness.mjs';

/**
 * The product's numbers live in two places: `src/constants/config.ts`, which the
 * app reads, and the migrations, which the database enforces. The database is
 * the authority, but a drift between the two is still a bug - the welcome screen
 * would promise one thing and the server would do another - and nothing would
 * throw.
 *
 * This reads config.ts as text and checks the database's behaviour against it.
 * Change a number in one place only, and this fails.
 */

const CONFIG = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'constants', 'config.ts'),
  'utf8',
);

function constant(name) {
  const match = CONFIG.match(new RegExp(`export const ${name} = ([0-9.]+)`));
  assert.ok(match, `${name} not found in src/constants/config.ts`);
  return Number(match[1]);
}

const BATS_PER_USER = constant('BATS_PER_USER');
const BAT_SPEED_KMH = constant('BAT_SPEED_KMH');
const MINIMUM_FLIGHT_MINUTES = constant('MINIMUM_FLIGHT_MINUTES');
const MESSAGE_MAX_LENGTH = constant('MESSAGE_MAX_LENGTH');
const PRODUCTION_TIME_MULTIPLIER = constant('PRODUCTION_TIME_MULTIPLIER');
const DEBUG_TIME_MULTIPLIER = constant('DEBUG_TIME_MULTIPLIER');
const USERNAME_MIN_LENGTH = constant('USERNAME_MIN_LENGTH');
const USERNAME_MAX_LENGTH = constant('USERNAME_MAX_LENGTH');

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

const flightSeconds = async (km) =>
  Number(
    (await db.query(`select extract(epoch from private.flight_duration($1)) as seconds`, [km]))
      .rows[0].seconds,
  );

describe('the database agrees with src/constants/config.ts', () => {
  it('on BATS_PER_USER', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    assert.equal(
      await count(db, `select 1 from public.bats where owner_id = $1`, [anna]),
      BATS_PER_USER,
    );
    await assert.rejects(
      () =>
        db.query(`insert into public.bats (owner_id, slot) values ($1, $2)`, [
          anna,
          BATS_PER_USER + 1,
        ]),
      /bats_slot_range/,
    );
  });

  it('on MINIMUM_FLIGHT_MINUTES', async () => {
    assert.equal(await flightSeconds(0), MINIMUM_FLIGHT_MINUTES * 60);
  });

  it('on BAT_SPEED_KMH', async () => {
    // Ten hours' flying: far enough to be clear of the minimum.
    assert.equal(await flightSeconds(BAT_SPEED_KMH * 10), 10 * 3600);
  });

  it('on MESSAGE_MAX_LENGTH', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
    await makeFriends(db, anna, ben);

    await rpc(db, anna, 'send_message', {
      recipient_id: ben,
      body: 'a'.repeat(MESSAGE_MAX_LENGTH),
    });
    await rejectsWithHint(
      rpc(db, anna, 'send_message', {
        recipient_id: ben,
        body: 'a'.repeat(MESSAGE_MAX_LENGTH + 1),
      }),
      'message_too_long',
    );
  });

  it('on PRODUCTION_TIME_MULTIPLIER, as the shipped default', async () => {
    const { rows } = await db.query(
      `select column_default from information_schema.columns
       where table_schema = 'private' and table_name = 'flight_settings'
         and column_name = 'time_multiplier'`,
    );

    assert.equal(Number(rows[0].column_default), PRODUCTION_TIME_MULTIPLIER);
  });

  it('on DEBUG_TIME_MULTIPLIER, as a setting the operator may choose', async () => {
    await db.query(`update private.flight_settings set time_multiplier = $1`, [
      DEBUG_TIME_MULTIPLIER,
    ]);

    assert.equal(await flightSeconds(0), MINIMUM_FLIGHT_MINUTES * 60 * DEBUG_TIME_MULTIPLIER);
  });

  it('on USERNAME_MIN_LENGTH and USERNAME_MAX_LENGTH', async () => {
    await createUser(db, { username: 'a'.repeat(USERNAME_MIN_LENGTH) });
    await createUser(db, { username: 'b'.repeat(USERNAME_MAX_LENGTH) });

    await assert.rejects(() => createUser(db, { username: 'c'.repeat(USERNAME_MIN_LENGTH - 1) }));
    await assert.rejects(() => createUser(db, { username: 'd'.repeat(USERNAME_MAX_LENGTH + 1) }));
  });
});
