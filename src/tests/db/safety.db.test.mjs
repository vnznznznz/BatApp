import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  batStatuses,
  count,
  createCourier,
  fastForward,
  makeFriends,
  rejectsWithHint,
  rpc,
  runWorker,
} from './fixtures.mjs';
import { asUser, createTestDatabase } from './harness.mjs';

/**
 * Blocking and reporting: what a block ends, what it hides and from whom, what
 * it never tells, and what a report keeps for the operator.
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
    truncate public.reports;
    update private.flight_settings set time_multiplier = 1;
  `);
});

/** Anna in Berlin and Ben in Munich, friends. */
async function friends() {
  const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
  const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
  await makeFriends(db, anna, ben);
  return { anna, ben };
}

/** The single result of a scalar-returning function. */
const outcome = (rows) => Object.values(rows[0])[0];

const block = async (by, courierId) =>
  outcome(await rpc(db, by, 'block_courier', { courier_id: courierId }));
const unblock = (by, courierId) => rpc(db, by, 'unblock_courier', { courier_id: courierId });
const listBlocked = (who) => rpc(db, who, 'list_blocked');
const request = async (from, username) =>
  outcome(await rpc(db, from, 'request_friend', { username }));
const inbox = (who) => rpc(db, who, 'list_inbox');
const read = (who, messageId) => rpc(db, who, 'read_message', { message_id: messageId });
const badges = async (who) => (await rpc(db, who, 'get_badges'))[0];

const send = async (from, to, body = 'Good evening.') =>
  (await rpc(db, from, 'send_message', { recipient_id: to, body }))[0].message_id;

/** Sends a letter and lands it. */
async function delivered(from, to, body) {
  const id = await send(from, to, body);
  await fastForward(db, id);
  await runWorker(db);
  return id;
}

const reportLetter = async (by, messageId, args = {}) =>
  outcome(
    await rpc(db, by, 'report_letter', { message_id: messageId, reason: 'harassment', ...args }),
  );
const reportCourier = async (by, courierId, args = {}) =>
  outcome(await rpc(db, by, 'report_courier', { courier_id: courierId, reason: 'spam', ...args }));

const pairRows = (a, b) =>
  count(
    db,
    `select 1 from public.friendships
     where least(requester_id, addressee_id) = least($1::uuid, $2::uuid)
       and greatest(requester_id, addressee_id) = greatest($1::uuid, $2::uuid)`,
    [a, b],
  );

const reports = async () =>
  (await db.query(`select * from public.reports order by created_at, id`)).rows;

/** Catches a refusal, to compare it with another one whole. */
async function refusal(promise) {
  try {
    await promise;
  } catch (error) {
    return { message: error.message, hint: error.hint, code: error.code };
  }
  assert.fail('expected a refusal');
}

