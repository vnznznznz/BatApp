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
  setCity,
} from './fixtures.mjs';
import { asAnon, asUser, createTestDatabase } from './harness.mjs';

/**
 * Letters: sending, the bat reservation, the delivery calculation, the worker,
 * and who may read what. Each test named after a row of the roadmap's "tests
 * that matter" table carries that name verbatim.
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
    update private.flight_settings set time_multiplier = 1;
  `);
});

/** Anna in Berlin and Ben in Munich, friends, about 505 km apart. */
async function berlinAndMunich() {
  const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
  const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
  await makeFriends(db, anna, ben);
  return { anna, ben };
}

const send = async (from, to, body = 'Good evening.') =>
  (await rpc(db, from, 'send_message', { recipient_id: to, body }))[0];

const messageRow = async (id) =>
  (await db.query(`select * from public.messages where id = $1`, [id])).rows[0];

const minutes = (row) => (row.deliver_at - row.sent_at) / 60_000;

describe('sending', () => {
  it('Sending a message consumes exactly one bat', async () => {
    const { anna, ben } = await berlinAndMunich();

    const sent = await send(anna, ben);

    assert.deepEqual(await batStatuses(db, anna), ['flying', 'available', 'available']);
    const { rows } = await db.query(
      `select b.slot from public.messages m join public.bats b on b.id = m.bat_id where m.id = $1`,
      [sent.message_id],
    );
    assert.equal(rows[0].slot, 1);
  });

  it('sends each further letter with a different bat', async () => {
    const { anna, ben } = await berlinAndMunich();

    await send(anna, ben, 'one');
    await send(anna, ben, 'two');
    await send(anna, ben, 'three');

    assert.deepEqual(await batStatuses(db, anna), ['flying', 'flying', 'flying']);
    assert.equal(await count(db, `select distinct bat_id from public.messages`), 3);
  });

  it('A user with zero available bats cannot send', async () => {
    const { anna, ben } = await berlinAndMunich();
    await send(anna, ben, 'one');
    await send(anna, ben, 'two');
    await send(anna, ben, 'three');

    await rejectsWithHint(send(anna, ben, 'four'), 'no_available_bat');

    assert.equal(await count(db, `select 1 from public.messages`), 3);
  });

  it('does not touch the recipient’s bats', async () => {
    const { anna, ben } = await berlinAndMunich();

    await send(anna, ben);

    assert.deepEqual(await batStatuses(db, ben), ['available', 'available', 'available']);
  });

  it('A user cannot send to a non-friend', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const stranger = await createCourier(db, { name: 'stranger', city: ['Munich', 'DE'] });

    await rejectsWithHint(send(anna, stranger), 'not_friends');

    assert.equal(await count(db, `select 1 from public.messages`), 0);
    assert.deepEqual(await batStatuses(db, anna), ['available', 'available', 'available']);
  });

  it('does not count a request that is still pending as a friendship', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
    await rpc(db, anna, 'request_friend', { username: 'ben' });

    await rejectsWithHint(send(anna, ben), 'not_friends');
    await rejectsWithHint(send(ben, anna), 'not_friends');
  });

  it('stops at the end of a friendship', async () => {
    const { anna, ben } = await berlinAndMunich();
    await db.query(`delete from public.friendships`);

    await rejectsWithHint(send(anna, ben), 'not_friends');
  });

  /**
   * A phone can lose the answer to a send that went through, and the courier,
   * told it failed, taps Send again. The app repeats the same client_ref, and
   * the repeat must not cost a second bat.
   */
  it('sends a letter once however often the same send is repeated', async () => {
    const { anna, ben } = await berlinAndMunich();
    const ref = '0d3c1c0e-7a5b-4c47-9b0e-2f3f1f9e0a11';

    const first = (
      await rpc(db, anna, 'send_message', { recipient_id: ben, body: 'Once.', client_ref: ref })
    )[0];
    const again = (
      await rpc(db, anna, 'send_message', { recipient_id: ben, body: 'Once.', client_ref: ref })
    )[0];

    assert.equal(again.message_id, first.message_id);
    assert.deepEqual(again.deliver_at, first.deliver_at);
    assert.equal(await count(db, `select 1 from public.messages`), 1);
    assert.deepEqual(await batStatuses(db, anna), ['flying', 'available', 'available']);
  });

  it('answers a repeat even when every bat is out', async () => {
    const { anna, ben } = await berlinAndMunich();
    const ref = '6b1e5c1c-1f0e-4a43-8d8c-6f0b7f7c2d22';
    const first = (
      await rpc(db, anna, 'send_message', { recipient_id: ben, body: 'One.', client_ref: ref })
    )[0];
    await send(anna, ben, 'two');
    await send(anna, ben, 'three');

    const again = (
      await rpc(db, anna, 'send_message', { recipient_id: ben, body: 'One.', client_ref: ref })
    )[0];

    assert.equal(again.message_id, first.message_id);
  });

  it('treats a new client_ref as a new letter', async () => {
    const { anna, ben } = await berlinAndMunich();

    await rpc(db, anna, 'send_message', {
      recipient_id: ben,
      body: 'One.',
      client_ref: '11111111-1111-4111-8111-111111111111',
    });
    await rpc(db, anna, 'send_message', {
      recipient_id: ben,
      body: 'Two.',
      client_ref: '22222222-2222-4222-8222-222222222222',
    });

    assert.equal(await count(db, `select 1 from public.messages`), 2);
  });

  it('keeps one courier’s client_ref apart from another’s', async () => {
    const { anna, ben } = await berlinAndMunich();
    const ref = '33333333-3333-4333-8333-333333333333';

    await rpc(db, anna, 'send_message', { recipient_id: ben, body: 'Hi Ben.', client_ref: ref });
    await rpc(db, ben, 'send_message', { recipient_id: anna, body: 'Hi Anna.', client_ref: ref });

    assert.equal(await count(db, `select 1 from public.messages`), 2);
  });

  it('refuses a letter to yourself', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });

    await rejectsWithHint(send(anna, anna), 'not_friends');
  });

  it('refuses a letter with no words in it', async () => {
    const { anna, ben } = await berlinAndMunich();

    await rejectsWithHint(send(anna, ben, ''), 'empty_message');
    await rejectsWithHint(send(anna, ben, '  \n\t  '), 'empty_message');
  });

  it('accepts a letter of the maximum length, and not one character more', async () => {
    const { anna, ben } = await berlinAndMunich();

    await send(anna, ben, 'a'.repeat(2000));
    await rejectsWithHint(send(anna, ben, 'a'.repeat(2001)), 'message_too_long');

    assert.equal(await count(db, `select 1 from public.messages`), 1);
  });

  it('keeps the letter exactly as written', async () => {
    const { anna, ben } = await berlinAndMunich();
    const body = 'Dear Ben,\n\n  the moon is up — and so am I. 🦇\n';

    const sent = await send(anna, ben, body);

    assert.equal((await messageRow(sent.message_id)).body, body);
  });

  it('needs the sender to have chosen a city', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    const ben = await createCourier(db, { name: 'ben', city: ['Munich', 'DE'] });
    await makeFriends(db, anna, ben);

    await rejectsWithHint(send(anna, ben), 'sender_has_no_city');
    assert.deepEqual(await batStatuses(db, anna), ['available', 'available', 'available']);
  });

  it('needs the recipient to have chosen a city', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben' });
    await makeFriends(db, anna, ben);

    await rejectsWithHint(send(anna, ben), 'recipient_has_no_city');
    assert.deepEqual(await batStatuses(db, anna), ['available', 'available', 'available']);
  });

  it('is not available to a signed-out visitor', async () => {
    const { ben } = await berlinAndMunich();

    await assert.rejects(() =>
      asAnon(db, () => db.query(`select * from public.send_message($1, 'hello')`, [ben])),
    );
  });
});

