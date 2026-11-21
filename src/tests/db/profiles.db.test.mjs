import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  applyMigrations,
  asAnon,
  asAuthServer,
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

/**
 * A refusal, and the reason for it. "It failed" is not enough to assert: a
 * sign-up fails for a taken username and for a broken trigger alike.
 */
const refusedFor = (code, reason) => (error) => {
  assert.equal(error.code, code, error.message);
  assert.match(error.message, reason);
  return true;
};
const uniqueViolation = (name) => refusedFor('23505', new RegExp(`"${name}"`));
const checkViolation = (name) => refusedFor('23514', new RegExp(`"${name}"`));
const permissionDenied = (what) => refusedFor('42501', new RegExp(`permission denied for ${what}`));

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

    await assert.rejects(
      () => createUser(db, { username: 'anna', displayName: 'Other' }),
      uniqueViolation('profiles_username_key'),
    );
  });

  // Otherwise "anna" and "Anna" coexist and impersonation is trivial.
  it('treats usernames as case-insensitive for uniqueness', async () => {
    await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(
      () => createUser(db, { username: 'ANNA', displayName: 'Other' }),
      uniqueViolation('profiles_username_key'),
    );
  });

  /** The promise the index makes on its own, whatever the sign-up trigger does first. */
  it('cannot hold two usernames that differ only in case, by any route', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });
    await createUser(db, { username: 'ben', displayName: 'Ben' });
    await db.exec(`alter table public.profiles drop constraint profiles_username_format`);
    try {
      await assert.rejects(
        db.query(`update public.profiles set username = 'BEN' where id = $1`, [anna]),
        uniqueViolation('profiles_username_lower_idx'),
      );
    } finally {
      await db.exec(
        `alter table public.profiles
           add constraint profiles_username_format check (username ~ '^[a-z0-9_]+$')`,
      );
    }
  });

  it('rejects usernames containing characters outside the allowed set', async () => {
    await assert.rejects(
      () => createUser(db, { username: 'anna weber' }),
      checkViolation('profiles_username_format'),
    );
    await assert.rejects(
      () => createUser(db, { username: 'anna.weber' }),
      checkViolation('profiles_username_format'),
    );
  });

  it('rejects a username that is too short, or too long', async () => {
    await assert.rejects(
      () => createUser(db, { username: 'an' }),
      checkViolation('profiles_username_length'),
    );
    await assert.rejects(
      () => createUser(db, { username: 'a'.repeat(21) }),
      checkViolation('profiles_username_length'),
    );
  });

  it('leaves nothing of a sign-up it refused', async () => {
    await assert.rejects(() => createUser(db, { username: 'an' }));

    assert.equal(await count(`select count(*)::text as count from auth.users`), 0);
    assert.equal(await count(`select count(*)::text as count from public.profiles`), 0);
  });
});

/**
 * What a display name may be. It is shown to friends, on letters, to a stranger
 * the courier has asked to be friends and to the operator in a report, so it
 * has to be something a person can see and read as it is written: no control
 * characters, no line breaks, nothing that turns the direction of the text
 * round, and at least one character that is not blank. The marks and joiners
 * that scripts and emoji need stay allowed inside a name that has something
 * to show.
 *
 * The first twenty are the names review settled the rule on. `refusedBy` is
 * the check that refuses a name, by the end of its name.
 */
