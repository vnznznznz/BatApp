import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { asAnon, asUser, createTestDatabase, createUser } from './harness.mjs';

let db;

before(async () => {
  db = await createTestDatabase();
});

after(async () => {
  await db?.close();
});

// Cheaper than rebuilding the database per case, and truncating the auth table
// cascades to profiles, so each case still starts from nothing.
beforeEach(async () => {
  await db.exec(`truncate auth.users cascade;`);
});

const count = async (sql, params = []) => {
  const { rows } = await db.query(sql, params);
  return Number(rows[0].count);
};

const readProfile = (id) =>
  db.query(`select id, username, display_name from public.profiles where id = $1`, [id]);

describe('profile creation', () => {
  it('creates exactly one profile for a new auth user', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    assert.equal(
      await count(`select count(*)::text as count from public.profiles where id = $1`, [anna]),
      1,
    );
  });

  it('takes the username and display name from signup metadata', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna Weber' });

    const { rows } = await db.query(
      `select username, display_name from public.profiles where id = $1`,
      [anna],
    );

    assert.deepEqual(rows[0], { username: 'anna', display_name: 'Anna Weber' });
  });

  it('lower-cases and trims a submitted username', async () => {
    const anna = await createUser(db, { username: '  Anna  ', displayName: 'Anna' });

    const { rows } = await db.query(`select username from public.profiles where id = $1`, [anna]);

    assert.equal(rows[0].username, 'anna');
  });

  // Signup must not fail outright just because metadata was missing.
  it('falls back to a generated username when metadata is absent', async () => {
    const user = await createUser(db);

    const { rows } = await db.query(
      `select username, display_name from public.profiles where id = $1`,
      [user],
    );

    assert.match(rows[0].username, /^courier_[0-9a-f]{12}$/);
    assert.equal(rows[0].display_name, 'Courier');
  });

  it('rejects a username that is already taken', async () => {
    await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(() => createUser(db, { username: 'anna', displayName: 'Other' }));
  });

  // Otherwise "anna" and "Anna" coexist and impersonation is trivial.
  it('treats usernames as case-insensitive for uniqueness', async () => {
    await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(() => createUser(db, { username: 'ANNA', displayName: 'Other' }));
  });

  it('rejects usernames containing characters outside the allowed set', async () => {
    await assert.rejects(() => createUser(db, { username: 'anna weber' }));
    await assert.rejects(() => createUser(db, { username: 'anna.weber' }));
  });

  it('rejects a username that is too short', async () => {
    await assert.rejects(() => createUser(db, { username: 'an' }));
  });
});

describe('row level security', () => {
  it('lets a user read their own profile', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    const { rows } = await asUser(db, anna, () => readProfile(anna));

    assert.equal(rows.length, 1);
  });

  // The whole privacy premise of the app rests on this one. There is no path
  // from one user to another user's row until friend search is built.
  it('does not let a user read anyone else', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });
    const ben = await createUser(db, { username: 'ben', displayName: 'Ben' });

    const { rows } = await asUser(db, anna, () => readProfile(ben));

    assert.equal(rows.length, 0);
  });

  it('shows nothing at all to a signed-out visitor', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(() => asAnon(db, () => readProfile(anna)));
  });

  it('lets a user update their own display name', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await asUser(db, anna, () =>
      db.query(`update public.profiles set display_name = $1 where id = $2`, ['Anna W.', anna]),
    );

    const { rows } = await db.query(`select display_name from public.profiles where id = $1`, [
      anna,
    ]);
    assert.equal(rows[0].display_name, 'Anna W.');
  });

  it('affects no rows when a user tries to update someone else', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });
    const ben = await createUser(db, { username: 'ben', displayName: 'Ben' });

    await asUser(db, anna, () =>
      db.query(`update public.profiles set display_name = $1 where id = $2`, ['Hacked', ben]),
    );

    const { rows } = await db.query(`select display_name from public.profiles where id = $1`, [
      ben,
    ]);
    assert.equal(rows[0].display_name, 'Ben');
  });

  it('does not let a user insert a profile row', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(() =>
      asUser(db, anna, () =>
        db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [
          anna,
          'imposter',
          'Imposter',
        ]),
      ),
    );
  });

  it('does not let a user delete their profile row directly', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(() =>
      asUser(db, anna, () => db.query(`delete from public.profiles where id = $1`, [anna])),
    );

    assert.equal(await count(`select count(*)::text as count from public.profiles`), 1);
  });

  it('touches updated_at on update', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });
    await db.exec(`update public.profiles set updated_at = '2000-01-01T00:00:00Z'`);

    await asUser(db, anna, () =>
      db.query(`update public.profiles set display_name = $1 where id = $2`, ['Anna W.', anna]),
    );

    const { rows } = await db.query(
      `select updated_at > '2020-01-01T00:00:00Z' as moved from public.profiles where id = $1`,
      [anna],
    );
    assert.equal(rows[0].moved, true);
  });
});

describe('account deletion', () => {
  it('removes the auth user and cascades the profile', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await asUser(db, anna, () => db.query(`select public.delete_own_account()`));

    assert.equal(
      await count(`select count(*)::text as count from auth.users where id = $1`, [anna]),
      0,
    );
    assert.equal(
      await count(`select count(*)::text as count from public.profiles where id = $1`, [anna]),
      0,
    );
  });

  it('deletes only the caller', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });
    const ben = await createUser(db, { username: 'ben', displayName: 'Ben' });

    await asUser(db, anna, () => db.query(`select public.delete_own_account()`));

    assert.equal(
      await count(`select count(*)::text as count from auth.users where id = $1`, [ben]),
      1,
    );
  });

  it('refuses when there is no authenticated caller', async () => {
    await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(() => asAnon(db, () => db.query(`select public.delete_own_account()`)));
  });
});