describe('delivery calculation', () => {
  it('measures the distance between the two cities on the server', async () => {
    const { anna, ben } = await berlinAndMunich();

    const sent = await send(anna, ben);

    assert.ok(Math.abs(sent.distance_km - 505) < 5, `distance ${sent.distance_km}`);
    assert.equal((await messageRow(sent.message_id)).distance_km, sent.distance_km);
  });

  it('flies at 80 km/h', async () => {
    const { anna, ben } = await berlinAndMunich();

    const sent = await send(anna, ben);
    const row = await messageRow(sent.message_id);

    assert.ok(Math.abs(minutes(row) - (row.distance_km / 80) * 60) < 0.01, `${minutes(row)} min`);
  });

  /** Two friends in one city would otherwise exchange letters in seconds. */
  it('never delivers sooner than twenty minutes, even across the street', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben', city: ['Berlin', 'DE'] });
    await makeFriends(db, anna, ben);

    const sent = await send(anna, ben);
    const row = await messageRow(sent.message_id);

    assert.equal(row.distance_km, 0);
    assert.ok(Math.abs(minutes(row) - 20) < 0.01, `${minutes(row)} min`);
  });

  it('takes days across a continent', async () => {
    const anna = await createCourier(db, { name: 'anna', city: ['Berlin', 'DE'] });
    const ben = await createCourier(db, { name: 'ben', city: ['Sydney', 'AU'] });
    await makeFriends(db, anna, ben);

    const sent = await send(anna, ben);
    const row = await messageRow(sent.message_id);

    assert.ok(minutes(row) > 3 * 24 * 60, `${minutes(row)} min`);
  });

  it('scales every flight by the operator’s time multiplier', async () => {
    const { anna, ben } = await berlinAndMunich();
    await db.query(`update private.flight_settings set time_multiplier = 0.01`);

    const sent = await send(anna, ben);
    const row = await messageRow(sent.message_id);

    assert.ok(Math.abs(minutes(row) - (row.distance_km / 80) * 60 * 0.01) < 0.01);
  });

  it('cannot be set to deliver instantly, or slower than real time', async () => {
    await assert.rejects(
      () => db.query(`update private.flight_settings set time_multiplier = 0`),
      /flight_settings_multiplier_range/,
    );
    await assert.rejects(
      () => db.query(`update private.flight_settings set time_multiplier = 2`),
      /flight_settings_multiplier_range/,
    );
  });

  it('uses the cities as they were when the bat left', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    const before = await messageRow(sent.message_id);

    await setCity(db, ben, ['Sydney', 'AU']);

    const afterMove = await messageRow(sent.message_id);
    assert.deepEqual(afterMove.deliver_at, before.deliver_at);
    assert.equal(afterMove.destination_city_id, before.destination_city_id);
  });

  describe('A client cannot manipulate `delivery_at`', () => {
    it('because send_message takes no arrival time, distance or coordinates', async () => {
      const { anna, ben } = await berlinAndMunich();

      await assert.rejects(() =>
        rpc(db, anna, 'send_message', {
          recipient_id: ben,
          body: 'Quick!',
          deliver_at: new Date().toISOString(),
        }),
      );
    });

    it('because no client can insert a letter directly', async () => {
      const { anna, ben } = await berlinAndMunich();
      const { rows } = await db.query(
        `select id from public.bats where owner_id = $1 and slot = 1`,
        [anna],
      );

      await assert.rejects(() =>
        asUser(db, anna, () =>
          db.query(
            `insert into public.messages
               (sender_id, recipient_id, bat_id, body, origin_city_id, destination_city_id,
                distance_km, sent_at, deliver_at)
             select $1, $2, $3, 'Quick!', city_id, city_id, 0, now(), now() + interval '1 second'
             from public.profiles where id = $1`,
            [anna, ben, rows[0].id],
          ),
        ),
      );
    });

    it('because no client can move a letter’s arrival', async () => {
      const { anna, ben } = await berlinAndMunich();
      const sent = await send(anna, ben);
      const before = await messageRow(sent.message_id);

      await assert.rejects(() =>
        asUser(db, anna, () =>
          db.query(`update public.messages set deliver_at = now() + interval '1 second'`),
        ),
      );

      assert.deepEqual((await messageRow(sent.message_id)).deliver_at, before.deliver_at);
    });

    it('because the schema refuses an arrival at or before departure', async () => {
      const { anna, ben } = await berlinAndMunich();
      const sent = await send(anna, ben);

      await assert.rejects(
        () =>
          db.query(`update public.messages set deliver_at = sent_at where id = $1`, [
            sent.message_id,
          ]),
        /messages_never_instant/,
      );
    });
  });
});