describe('blocking', () => {
  it('ends a friendship, and says so only once', async () => {
    const { anna, ben } = await friends();

    assert.equal(await block(anna, ben), 'blocked');
    assert.equal(await block(anna, ben), 'already_blocked');

    assert.equal(await pairRows(anna, ben), 0);
    assert.equal(await count(db, `select 1 from public.blocks`), 1);
  });

  it('ends a waiting request, whichever way it went', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cleo = await createCourier(db, { name: 'cleo' });

    await request(ben, 'anna');
    await request(anna, 'cleo');
    await block(anna, ben);
    await block(anna, cleo);

    assert.equal(await pairRows(anna, ben), 0);
    assert.equal(await pairRows(anna, cleo), 0);
    assert.deepEqual(await rpc(db, anna, 'list_friends'), []);
    assert.equal((await badges(anna)).friend_requests, 0);
  });

  it('refuses to block yourself, or someone who does not exist', async () => {
    const anna = await createCourier(db, { name: 'anna' });

    await rejectsWithHint(block(anna, anna), 'cannot_block_self');
    await rejectsWithHint(block(anna, '00000000-0000-4000-8000-000000000000'), 'courier_not_found');
  });

  /**
   * The blocked courier must not be able to tell a block from a deleted
   * account: the refusal is the unknown-username one, word for word.
   */
  it('answers the blocked courier exactly as if the username did not exist', async () => {
    const { anna, ben } = await friends();
    await block(anna, ben);

    const blocked = await refusal(request(ben, 'anna'));
    const unknown = await refusal(request(ben, 'nobody_at_all'));

    assert.deepEqual(blocked, unknown);
    assert.equal(blocked.hint, 'unknown_username');
  });

  it('tells the blocker why they cannot ask the courier they blocked', async () => {
    const { anna, ben } = await friends();
    await block(anna, ben);

    await rejectsWithHint(request(anna, 'ben'), 'courier_blocked');
    assert.equal(await pairRows(anna, ben), 0);
  });

  it('stops letters both ways', async () => {
    const { anna, ben } = await friends();
    await block(anna, ben);

    await rejectsWithHint(send(ben, anna), 'not_friends');
    await rejectsWithHint(send(anna, ben), 'not_friends');
  });

  it('hides letters from the blocked courier, those received and those still in the air', async () => {
    const { anna, ben } = await friends();
    const landed = await delivered(ben, anna, 'Before.');
    const flying = await send(ben, anna, 'On the way.');

    await block(anna, ben);

    assert.deepEqual(await inbox(anna), []);
    await rejectsWithHint(read(anna, landed), 'message_not_found');

    // The letter in the air still lands, and its bat still comes home.
    await fastForward(db, flying);
    assert.equal(await runWorker(db), 1);
    assert.deepEqual(await batStatuses(db, ben), ['available', 'available', 'available']);

    assert.deepEqual(await inbox(anna), []);
    await rejectsWithHint(read(anna, flying), 'message_not_found');
    assert.equal((await badges(anna)).unread_messages, 0);

    // Trying to read it did not mark it read.
    const { rows } = await db.query(`select opened_at from public.messages where id = $1`, [
      flying,
    ]);
    assert.equal(rows[0].opened_at, null);
  });

  it('shows the blocked courier nothing new: their letters went as letters go', async () => {
    const { anna, ben } = await friends();
    const flying = await send(ben, anna, 'On the way.');
    await block(anna, ben);
    await fastForward(db, flying);
    await runWorker(db);

    const sent = await rpc(db, ben, 'list_sent');
    assert.deepEqual(
      sent.map((letter) => [letter.message_id, letter.delivered]),
      [[flying, true]],
    );
    const [letter] = await read(ben, flying);
    assert.equal(letter.direction, 'sent');
    assert.equal(letter.delivered, true);
    assert.deepEqual(await listBlocked(ben), []);
  });

  it('is one-sided: the blocker’s own letters still land and stay readable', async () => {
    const { anna, ben } = await friends();
    const earlier = await delivered(anna, ben, 'Earlier.');
    const flying = await send(anna, ben, 'In the air.');

    await block(anna, ben);
    await fastForward(db, flying);
    await runWorker(db);

    const received = await inbox(ben);
    assert.deepEqual(received.map((letter) => letter.message_id).sort(), [earlier, flying].sort());
    assert.equal((await badges(ben)).unread_messages, 2);
  });

  it('brings the letters back when lifted, but not the friendship', async () => {
    const { anna, ben } = await friends();
    const landed = await delivered(ben, anna, 'Hello.');
    await block(anna, ben);

    await unblock(anna, ben);

    assert.deepEqual(
      (await inbox(anna)).map((letter) => letter.message_id),
      [landed],
    );
    assert.equal(await pairRows(anna, ben), 0);
    await rejectsWithHint(send(ben, anna), 'not_friends');
    assert.equal(await request(ben, 'anna'), 'requested');
  });

  it('leaves the other courier’s block standing when one of two is lifted', async () => {
    const { anna, ben } = await friends();
    await block(anna, ben);
    await block(ben, anna);

    await unblock(anna, ben);

    await rejectsWithHint(request(anna, 'ben'), 'unknown_username');
    await rejectsWithHint(request(ben, 'anna'), 'courier_blocked');
  });

  it('lifts nothing, harmlessly, when there was no block', async () => {
    const { anna, ben } = await friends();

    await unblock(anna, ben);

    assert.equal(await pairRows(anna, ben), 1);
  });

  it('lists the caller’s blocks, newest first, by username only', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cleo = await createCourier(db, { name: 'cleo' });
    await block(anna, ben);
    await db.query(`update public.blocks set created_at = now() - interval '1 hour'`);
    await block(anna, cleo);

    const listed = await listBlocked(anna);

    assert.deepEqual(Object.keys(listed[0]).sort(), ['blocked_at', 'courier_id', 'username']);
    assert.deepEqual(
      listed.map((row) => [row.courier_id, row.username]),
      [
        [cleo, 'cleo'],
        [ben, 'ben'],
      ],
    );
    assert.deepEqual(await listBlocked(ben), []);
  });

  it('goes with either courier’s account', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    const cleo = await createCourier(db, { name: 'cleo' });
    await block(anna, ben);
    await block(cleo, anna);

    await asUser(db, anna, () => db.query(`select public.delete_own_account()`));

    assert.equal(await count(db, `select 1 from public.blocks`), 0);
  });
});

