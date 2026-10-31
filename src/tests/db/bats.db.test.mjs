import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { batStatuses, count } from './fixtures.mjs';
import {
  applyMigrations,
  asAnon,
  asUser,
  createTestDatabase,
  createUser,
  migrationFiles,
} from './harness.mjs';

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

const readBats = (ownerId) =>
  db.query(`select id, owner_id, slot, status from public.bats where owner_id = $1`, [ownerId]);

describe('issuing bats', () => {
  it('gives a new user exactly three bats', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    assert.equal(await count(db, `select 1 from public.bats where owner_id = $1`, [anna]), 3);
  });

  it('puts them in slots one to three, all at home', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    const { rows } = await db.query(
      `select slot, status from public.bats where owner_id = $1 order by slot`,
      [anna],
    );

    assert.deepEqual(rows, [
      { slot: 1, status: 'available' },
      { slot: 2, status: 'available' },
      { slot: 3, status: 'available' },
    ]);
  });

  it('gives every user their own three', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });
    const ben = await createUser(db, { username: 'ben', displayName: 'Ben' });

    assert.deepEqual(await batStatuses(db, anna), ['available', 'available', 'available']);
    assert.deepEqual(await batStatuses(db, ben), ['available', 'available', 'available']);
  });
});

describe('a fourth bat', () => {
  it('cannot be inserted by its owner', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(() =>
      asUser(db, anna, () =>
        db.query(`insert into public.bats (owner_id, slot) values ($1, 4)`, [anna]),
      ),
    );
  });

  /**
   * Not just refused to clients: the schema itself has nowhere to put one. This
   * runs as the superuser, which bypasses every policy and privilege.
   */
  it('cannot be stored at all, even by the database owner', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(
      () => db.query(`insert into public.bats (owner_id, slot) values ($1, 4)`, [anna]),
      /bats_slot_range/,
    );
    await assert.rejects(
      () => db.query(`insert into public.bats (owner_id, slot) values ($1, 2)`, [anna]),
      /bats_one_per_slot/,
    );

    assert.equal(await count(db, `select 1 from public.bats where owner_id = $1`, [anna]), 3);
  });

  it('does not appear when a profile is updated', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await asUser(db, anna, () =>
      db.query(`update public.profiles set display_name = 'Anna W.' where id = $1`, [anna]),
    );

    assert.equal(await count(db, `select 1 from public.bats where owner_id = $1`, [anna]), 3);
  });
});

describe('direct access', () => {
  /**
   * The roost is read through get_roost(), which lands what is due first. A
   * direct read could show a bat coming home at the moment a friend's request
   * landed its letter - a trace of when they opened the app.
   */
  it('does not let a user read the bats table, even their own', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(() => asUser(db, anna, () => readBats(anna)));
  });

  it('shows nothing to a signed-out visitor', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(() => asAnon(db, () => readBats(anna)));
  });

  /** A bat that could be set home by its owner would make the limit meaningless. */
  it('does not let a user change a bat directly', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });
    await db.query(`update public.bats set status = 'flying' where owner_id = $1`, [anna]);

    await assert.rejects(() =>
      asUser(db, anna, () =>
        db.query(`update public.bats set status = 'available' where owner_id = $1`, [anna]),
      ),
    );

    assert.deepEqual(await batStatuses(db, anna), ['flying', 'flying', 'flying']);
  });

  it('does not let a user delete a bat', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(() =>
      asUser(db, anna, () => db.query(`delete from public.bats where owner_id = $1`, [anna])),
    );

    assert.equal(await count(db, `select 1 from public.bats where owner_id = $1`, [anna]), 3);
  });

  it('rejects a status the product does not define', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(
      () => db.query(`update public.bats set status = 'lost' where owner_id = $1`, [anna]),
      /bats_status_known/,
    );
  });
});

describe('account deletion', () => {
  it('takes the bats with the account', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await asUser(db, anna, () => db.query(`select public.delete_own_account()`));

    assert.equal(await count(db, `select 1 from public.bats where owner_id = $1`, [anna]), 0);
  });
});

/**
 * The operator's own account predates bats. Replaying the migrations from just
 * before the bats migration, with a user already present, is the only way to
 * see what that account receives.
 */
describe('couriers who signed up before bats existed', () => {
  it('receive exactly three when the migration runs', async () => {
    const batsMigration = migrationFiles().find((f) => f.endsWith('_bats.sql'));
    const before = migrationFiles()[migrationFiles().indexOf(batsMigration) - 1];

    const old = await createTestDatabase({ until: before });
    try {
      const early = await createUser(old, { username: 'early', displayName: 'Early' });
      await applyMigrations(old, { after: before });

      const { rows } = await old.query(
        `select slot, status from public.bats where owner_id = $1 order by slot`,
        [early],
      );
      assert.deepEqual(rows, [
        { slot: 1, status: 'available' },
        { slot: 2, status: 'available' },
        { slot: 3, status: 'available' },
      ]);
    } finally {
      await old.close();
    }
  });
});