describe('the delivery worker', () => {
  it('leaves a letter alone until its time', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);

    assert.equal(await runWorker(db), 0);

    assert.equal((await messageRow(sent.message_id)).delivered_at, null);
    assert.deepEqual(await batStatuses(db, anna), ['flying', 'available', 'available']);
  });

  it('A delivered message returns its bat to AVAILABLE', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    await fastForward(db, sent.message_id);

    assert.equal(await runWorker(db), 1);

    const row = await messageRow(sent.message_id);
    assert.ok(row.delivered_at >= row.deliver_at);
    assert.deepEqual(await batStatuses(db, anna), ['available', 'available', 'available']);
  });

  it('The delivery worker is idempotent', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    await fastForward(db, sent.message_id);

    assert.equal(await runWorker(db), 1);
    const first = (await messageRow(sent.message_id)).delivered_at;

    assert.equal(await runWorker(db), 0);
    assert.equal(await runWorker(db), 0);

    assert.deepEqual((await messageRow(sent.message_id)).delivered_at, first);
    assert.deepEqual(await batStatuses(db, anna), ['available', 'available', 'available']);
  });

  it('lands only what is due, and only those bats come home', async () => {
    const { anna, ben } = await berlinAndMunich();
    const due = await send(anna, ben, 'due');
    await send(anna, ben, 'not yet');
    const alsoDue = await send(ben, anna, 'also due');
    await fastForward(db, due.message_id);
    await fastForward(db, alsoDue.message_id);

    assert.equal(await runWorker(db), 2);

    assert.deepEqual(await batStatuses(db, anna), ['available', 'flying', 'available']);
    assert.deepEqual(await batStatuses(db, ben), ['available', 'available', 'available']);
  });

  /**
   * Nothing recorded at a landing may depend on whose request noticed it. A
   * homecoming stamped with the moment of the recipient's request would tell
   * the sender when their friend opened the app.
   */
  it('records a homecoming at the landing time, whoever’s request landed it', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    await db.query(
      `update public.messages
       set sent_at = now() - interval '8 hours', deliver_at = now() - interval '90 minutes'
       where id = $1`,
      [sent.message_id],
    );

    // Ben opens the app an hour and a half after the letter landed.
    await rpc(db, ben, 'get_badges');

    const { rows } = await db.query(
      `select b.updated_at = m.deliver_at as at_landing
       from public.messages m join public.bats b on b.id = m.bat_id
       where m.id = $1`,
      [sent.message_id],
    );
    assert.equal(rows[0].at_landing, true);
  });

  it('lets a bat that came home fly again', async () => {
    const { anna, ben } = await berlinAndMunich();
    const first = await send(anna, ben, 'one');
    await send(anna, ben, 'two');
    await send(anna, ben, 'three');
    await fastForward(db, first.message_id);
    await runWorker(db);

    const again = await send(anna, ben, 'four');

    const { rows } = await db.query(
      `select m.id, b.slot from public.messages m join public.bats b on b.id = m.bat_id
       where m.id in ($1, $2) order by m.sent_at`,
      [first.message_id, again.message_id],
    );
    assert.deepEqual(
      rows.map((row) => row.slot),
      [1, 1],
    );
  });

  /**
   * The database's own guarantee, independent of the reservation's locking:
   * whatever went wrong upstream, a bat cannot be carrying two letters.
   */
  it('cannot put a second letter on a bat that is in the air', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);

    await assert.rejects(
      () =>
        db.query(
          `insert into public.messages
             (sender_id, recipient_id, bat_id, body, origin_city_id, destination_city_id,
              distance_km, deliver_at)
           select sender_id, recipient_id, bat_id, 'second', origin_city_id, destination_city_id,
                  distance_km, deliver_at
           from public.messages where id = $1`,
          [sent.message_id],
        ),
      /messages_one_flight_per_bat/,
    );
  });

  it('is not callable by a client', async () => {
    const { anna } = await berlinAndMunich();

    await assert.rejects(() =>
      asUser(db, anna, () => db.query(`select private.deliver_due_messages()`)),
    );
  });
});

