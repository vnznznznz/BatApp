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
const RELOCATION_HOURS = constant('RELOCATION_HOURS');
const USERNAME_MIN_LENGTH = constant('USERNAME_MIN_LENGTH');
const USERNAME_MAX_LENGTH = constant('USERNAME_MAX_LENGTH');
const REPORT_NOTE_MAX_LENGTH = constant('REPORT_NOTE_MAX_LENGTH');
const REPORTS_PER_DAY = constant('REPORTS_PER_DAY');
const REPORT_RETENTION_DAYS = constant('REPORT_RETENTION_DAYS');
const BAN_PERIOD_YEARS = constant('BAN_PERIOD_YEARS');
const FRIEND_REQUESTS_PER_HOUR = constant('FRIEND_REQUESTS_PER_HOUR');
const SIGN_UP_DETAILS_MAX_BYTES = constant('SIGN_UP_DETAILS_MAX_BYTES');

/** A pattern config.ts exports, rebuilt from its source text. */
function pattern(name) {
  const match = CONFIG.match(new RegExp(`export const ${name} =\\s*/(.+)/([a-z]*);`));
  assert.ok(match, `${name} not found in src/constants/config.ts`);
  return new RegExp(match[1], match[2]);
}

const DISPLAY_NAME_FORBIDDEN_PATTERN = pattern('DISPLAY_NAME_FORBIDDEN_PATTERN');
const VISIBLE_CHARACTER_PATTERN = pattern('VISIBLE_CHARACTER_PATTERN');

