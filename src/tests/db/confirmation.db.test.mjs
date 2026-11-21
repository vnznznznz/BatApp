import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { asAuthServer, createTestDatabase } from './harness.mjs';

/**
 * The first sign-up for an address chooses the account's password, and the
 * owner of the address confirms that account with the code. Whoever signed up
 * first - anyone who typed the address - could sign in with their password
 * from that moment until the app had set the owner's. (Found in review.) The
 * password now goes as the address is confirmed.
 *
 * The statements are GoTrue v2.197's own, as pg_stat_statements on the local
 * stack shows them, and they are run as its role.
 */

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

const STRANGERS = '$2a$10$the.strangers.password.hash.from.the.first.sign.up';
const OWNERS = '$2a$10$the.owners.own.password.hash.set.after.the.code';

/**
 * An account as a sign-up leaves it with confirmation on: unconfirmed, with
 * the password it was made with, and a code emailed to its address.
 */
async function waitingForItsCode({ codeSent = true } = {}) {
  const { rows } = await asAuthServer(db, () =>
    db.query(
      `insert into auth.users (email, raw_user_meta_data, encrypted_password, email_confirmed_at)
       values ($1, '{"username": "anna", "display_name": "Anna"}', $2, null)
       returning id`,
      ['anna@example.test', STRANGERS],
    ),
  );
  const id = rows[0].id;
  if (codeSent) {
    await asAuthServer(db, () =>
      db.query(
        `update auth.users set confirmation_sent_at = now(), updated_at = now() where id = $1`,
        [id],
      ),
    );
  }
  return id;
}

/** GoTrue confirming the address: with a code, or itself, as a sign-up is made. */
const confirmed = (id) =>
  asAuthServer(db, () =>
    db.query(
      `update auth.users as users
       set confirmation_token = '', email_confirmed_at = now(), updated_at = now()
       where users.id = $1`,
      [id],
    ),
  );

/** GoTrue saving a new password (PUT /auth/v1/user, UpdatePassword). */
const passwordSet = (id, hash) =>
  asAuthServer(db, () =>
    db.query(
      `update auth.users as users
       set confirmation_sent_at = null, encrypted_password = $2, recovery_sent_at = null,
           updated_at = now()
       where users.id = $1`,
      [id, hash],
    ),
  );

const passwordOf = async (id) =>
  (await db.query(`select encrypted_password from auth.users where id = $1`, [id])).rows[0]
    .encrypted_password;

describe('confirming an address', () => {
  it('takes away the password the account was made with, in the same statement', async () => {
    const anna = await waitingForItsCode();

    await confirmed(anna);

    assert.equal(await passwordOf(anna), '');
    const { rows } = await db.query(
      `select email_confirmed_at is not null as confirmed from auth.users where id = $1`,
      [anna],
    );
    assert.equal(rows[0].confirmed, true);
  });

  /** GoTrue confirms an address with a reset's code too, after taking the code. */
  it('takes it away when the code is a reset’s', async () => {
    const anna = await waitingForItsCode();
    await asAuthServer(db, () =>
      db.query(`update auth.users set recovery_sent_at = now(), updated_at = now() where id = $1`, [
        anna,
      ]),
    );
    await asAuthServer(db, () =>
      db.query(`update auth.users as users set updated_at = now() where users.id = $1`, [anna]),
    );

    await confirmed(anna);

    assert.equal(await passwordOf(anna), '');
  });

  it('keeps the password set with the code’s session afterwards', async () => {
    const anna = await waitingForItsCode();
    await confirmed(anna);

    await passwordSet(anna, OWNERS);

    assert.equal(await passwordOf(anna), OWNERS);
  });

  it('keeps the password through whatever else the auth server writes afterwards', async () => {
    const anna = await waitingForItsCode();
    await confirmed(anna);
    await passwordSet(anna, OWNERS);

    await asAuthServer(db, () =>
      db.query(
        `update auth.users as users set raw_user_meta_data = raw_user_meta_data, updated_at = now()
         where users.id = $1`,
        [anna],
      ),
    );
    await confirmed(anna);

    assert.equal(await passwordOf(anna), OWNERS);
  });

  /**
   * With confirmation off, GoTrue inserts every new account unconfirmed and
   * confirms it with an update in the same request, nothing emailed: the
   * password is the one just chosen, and the person is signed in with it.
   */
  it('keeps the password of an account the auth server confirms as it makes it', async () => {
    const ben = await waitingForItsCode({ codeSent: false });

    await confirmed(ben);

    assert.equal(await passwordOf(ben), STRANGERS);
  });

  it('keeps the password of an account made confirmed', async () => {
    const { rows } = await asAuthServer(db, () =>
      db.query(
        `insert into auth.users (email, raw_user_meta_data, encrypted_password)
         values ('cleo@example.test', '{"username": "cleo", "display_name": "Cleo"}', $1)
         returning id`,
        [OWNERS],
      ),
    );

    await confirmed(rows[0].id);

    assert.equal(await passwordOf(rows[0].id), OWNERS);
  });

  /** Confirmed by its code, with the password it was made with still kept. */
  it('keeps the password of an account confirmed already, when the time is written again', async () => {
    const { rows } = await asAuthServer(db, () =>
      db.query(
        `insert into auth.users (email, encrypted_password, email_confirmed_at, confirmation_sent_at)
         values ('dora@example.test', $1, now() - interval '1 day', now() - interval '1 day')
         returning id`,
        [OWNERS],
      ),
    );

    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [rows[0].id]);

    assert.equal(await passwordOf(rows[0].id), OWNERS);
  });

  it('keeps the password when the time of confirming is written but stays empty', async () => {
    const anna = await waitingForItsCode();

    await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [anna]);

    assert.equal(await passwordOf(anna), STRANGERS);
  });

  /** The operator, in the SQL editor: the owner then sets a password with a reset's code. */
  it('takes it away when the operator confirms the account by hand', async () => {
    const anna = await waitingForItsCode();

    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [anna]);

    assert.equal(await passwordOf(anna), '');
  });

  /**
   * Whether a code was emailed is what the account held before the statement:
   * one that clears the time it was sent as it confirms the address - by hand,
   * say, tidying as it goes - takes the password away all the same. Read from
   * the row as written, it kept it. (Found in review: the auth server's own
   * statements could not tell the two apart.)
   */
  it('takes it away when the confirmation clears the time the code was sent', async () => {
    const anna = await waitingForItsCode();

    await db.query(
      `update auth.users set email_confirmed_at = now(), confirmation_sent_at = null where id = $1`,
      [anna],
    );

    assert.equal(await passwordOf(anna), '');
  });
});