describe('delivery without the scheduler', () => {
  /**
   * The app's own functions deliver what is due for the caller before they
   * answer, so a stalled scheduler delays nothing anyone is looking at.
   */
  it('shows a due letter to its recipient before the worker has run', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    await fastForward(db, sent.message_id);

    const inbox = await rpc(db, ben, 'list_inbox');

    assert.deepEqual(
      inbox.map((row) => row.message_id),
      [sent.message_id],
    );
  });

  it('brings a due bat home when its owner looks at the roost', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    await fastForward(db, sent.message_id);

    const roost = await rpc(db, anna, 'get_roost');

    assert.deepEqual(
      roost.map((bat) => bat.status),
      ['available', 'available', 'available'],
    );
  });

  it('lets a courier whose bats are all out send as soon as one is due', async () => {
    const { anna, ben } = await berlinAndMunich();
    const first = await send(anna, ben, 'one');
    await send(anna, ben, 'two');
    await send(anna, ben, 'three');
    await fastForward(db, first.message_id);

    await send(anna, ben, 'four');

    assert.equal(await count(db, `select 1 from public.messages`), 4);
    assert.ok((await messageRow(first.message_id)).delivered_at);
  });

  it('does not deliver anything that is not due', async () => {
    const { anna, ben } = await berlinAndMunich();
    await send(anna, ben);

    assert.deepEqual(await rpc(db, ben, 'list_inbox'), []);
    const roost = await rpc(db, anna, 'get_roost');
    assert.deepEqual(
      roost.map((bat) => bat.status),
      ['flying', 'available', 'available'],
    );
  });
});