const NAMES = [
  ['a plain name', 'Anna'],
  ['a name with a space inside', 'Anna B.'],
  ['umlauts', 'J\u00FCrgen \u00D6zt\u00FCrk'],
  ['Chinese', '\u5F20\u4F1F'],
  ['a family emoji, joined with U+200D', '\u{1F469}\u200D\u{1F467}'],
  ['a rainbow flag, joined with U+200D', '\u{1F3F3}\uFE0F\u200D\u{1F308}'],
  ['a Persian name with U+200C', '\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645'],
  ['a Hebrew name with U+200F', '\u05D3\u05E0\u05D4\u200F'],
  ['spaces only', '   ', 'visible'],
  ['line breaks only', '\n\n\n', 'no_controls'],
  ['a line break inside a name', 'An\nna', 'no_controls'],
  ['a zero-width space', '\u200B', 'visible'],
  ['a no-break space and a zero-width space', '\u00A0\u200B', 'visible'],
  ['a right-to-left override', 'ab\u202Edetpecca', 'no_controls'],
  ['control characters', '\x07\r\n\t', 'no_controls'],
  ['an ideographic space', '\u3000', 'visible'],
  ['a word joiner', '\u2060', 'visible'],
  ['a Hangul filler', '\u3164', 'visible'],
  ['a blank braille pattern', '\u2800', 'visible'],
  ['a byte order mark', '\uFEFF', 'visible'],
  // More of both kinds, beyond those twenty.
  ['a heart with its variation selector', '\u2764\uFE0F'],
  [
    'the flag of England, spelt in tag characters',
    '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  ],
  ['a soft hyphen inside a word', 'Zucker\u00ADb\u00E4cker'],
  ['a soft hyphen', '\u00AD', 'visible'],
  ['a variation selector', '\uFE0F', 'visible'],
  ['tag characters', '\u{E0061}\u{E007F}', 'visible'],
  ['an Arabic letter mark', '\u061C', 'visible'],
  ['a combining grapheme joiner', '\u034F', 'visible'],
  ['a Mongolian variation selector', '\u180B', 'visible'],
  ['marks and joiners with nothing to join', '\u200E\u200F\u200C\u200D', 'visible'],
  ['a name inside direction isolates', '\u2066Anna\u2069', 'no_controls'],
  ['a paragraph separator inside a name', 'An\u2029na', 'no_controls'],
  ['a next-line control inside a name', 'An\u0085na', 'no_controls'],
  // Format characters that are not default-ignorable. The hieroglyph format
  // controls only arrange the signs around them and draw nothing themselves;
  // the end-of-ayah mark is a format character too, and is drawn.
  ['Egyptian hieroglyph format controls', '\u{13430}\u{13431}\u{13436}', 'visible'],
  ['two hieroglyphs joined by a format control', '\u{13000}\u{13430}\u{13001}'],
  ['an Arabic end-of-ayah mark', '\u06dd'],
].map(([what, name, refusedBy]) => ({ what, name, refusedBy }));

describe('a display name', () => {
  const displayName = async (id) =>
    (await db.query(`select display_name from public.profiles where id = $1`, [id])).rows[0]
      ?.display_name;

  const refusedBy = (rule) => (error) => {
    assert.equal(error.code, '23514', error.message);
    assert.match(error.message, new RegExp(`"profiles_display_name_${rule}"`));
    return true;
  };

  describe('changed by its owner', () => {
    for (const { what, name, refusedBy: rule } of NAMES) {
      it(`${rule ? 'cannot' : 'can'} be ${what}`, async () => {
        const anna = await createUser(db, { username: 'anna', displayName: 'Before' });
        const change = asUser(db, anna, () =>
          db.query(`update public.profiles set display_name = $1 where id = $2`, [name, anna]),
        );

        if (rule) {
          await assert.rejects(change, refusedBy(rule));
          assert.equal(await displayName(anna), 'Before');
        } else {
          await change;
          assert.equal(await displayName(anna), name);
        }
      });
    }
  });

  /**
   * At sign-up the name arrives in the details GoTrue stores, and the profile
   * is made from them inside the sign-up itself: a name that is refused refuses
   * the sign-up, and nothing of it is left.
   */
  describe('given at sign-up', () => {
    for (const { what, name, refusedBy: rule } of NAMES) {
      // Spaces and nothing else are no name at all, as far as handle_new_user
      // is concerned, and it has always answered that with "Courier".
      const noName = /^ *$/.test(name);

      it(`${rule && !noName ? 'cannot' : 'can'} be ${what}${noName ? ', which is no name: Courier' : ''}`, async () => {
        const signUp = createUser(db, {
          email: 'anna@example.test',
          username: 'anna',
          displayName: name,
        });

        if (rule && !noName) {
          await assert.rejects(signUp, refusedBy(rule));
          assert.equal(await count(`select count(*)::text as count from auth.users`), 0);
          assert.equal(await count(`select count(*)::text as count from public.profiles`), 0);
        } else {
          assert.equal(await displayName(await signUp), noName ? 'Courier' : name);
        }
      });
    }
  });

  it('is checked whoever writes it, the operator included', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(
      db.query(`update public.profiles set display_name = $1 where id = $2`, ['\u200B', anna]),
      refusedBy('visible'),
    );
  });
});

/**
 * A database that already holds names the rule refuses must still take the
 * migration, and afterwards hold none: adding a check that existing rows fail
 * stops the migration, and a check left unproven for old rows would refuse
 * every later change to them - a move to another city, the nightly tidy-up.
 * So the migration puts such names right first: what must not be in a name is
 * taken out of it, and a name with nothing left to see becomes "Courier", the
 * name a sign-up without one gets.
 */