describe('reporting a letter', () => {
  it('keeps a copy of the letter and of who sent it', async () => {
    const { anna, ben } = await friends();
    const letter = await delivered(ben, anna, 'Something unkind.');

    assert.equal(await reportLetter(anna, letter, { note: 'Not the first time.' }), 'reported');

    const [report] = await reports();
    const { rows } = await db.query(`select sent_at from public.messages where id = $1`, [letter]);
    assert.deepEqual(
      {
        reporter: report.reporter_id,
        reported: report.reported_id,
        letter: report.message_id,
        reason: report.reason,
        note: report.note,
        username: report.reported_username,
        name: report.reported_display_name,
        body: report.letter_body,
        sentAt: report.letter_sent_at.getTime(),
        resolved: report.resolved_at,
      },
      {
        reporter: anna,
        reported: ben,
        letter,
        reason: 'harassment',
        note: 'Not the first time.',
        username: 'ben',
        name: 'ben',
        body: 'Something unkind.',
        sentAt: rows[0].sent_at.getTime(),
        resolved: null,
      },
    );
  });

  it('reports a letter once, however often it is reported', async () => {
    const { anna, ben } = await friends();
    const letter = await delivered(ben, anna);

    await reportLetter(anna, letter);
    assert.equal(await reportLetter(anna, letter, { reason: 'spam' }), 'already_reported');

    assert.equal((await reports()).length, 1);
  });

  it('is only for a letter that has landed for the caller', async () => {
    const { anna, ben } = await friends();
    const cleo = await createCourier(db, { name: 'cleo', city: ['Hamburg', 'DE'] });
    const landed = await delivered(ben, anna);
    const flying = await send(ben, anna);

    await rejectsWithHint(reportLetter(anna, flying), 'message_not_found');
    await rejectsWithHint(reportLetter(ben, landed), 'message_not_found');
    await rejectsWithHint(reportLetter(cleo, landed), 'message_not_found');
    await rejectsWithHint(
      reportLetter(anna, '00000000-0000-4000-8000-000000000000'),
      'message_not_found',
    );
    assert.equal((await reports()).length, 0);
  });

  it('blocks the sender when asked to, even for a letter already reported', async () => {
    const { anna, ben } = await friends();
    const letter = await delivered(ben, anna);
    await reportLetter(anna, letter);

    assert.equal(await reportLetter(anna, letter, { also_block: true }), 'already_reported');

    assert.equal(await pairRows(anna, ben), 0);
    assert.deepEqual(
      (await listBlocked(anna)).map((row) => row.courier_id),
      [ben],
    );
  });

  it('can still report a letter from a courier already blocked', async () => {
    const { anna, ben } = await friends();
    const letter = await delivered(ben, anna);
    await block(anna, ben);

    assert.equal(await reportLetter(anna, letter), 'reported');
  });

  it('refuses a reason it does not know and a note that is too long', async () => {
    const { anna, ben } = await friends();
    const letter = await delivered(ben, anna);

    await rejectsWithHint(reportLetter(anna, letter, { reason: 'rude' }), 'unknown_reason');
    await rejectsWithHint(reportLetter(anna, letter, { reason: null }), 'unknown_reason');
    await rejectsWithHint(reportLetter(anna, letter, { note: 'x'.repeat(501) }), 'note_too_long');
    assert.equal((await reports()).length, 0);

    assert.equal(await reportLetter(anna, letter, { note: 'x'.repeat(500) }), 'reported');
  });

  it('keeps a note with nothing in it as no note', async () => {
    const { anna, ben } = await friends();
    const letter = await delivered(ben, anna);

    await reportLetter(anna, letter, { note: ' \n\t ' });

    assert.equal((await reports())[0].note, null);
  });

  it('accepts each of its reasons', async () => {
    const { anna, ben } = await friends();
    const reasons = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'other'];

    for (const reason of reasons) {
      const letter = await delivered(ben, anna);
      assert.equal(await reportLetter(anna, letter, { reason }), 'reported');
    }

    assert.deepEqual((await reports()).map((report) => report.reason).sort(), [...reasons].sort());
  });

  it('outlives both accounts, keeping the copy and losing the names', async () => {
    const { anna, ben } = await friends();
    const letter = await delivered(ben, anna, 'Kept.');
    await reportLetter(anna, letter);

    await asUser(db, ben, () => db.query(`select public.delete_own_account()`));
    await asUser(db, anna, () => db.query(`select public.delete_own_account()`));

    const [report] = await reports();
    assert.equal(report.reporter_id, null);
    assert.equal(report.reported_id, null);
    assert.equal(report.message_id, letter);
    assert.equal(report.reported_username, 'ben');
    assert.equal(report.letter_body, 'Kept.');
    assert.equal(await count(db, `select 1 from public.messages`), 0);
  });

  it('allows twenty reports a day, counting the last twenty-four hours', async () => {
    const { anna, ben } = await friends();
    const letter = await delivered(ben, anna);
    const fill = (age) =>
      db.query(
        `insert into public.reports
           (reporter_id, reported_id, reason, reported_username, created_at, resolved_at)
         select $1, $2, 'spam', 'ben', now() - $3::interval, now()
         from generate_series(1, 20)`,
        [anna, ben, age],
      );

    await fill('25 hours');
    assert.equal(await reportLetter(anna, letter), 'reported');

    await db.query(`delete from public.reports`);
    await fill('1 hour');
    await rejectsWithHint(reportLetter(anna, letter), 'too_many_reports');
  });
});