describe('the roost', () => {
  it('shows all three bats, and where the flying one is going', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);

    const roost = await rpc(db, anna, 'get_roost');

    assert.equal(roost.length, 3);
    const [flying, ...home] = roost;
    assert.equal(flying.slot, 1);
    assert.equal(flying.status, 'flying');
    assert.equal(flying.message_id, sent.message_id);
    assert.equal(flying.recipient_id, ben);
    assert.equal(flying.recipient_username, 'ben');
    assert.equal(flying.recipient_display_name, 'ben');
    assert.deepEqual(flying.deliver_at, new Date(sent.deliver_at));
    for (const bat of home) {
      assert.equal(bat.status, 'available');
      assert.equal(bat.message_id, null);
      assert.equal(bat.deliver_at, null);
    }
  });

  it('shows only the caller’s own bats', async () => {
    const { anna, ben } = await berlinAndMunich();
    await send(ben, anna);

    const roost = await rpc(db, anna, 'get_roost');

    assert.deepEqual(
      roost.map((bat) => bat.status),
      ['available', 'available', 'available'],
    );
  });
});

describe('reading', () => {
  it('shows the recipient nothing while the bat is in the air', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);

    assert.deepEqual(await rpc(db, ben, 'list_inbox'), []);
    await rejectsWithHint(
      rpc(db, ben, 'read_message', { message_id: sent.message_id }),
      'message_not_found',
    );
    const [badges] = await rpc(db, ben, 'get_badges');
    assert.equal(badges.unread_messages, 0);
  });

  it('gives the recipient the letter once it lands, and where it came from', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben, 'Dear Ben, the moon is full.');
    await fastForward(db, sent.message_id);
    await runWorker(db);

    const [item] = await rpc(db, ben, 'list_inbox');

    assert.equal(item.message_id, sent.message_id);
    assert.equal(item.sender_id, anna);
    assert.equal(item.sender_username, 'anna');
    assert.equal(item.sender_display_name, 'anna');
    assert.equal(item.origin_city_name, 'Berlin');
    assert.equal(item.origin_country_code, 'DE');
    assert.equal(item.preview, 'Dear Ben, the moon is full.');
    assert.equal(item.opened_at, null);
    assert.deepEqual(item.arrived_at, (await messageRow(sent.message_id)).deliver_at);
  });

  it('marks a letter opened when the recipient reads it', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben, 'Dear Ben, the moon is full.');
    await fastForward(db, sent.message_id);

    assert.equal((await rpc(db, ben, 'get_badges'))[0].unread_messages, 1);
    const [letter] = await rpc(db, ben, 'read_message', { message_id: sent.message_id });

    assert.equal(letter.direction, 'received');
    assert.equal(letter.body, 'Dear Ben, the moon is full.');
    assert.equal(letter.other_id, anna);
    assert.ok(letter.opened_at);
    assert.equal((await rpc(db, ben, 'get_badges'))[0].unread_messages, 0);
    assert.ok((await rpc(db, ben, 'list_inbox'))[0].opened_at);
  });

  it('keeps the first opening time when a letter is read again', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    await fastForward(db, sent.message_id);

    const [first] = await rpc(db, ben, 'read_message', { message_id: sent.message_id });
    const [second] = await rpc(db, ben, 'read_message', { message_id: sent.message_id });

    assert.deepEqual(second.opened_at, first.opened_at);
  });

  it('lets the sender read their own letter at any time', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben, 'Still flying.');

    const [letter] = await rpc(db, anna, 'read_message', { message_id: sent.message_id });

    assert.equal(letter.direction, 'sent');
    assert.equal(letter.body, 'Still flying.');
    assert.equal(letter.delivered, false);
    assert.equal(letter.other_id, ben);
  });

  it('lists what the sender sent, in the air and landed', async () => {
    const { anna, ben } = await berlinAndMunich();
    const landed = await send(anna, ben, 'landed');
    await fastForward(db, landed.message_id);
    const flying = await send(anna, ben, 'flying');

    const sent = await rpc(db, anna, 'list_sent');

    assert.deepEqual(
      sent.map((row) => [row.message_id, row.delivered]),
      [
        [flying.message_id, false],
        [landed.message_id, true],
      ],
    );
    assert.equal(sent[0].recipient_username, 'ben');
    assert.equal(sent[0].destination_city_name, 'Munich');
  });

  describe('no read receipts', () => {
    it('gives the sender’s list no column that could say a letter was opened', async () => {
      const { anna, ben } = await berlinAndMunich();
      const sent = await send(anna, ben);
      await fastForward(db, sent.message_id);
      await rpc(db, ben, 'read_message', { message_id: sent.message_id });

      const [row] = await rpc(db, anna, 'list_sent');

      assert.deepEqual(Object.keys(row).sort(), [
        'deliver_at',
        'delivered',
        'destination_city_name',
        'destination_country_code',
        'distance_km',
        'message_id',
        'preview',
        'recipient_display_name',
        'recipient_id',
        'recipient_username',
        'sent_at',
      ]);
    });

    it('tells the sender nothing about opening even on the letter itself', async () => {
      const { anna, ben } = await berlinAndMunich();
      const sent = await send(anna, ben);
      await fastForward(db, sent.message_id);
      await rpc(db, ben, 'read_message', { message_id: sent.message_id });

      const [letter] = await rpc(db, anna, 'read_message', { message_id: sent.message_id });

      assert.equal(letter.opened_at, null);
    });

    it('does not let the sender read the letters table directly', async () => {
      const { anna, ben } = await berlinAndMunich();
      await send(anna, ben);

      await assert.rejects(() =>
        asUser(db, anna, () => db.query(`select opened_at from public.messages`)),
      );
    });
  });

  describe('A user cannot read another user’s message', () => {
    it('through read_message', async () => {
      const { anna, ben } = await berlinAndMunich();
      const cara = await createCourier(db, { name: 'cara', city: ['Hamburg', 'DE'] });
      const sent = await send(anna, ben, 'Between us.');
      await fastForward(db, sent.message_id);

      await rejectsWithHint(
        rpc(db, cara, 'read_message', { message_id: sent.message_id }),
        'message_not_found',
      );
    });

    it('through either list', async () => {
      const { anna, ben } = await berlinAndMunich();
      const cara = await createCourier(db, { name: 'cara', city: ['Hamburg', 'DE'] });
      const sent = await send(anna, ben, 'Between us.');
      await fastForward(db, sent.message_id);

      assert.deepEqual(await rpc(db, cara, 'list_inbox'), []);
      assert.deepEqual(await rpc(db, cara, 'list_sent'), []);
    });

    it('through the table', async () => {
      const { anna, ben } = await berlinAndMunich();
      const cara = await createCourier(db, { name: 'cara', city: ['Hamburg', 'DE'] });
      await send(anna, ben, 'Between us.');

      await assert.rejects(() =>
        asUser(db, cara, () => db.query(`select body from public.messages`)),
      );
    });

    it('through someone else’s page cursor', async () => {
      const { anna, ben } = await berlinAndMunich();
      const cara = await createCourier(db, { name: 'cara', city: ['Hamburg', 'DE'] });
      await makeFriends(db, anna, cara);
      const theirs = await send(anna, ben, 'Between us.');
      const mine = await send(anna, cara, 'For Cara.');
      await fastForward(db, theirs.message_id);
      await fastForward(db, mine.message_id);

      // Refused exactly as a cursor naming no letter at all would be: no page
      // positioned relative to it, and no hint that it exists.
      await rejectsWithHint(
        rpc(db, cara, 'list_inbox', { older_than: theirs.message_id }),
        'cursor_not_found',
      );
    });
  });

  /**
   * A cursor whose letter has gone - deleted with its sender's account - cannot
   * place the next page. An empty page would read as the end of the list.
   */
  it('says so when the letter a page continues from has gone', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    await fastForward(db, sent.message_id);
    await db.query(`delete from public.messages where id = $1`, [sent.message_id]);

    await rejectsWithHint(
      rpc(db, ben, 'list_inbox', { older_than: sent.message_id }),
      'cursor_not_found',
    );
    await rejectsWithHint(
      rpc(db, anna, 'list_sent', { older_than: sent.message_id }),
      'cursor_not_found',
    );
  });

  it('pages through the inbox without losing letters that landed together', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = [];
    for (let i = 0; i < 3; i++) sent.push(await send(anna, ben, `letter ${i}`));
    for (let i = 0; i < 3; i++) sent.push(await send(ben, anna, `reply ${i}`));
    // Three letters for Ben, all landing in the same instant.
    await db.query(
      `update public.messages
       set sent_at = now() - interval '2 hours', deliver_at = now() - interval '1 hour'
       where recipient_id = $1`,
      [ben],
    );

    const seen = [];
    let cursor = null;
    for (let page = 0; page < 5; page++) {
      const rows = await rpc(db, ben, 'list_inbox', { max_results: 2, older_than: cursor });
      if (rows.length === 0) break;
      seen.push(...rows.map((row) => row.preview));
      cursor = rows.at(-1).message_id;
    }

    assert.deepEqual([...seen].sort(), ['letter 0', 'letter 1', 'letter 2']);
  });

  it('bounds a page however many letters are asked for', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    await fastForward(db, sent.message_id);

    assert.equal((await rpc(db, ben, 'list_inbox', { max_results: 0 })).length, 1);
    assert.equal((await rpc(db, ben, 'list_inbox', { max_results: 100000 })).length, 1);
  });

  it('counts friend requests waiting for an answer', async () => {
    const anna = await createCourier(db, { name: 'anna' });
    await createCourier(db, { name: 'ben' });
    const cara = await createCourier(db, { name: 'cara' });
    await rpc(db, anna, 'request_friend', { username: 'ben' });
    await rpc(db, cara, 'request_friend', { username: 'ben' });
    await rpc(db, anna, 'request_friend', { username: 'cara' });

    const benId = (await db.query(`select id from public.profiles where username = 'ben'`)).rows[0]
      .id;
    const [badges] = await rpc(db, benId, 'get_badges');

    assert.equal(badges.friend_requests, 2);
  });

  it('is not available to a signed-out visitor', async () => {
    for (const fn of ['get_roost()', 'list_inbox()', 'list_sent()', 'get_badges()']) {
      await assert.rejects(() => asAnon(db, () => db.query(`select * from public.${fn}`)), fn);
    }
  });
});