describe('profiles from before display names were checked', () => {
  it('have what must not be in a name taken out, and are left alone otherwise', async () => {
    const visibleNames = migrationFiles().find((f) => f.endsWith('_visible_names.sql'));
    const before = migrationFiles()[migrationFiles().indexOf(visibleNames) - 1];
    const old = await createTestDatabase({ until: before });
    try {
      const earlier = [
        ['Anna', 'Anna'],
        ['J\u00FCrgen \u00D6zt\u00FCrk', 'J\u00FCrgen \u00D6zt\u00FCrk'],
        ['\u{1F469}\u200D\u{1F467}', '\u{1F469}\u200D\u{1F467}'],
        ['ab\u202Edetpecca', 'abdetpecca'],
        ['An\nna', 'Anna'],
        ['\u2066Anna\u2069', 'Anna'],
        ['\u200B', 'Courier'],
        ['\u00A0\u200B', 'Courier'],
        ['\x07\r\n\t', 'Courier'],
        [' \u202E ', 'Courier'],
        ['\n'.repeat(40), 'Courier'],
      ];
      const ids = [];
      for (const [name] of earlier) {
        const id = await createUser(old, { displayName: 'Courier' });
        await old.query(`update public.profiles set display_name = $1 where id = $2`, [name, id]);
        ids.push(id);
      }
      // A row's xmin changes whenever the row is written.
      const versions = async () =>
        Object.fromEntries(
          (
            await old.query(`select id, display_name, xmin::text as version from public.profiles`)
          ).rows.map((row) => [row.id, row]),
        );
      const asItWas = await versions();

      await applyMigrations(old, { after: before });

      const after = await versions();
      for (const [i, [name, expected]] of earlier.entries()) {
        const id = ids[i];
        assert.equal(after[id].display_name, expected, JSON.stringify(name));
        assert.equal(
          after[id].version === asItWas[id].version,
          name === expected,
          `${JSON.stringify(name)} was ${name === expected ? 'written again' : 'not written'}`,
        );
      }
      // And the checks stand for every row, old ones included.
      const { rows: checks } = await old.query(
        `select conname, convalidated from pg_constraint
         where conrelid = 'public.profiles'::regclass and contype = 'c'
           and conname like 'profiles_display_name_%'
         order by 1`,
      );
      assert.deepEqual(checks, [
        { conname: 'profiles_display_name_length', convalidated: true },
        { conname: 'profiles_display_name_no_controls', convalidated: true },
        { conname: 'profiles_display_name_visible', convalidated: true },
      ]);
    } finally {
      await old.close();
    }
  });
});

/**
 * A sign-up sends a username and a display name along, and GoTrue stores
 * whatever else is sent with them - any JSON, a megabyte a request - and lets
 * a signed-in account add to it without end. Review did both against the real
 * stack. The database now bounds what a sign-in can carry.
 *
 * Everything here is written as GoTrue's own role, which is who writes
 * auth.users on the platform and can reach nothing the migrations made: a
 * guard that only works for the superuser would stop every sign-up there.
 */