describe('reporting a courier', () => {
  it('keeps their names as they were', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(ben, 'anna');

    assert.equal(await reportCourier(anna, ben, { note: 'A name meant to hurt.' }), 'reported');
    await db.query(`update public.profiles set display_name = 'Someone else' where id = $1`, [ben]);

    const [report] = await reports();
    assert.equal(report.reporter_id, anna);
    assert.equal(report.reported_id, ben);
    assert.equal(report.message_id, null);
    assert.equal(report.letter_body, null);
    assert.equal(report.reason, 'spam');
    assert.equal(report.reported_username, 'ben');
    assert.equal(report.reported_display_name, 'ben');
  });

  it('refuses to report yourself, or someone who does not exist', async () => {
    const anna = await createCourier(db, { name: 'anna' });

    await rejectsWithHint(reportCourier(anna, anna), 'cannot_report_self');
    await rejectsWithHint(
      reportCourier(anna, '00000000-0000-4000-8000-000000000000'),
      'courier_not_found',
    );
  });

  it('keeps one open report per courier, and takes a new one once that is dealt with', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });

    await reportCourier(anna, ben);
    assert.equal(await reportCourier(anna, ben), 'already_reported');
    await db.query(`update public.reports set resolved_at = now(), resolution = 'warned'`);
    assert.equal(await reportCourier(anna, ben), 'reported');

    assert.equal((await reports()).length, 2);
  });

  it('blocks them when asked to', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await request(ben, 'anna');

    await reportCourier(anna, ben, { also_block: true });

    assert.equal(await pairRows(anna, ben), 0);
    await rejectsWithHint(request(ben, 'anna'), 'unknown_username');
  });
});

describe('keeping reports', () => {
  it('forgets them 180 days after they were made', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben' });
    await db.query(
      `insert into public.reports (reporter_id, reported_id, reason, reported_username, created_at)
       values ($1, $2, 'spam', 'ben', now() - interval '181 days'),
              ($2, $1, 'hate', 'anna', now() - interval '179 days')`,
      [anna, ben],
    );

    const { rows } = await db.query(`select private.forget_old_reports() as gone`);

    assert.equal(rows[0].gone, 1);
    assert.deepEqual(
      (await reports()).map((report) => report.reason),
      ['hate'],
    );
  });
});

describe('the tables behind it', () => {
  it('cannot be read or written by a signed-in user directly', async () => {
    const { anna, ben } = await friends();
    await block(anna, ben);
    await reportCourier(anna, ben);

    for (const sql of [
      `select * from public.blocks`,
      `select * from public.reports`,
      `delete from public.blocks`,
      `insert into public.reports (reason, reported_username) values ('spam', 'x')`,
    ]) {
      await assert.rejects(
        asUser(db, anna, () => db.query(sql)),
        (error) => error.code === '42501',
        sql,
      );
    }
  });
});