describe('Account deletion removes or anonymises the required data', () => {
  it('removes every letter the account sent, from every inbox', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    await fastForward(db, sent.message_id);
    await runWorker(db);

    await asUser(db, anna, () => db.query(`select public.delete_own_account()`));

    assert.equal(await count(db, `select 1 from public.messages`), 0);
    assert.deepEqual(await rpc(db, ben, 'list_inbox'), []);
  });

  it('removes every letter the account received', async () => {
    const { anna, ben } = await berlinAndMunich();
    const sent = await send(anna, ben);
    await fastForward(db, sent.message_id);
    await runWorker(db);

    await asUser(db, ben, () => db.query(`select public.delete_own_account()`));

    assert.equal(await count(db, `select 1 from public.messages`), 0);
    assert.deepEqual(await rpc(db, anna, 'list_sent'), []);
  });

  /** Otherwise the sender would be one bat short, forever. */
  it('brings home a bat that was flying to the deleted account', async () => {
    const { anna, ben } = await berlinAndMunich();
    await send(anna, ben, 'one');
    await send(anna, ben, 'two');

    await asUser(db, ben, () => db.query(`select public.delete_own_account()`));

    assert.deepEqual(await batStatuses(db, anna), ['available', 'available', 'available']);
  });

  it('leaves letters between other couriers alone', async () => {
    const { anna, ben } = await berlinAndMunich();
    const cara = await createCourier(db, { name: 'cara', city: ['Hamburg', 'DE'] });
    await makeFriends(db, ben, cara);
    await send(ben, cara, 'not about Anna');

    await asUser(db, anna, () => db.query(`select public.delete_own_account()`));

    assert.equal(await count(db, `select 1 from public.messages`), 1);
    assert.deepEqual(await batStatuses(db, ben), ['flying', 'available', 'available']);
  });
});