const REPORT_REASONS = (() => {
  const match = CONFIG.match(/export const REPORT_REASONS = \[([^\]]*)\]/);
  assert.ok(match, 'REPORT_REASONS not found in src/constants/config.ts');
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((reason) => reason[1]);
})();

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

  it('on RELOCATION_HOURS', async () => {
    const { rows } = await db.query(
      `select extract(epoch from private.relocation_period()) / 3600 as hours`,
    );

    assert.equal(Number(rows[0].hours), RELOCATION_HOURS);
  });

  it('on USERNAME_MIN_LENGTH and USERNAME_MAX_LENGTH', async () => {
    await createUser(db, { username: 'a'.repeat(USERNAME_MIN_LENGTH) });
    await createUser(db, { username: 'b'.repeat(USERNAME_MAX_LENGTH) });

    await assert.rejects(() => createUser(db, { username: 'c'.repeat(USERNAME_MIN_LENGTH - 1) }));
    await assert.rejects(() => createUser(db, { username: 'd'.repeat(USERNAME_MAX_LENGTH + 1) }));
  });
  it('on REPORT_REASONS, accepting each one and nothing else', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const couriers = [];
    for (const reason of REPORT_REASONS) {
      const target = await createCourier(db, {});
      couriers.push(target);
      await rpc(db, anna, 'report_courier', { courier_id: target, reason });
    }
    await rejectsWithHint(
      rpc(db, anna, 'report_courier', { courier_id: couriers[0], reason: 'other_things' }),
      'unknown_reason',
    );

    const { rows } = await db.query(
      `select pg_get_constraintdef(oid) as definition from pg_constraint
       where conname = 'reports_reason_known'`,
    );
    const allowed = [...rows[0].definition.matchAll(/'([a-z_]+)'/g)].map((reason) => reason[1]);
    assert.deepEqual([...allowed].sort(), [...REPORT_REASONS].sort());
  });

  it('on REPORT_NOTE_MAX_LENGTH', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cleo = await createCourier(db, { name: 'cleo' });

    await rpc(db, anna, 'report_courier', {
      courier_id: ben,
      reason: 'spam',
      note: 'n'.repeat(REPORT_NOTE_MAX_LENGTH),
    });
    await rejectsWithHint(
      rpc(db, anna, 'report_courier', {
        courier_id: cleo,
        reason: 'spam',
        note: 'n'.repeat(REPORT_NOTE_MAX_LENGTH + 1),
      }),
      'note_too_long',
    );
  });

  it('on REPORTS_PER_DAY', async () => {
    const { rows } = await db.query(`select private.reports_per_day() as limit`);

    assert.equal(rows[0].limit, REPORTS_PER_DAY);
  });

  it('on REPORT_RETENTION_DAYS', async () => {
    const { rows } = await db.query(
      `select extract(epoch from private.report_retention()) / 86400 as days`,
    );

    assert.equal(Number(rows[0].days), REPORT_RETENTION_DAYS);
  });

  it('on BAN_PERIOD_YEARS', async () => {
    const { rows } = await db.query(
      `select private.ban_period() = make_interval(years => $1) as same`,
      [BAN_PERIOD_YEARS],
    );

    assert.equal(rows[0].same, true);
  });

  /** The number, and that it is where the database draws the line: to the byte. */
  it('on SIGN_UP_DETAILS_MAX_BYTES', async () => {
    const { rows } = await db.query(`select private.sign_up_details_max_bytes() as bytes`);
    assert.equal(rows[0].bytes, SIGN_UP_DETAILS_MAX_BYTES);

    // As Postgres writes it out, {"junk": "..."} is twelve bytes around the dots.
    const carrying = (bytes) => ({ metadata: { junk: 'x'.repeat(bytes - 12) } });
    const atTheLimit = await createUser(db, carrying(SIGN_UP_DETAILS_MAX_BYTES));
    const { rows: kept } = await db.query(
      `select octet_length(raw_user_meta_data::text) as bytes from auth.users where id = $1`,
      [atTheLimit],
    );
    assert.equal(kept[0].bytes, SIGN_UP_DETAILS_MAX_BYTES);

    await rejectsWithHint(
      createUser(db, carrying(SIGN_UP_DETAILS_MAX_BYTES + 1)),
      'sign_up_details_too_large',
    );
  });

  /**
   * Not numbers but lists of characters, and the app's copy is written in
   * another language's notation. So they are compared the long way: every
   * character Postgres can store - all of Unicode but U+0000 - is put to the
   * database's rule and to the app's pattern, one at a time.
   */
  describe('on DISPLAY_NAME_FORBIDDEN_PATTERN and VISIBLE_CHARACTER_PATTERN', () => {
    const isSurrogate = (code) => code >= 0xd800 && code <= 0xdfff;

    /** The characters for which `condition` holds, asked of each one alone as `display_name`. */
    const databaseSays = async (condition) => {
      const { rows } = await db.query(
        `select coalesce(array_agg(code order by code), '{}') as codes
         from generate_series(1, 1114111) as code,
              lateral (select chr(code) as display_name) as one
         where code not between 55296 and 57343
           and (${condition})`,
      );
      return ranges(rows[0].codes);
    };

    const appSays = (holds) => {
      const codes = [];
      for (let code = 1; code <= 0x10ffff; code++) {
        if (!isSurrogate(code) && holds(String.fromCodePoint(code))) codes.push(code);
      }
      return ranges(codes);
    };

    /** 'U+0001-001F U+007F ...': short enough to read when two lists differ. */
    const ranges = (codes) => {
      const hex = (code) => code.toString(16).toUpperCase().padStart(4, '0');
      const runs = [];
      for (const code of codes) {
        const last = runs.at(-1);
        if (last && code === last[1] + 1) last[1] = code;
        else runs.push([code, code]);
      }
      return runs
        .map(([from, to]) => (from === to ? `U+${hex(from)}` : `U+${hex(from)}-${hex(to)}`))
        .join(' ');
    };

    const check = async (name) => {
      const { rows } = await db.query(
        `select pg_get_expr(conbin, conrelid) as expression from pg_constraint
         where conrelid = 'public.profiles'::regclass and conname = $1`,
        [name],
      );
      assert.equal(rows.length, 1, `no check ${name} on public.profiles`);
      return rows[0].expression;
    };

    it('as what a display name must not hold', async () => {
      const refused = await databaseSays(
        `not (${await check('profiles_display_name_no_controls')})`,
      );

      assert.ok(refused.startsWith('U+0001-001F'), refused);
      assert.equal(
        refused,
        appSays((character) => DISPLAY_NAME_FORBIDDEN_PATTERN.test(character)),
      );
    });

    it('as what does not make a display name something to see', async () => {
      const blank = await databaseSays(`not (${await check('profiles_display_name_visible')})`);

      assert.ok(blank.includes('U+2000-200F'), blank);
      assert.equal(
        blank,
        appSays((character) => !VISIBLE_CHARACTER_PATTERN.test(character)),
      );
    });

    it('as what does not make a letter something to see', async () => {
      const blank = await databaseSays(`not private.has_visible_character(display_name)`);

      assert.ok(blank.includes('U+2000-200F'), blank);
      assert.equal(
        blank,
        appSays((character) => !VISIBLE_CHARACTER_PATTERN.test(character)),
      );
    });

    /** The one character the two cannot be compared on. */
    it('and both count U+0000, which the database cannot store, as neither plain nor visible', async () => {
      assert.equal(DISPLAY_NAME_FORBIDDEN_PATTERN.test('\u0000'), true);
      assert.equal(VISIBLE_CHARACTER_PATTERN.test('\u0000'), false);
      await assert.rejects(db.query(`select chr(0)`), /null character not permitted/);
    });
  });

  /** The number, and that it is the number the database acts on. */
  it('on FRIEND_REQUESTS_PER_HOUR', async () => {
    const { rows } = await db.query(`select private.friend_requests_per_hour() as limit`);
    assert.equal(rows[0].limit, FRIEND_REQUESTS_PER_HOUR);

    const anna = await createCourier(db, { name: 'anna' });
    for (let i = 0; i <= FRIEND_REQUESTS_PER_HOUR; i++) {
      await createCourier(db, { name: `other${i}` });
    }
    for (let i = 0; i < FRIEND_REQUESTS_PER_HOUR; i++) {
      await rpc(db, anna, 'request_friend', { username: `other${i}` });
    }
    await rejectsWithHint(
      rpc(db, anna, 'request_friend', { username: `other${FRIEND_REQUESTS_PER_HOUR}` }),
      'too_many_friend_requests',
    );
  });
});