describe('the details kept with a sign-in', () => {
  const junk = (bytes) => 'x'.repeat(bytes);

  const overTheBound = (error) => {
    assert.equal(error.code, '22001', error.message);
    assert.match(error.message, /details kept with a sign-in can be at most 4096 bytes/);
    return true;
  };

  /** GoTrue changing what an account carries, as it does for PUT /auth/v1/user. */
  const carry = (id, more) =>
    asAuthServer(db, () =>
      db.query(
        `update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id = $1`,
        [id, JSON.stringify(more)],
      ),
    );

  const bytesCarried = async (id) =>
    (
      await db.query(
        `select octet_length(raw_user_meta_data::text) as bytes from auth.users where id = $1`,
        [id],
      )
    ).rows[0].bytes;

  it('take everything the app sends, at its longest', async () => {
    const id = await createUser(db, {
      email: `${'a'.repeat(243)}@example.test`,
      username: 'a'.repeat(20),
      // Forty characters of four bytes each.
      displayName: '\u{1D518}'.repeat(40),
      // What GoTrue adds of its own.
      metadata: {
        sub: '00000000-0000-4000-8000-000000000000',
        email: `${'a'.repeat(243)}@example.test`,
        email_verified: false,
        phone_verified: false,
      },
    });

    assert.ok((await bytesCarried(id)) < 1024, `${await bytesCarried(id)} bytes`);
  });

  it('refuse a sign-up that carries a hundred kilobytes, and nothing of it is left', async () => {
    await assert.rejects(
      createUser(db, {
        username: 'anna',
        displayName: 'Anna',
        metadata: { junk: junk(100_000) },
      }),
      overTheBound,
    );

    assert.equal(await count(`select count(*)::text as count from auth.users`), 0);
    assert.equal(await count(`select count(*)::text as count from public.profiles`), 0);
  });

  it('refuse an account that tries to add a hundred kilobytes later, and take a small change', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(carry(anna, { junk: junk(100_000) }), overTheBound);
    await carry(anna, { locale: 'de' });

    const { rows } = await db.query(
      `select raw_user_meta_data as details from auth.users where id = $1`,
      [anna],
    );
    assert.deepEqual(rows[0].details, { username: 'anna', display_name: 'Anna', locale: 'de' });
  });

  it('do not have to be there at all', async () => {
    const { rows } = await asAuthServer(db, () =>
      db.query(
        `insert into auth.users (email, raw_user_meta_data) values ('nobody@example.test', null)
         returning id`,
      ),
    );

    await asAuthServer(db, () =>
      db.query(`update auth.users set raw_user_meta_data = null where id = $1`, [rows[0].id]),
    );
    assert.equal(
      await count(`select count(*)::text as count from public.profiles where id = $1`, [
        rows[0].id,
      ]),
      1,
    );

    // Nothing is not a size to measure growth from: from nothing, the bound
    // holds as it does from anything else.
    await assert.rejects(
      asAuthServer(db, () =>
        db.query(`update auth.users set raw_user_meta_data = $2::jsonb where id = $1`, [
          rows[0].id,
          JSON.stringify({ junk: junk(100_000) }),
        ]),
      ),
      overTheBound,
    );
    assert.equal(
      await count(
        `select count(*)::text as count from auth.users
         where id = $1 and raw_user_meta_data is null`,
        [rows[0].id],
      ),
      1,
    );
  });

  /**
   * An account that already carries more, from before the bound, must not be
   * locked by it: every later change of its sign-in that touches the details
   * would be refused, the nightly tidy-up's among them. Only growing is.
   */
  describe('on an account that carried too much before there was a bound', () => {
    const tooMuch = async () => {
      await db.exec(`alter table auth.users disable trigger users_limit_sign_up_details`);
      try {
        return await createUser(db, {
          username: 'early',
          displayName: 'Early',
          metadata: { junk: junk(50_000) },
        });
      } finally {
        await db.exec(`alter table auth.users enable trigger users_limit_sign_up_details`);
      }
    };

    it('can stay as they are and can shrink, but cannot grow', async () => {
      const early = await tooMuch();
      const before = await bytesCarried(early);

      // Written again as it is, which is what an update of the whole row does.
      await asAuthServer(db, () =>
        db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data where id = $1`, [
          early,
        ]),
      );
      await assert.rejects(carry(early, { more: 'x' }), overTheBound);
      await asAuthServer(db, () =>
        db.query(
          `update auth.users set raw_user_meta_data = raw_user_meta_data - 'display_name'
           where id = $1`,
          [early],
        ),
      );

      assert.ok((await bytesCarried(early)) < before);
    });

    it('do not stop the nightly tidy-up, which removes the sign-up names from them too', async () => {
      const early = await tooMuch();

      const { rows } = await db.query(`select private.tidy_up() as skipped`);

      assert.deepEqual(
        rows[0].skipped.filter((step) => !step.startsWith('pg_cron run log: ')),
        [],
      );
      const { rows: left } = await db.query(
        `select raw_user_meta_data ?| array['username', 'display_name'] as names,
                raw_user_meta_data ? 'junk' as rest
         from auth.users where id = $1`,
        [early],
      );
      assert.deepEqual(left, [{ names: false, rest: true }]);
    });
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

    await assert.rejects(
      () => asAnon(db, () => readProfile(anna)),
      permissionDenied('table profiles'),
    );
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

    await assert.rejects(
      () =>
        asUser(db, anna, () =>
          db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [
            anna,
            'imposter',
            'Imposter',
          ]),
        ),
      permissionDenied('table profiles'),
    );
  });

  it('does not let a user delete their profile row directly', async () => {
    const anna = await createUser(db, { username: 'anna', displayName: 'Anna' });

    await assert.rejects(
      () => asUser(db, anna, () => db.query(`delete from public.profiles where id = $1`, [anna])),
      permissionDenied('table profiles'),
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

    await assert.rejects(
      () => asAnon(db, () => db.query(`select public.delete_own_account()`)),
      permissionDenied('function delete_own_account'),
    );
  });
});
