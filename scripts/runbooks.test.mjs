import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { fastForward, makeFriends, rpc, runWorker, setCity } from '../src/tests/db/fixtures.mjs';
import { createTestDatabase, createUser } from '../src/tests/db/harness.mjs';

/**
 * The operator's runbooks are followed word for word - by someone who is not a
 * developer, or by a session - and their SQL goes straight into the live
 * database. A statement that no longer fits the schema, a column the next step
 * needs and the query does not select, a function that has been renamed: each
 * would first show there, in the middle of handling a threat or a request for
 * erasure.
 *
 * So the SQL is taken out of the documents as it stands and run, in the order
 * the documents give it, on the test database (the real migrations, in PGlite).
 *
 * Not covered, because the test database has only a stand-in for Supabase's
 * auth tables: the export of sign-in records in GO-LIVE ("A threat"), the access
 * query of gdpr-records.md 5.3, and the monthly look at pg_cron's log in 5.6.
 * Those were run, read-only, against the local Supabase stack.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/** Whether any migration of this tree has these words in it. */
const migrationsSay = (words) =>
  readdirSync(join(ROOT, 'supabase', 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .some((file) => read(join('supabase', 'migrations', file)).includes(words));

/** The SQL blocks between two headings of a document, without their indentation. */
function sqlBetween(file, from, to) {
  const text = read(file);
  const start = text.indexOf(from);
  const end = text.indexOf(to, start + 1);
  assert.ok(start !== -1 && end !== -1, `${file}: no section from "${from}" to "${to}"`);
  return [...text.slice(start, end).matchAll(/^( *)```sql\n([\s\S]*?)^ *```/gm)].map(
    ([, indent, sql]) => sql.replace(new RegExp(`^${indent}`, 'gm'), '').trim(),
  );
}

/** The one block that holds `mark`. A document that grows a second one has to say which is meant. */
function theBlockWith(blocks, mark) {
  const found = blocks.filter((block) => block.includes(mark));
  assert.equal(found.length, 1, `expected one SQL block with "${mark}", found ${found.length}`);
  return found[0];
}

const fill = (sql, values) =>
  Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`<${name}>`, value), sql);

const count = async (db, sql, params = []) =>
  (await db.query(`select count(*)::int as n from (${sql}) as counted`, params)).rows[0].n;

/** An entry of the sign-in log, as GoTrue writes them: the person is named only inside the payload. */
const logEntry = (db, payload) =>
  db.query(`insert into auth.audit_log_entries (payload) values ($1::json)`, [
    JSON.stringify(payload),
  ]);

/**
 * What the log holds for an account: its own events, under its id, and what the
 * operator did to it through the dashboard, under "service_role" with the person
 * named in traits (both shapes copied from the local stack's log).
 */
async function signInLogFor(db, id, email) {
  const own = { actor_id: id, actor_username: email, traits: { provider: 'email' } };
  await logEntry(db, { action: 'user_signedup', ...own });
  await logEntry(db, { action: 'login', ...own });
  await logEntry(db, {
    action: 'user_modified',
    actor_id: '00000000-0000-0000-0000-000000000000',
    actor_username: 'service_role',
    traits: { user_email: email, user_id: id, user_phone: '' },
  });
}

/** The actions of every log entry that still names this person, by id or by address. */
const namedIn = async (db, id, email) =>
  (
    await db.query(
      `select payload ->> 'action' as action from auth.audit_log_entries
       where payload::text like '%' || $1 || '%' or payload::text like '%' || $2 || '%'
       order by 1`,
      [id, email],
    )
  ).rows.map((row) => row.action);

/** Two couriers who are friends, with one letter from the second landed in the first's box. */
async function aLetterBetween(db, { to, from }) {
  const recipient = await createUser(db, {
    email: `${to}@example.test`,
    username: to,
    displayName: to,
  });
  const sender = await createUser(db, {
    email: `${from}@example.test`,
    username: from,
    displayName: from,
  });
  await setCity(db, recipient, ['Berlin', 'DE']);
  await setCity(db, sender, ['Munich', 'DE']);
  await makeFriends(db, recipient, sender);
  const [{ message_id: letter }] = await rpc(db, sender, 'send_message', {
    recipient_id: recipient,
    body: 'I know where you live',
  });
  await fastForward(db, letter);
  assert.equal(await runWorker(db), 1);
  return { recipient, sender, letter };
}

describe('GO-LIVE, "Handling a report", run as written', () => {
  const blocks = sqlBetween('docs/GO-LIVE.md', '## Handling a report', '## Setting up the hosted');
  const queue = theBlockWith(blocks, 'from public.reports');
  const addresses = theBlockWith(blocks, 'where id in');
  const suspend = theBlockWith(blocks, 'private.ban_period()');
  const lift = theBlockWith(blocks, 'banned_until = null');
  const remove = theBlockWith(blocks, 'private.remove_account');
  const resolve = theBlockWith(blocks, 'update public.reports');

  const SUSPENDED_WITH_A_PROFILE = `
    select u.id from auth.users u
    where u.banned_until > now() and exists (select 1 from public.profiles p where p.id = u.id)`;

  it('takes a threat from the queue to the removal, by way of a suspension that is lifted', async () => {
    const db = await createTestDatabase();
    const {
      recipient: anna,
      sender: sam,
      letter,
    } = await aLetterBetween(db, {
      to: 'anna',
      from: 'sam',
    });
    await rpc(db, anna, 'report_letter', {
      message_id: letter,
      reason: 'violence',
      also_block: true,
    });

    // The queue gives what every later step asks for: both people, and the report.
    const open = (await db.query(queue)).rows;
    assert.equal(open.length, 1);
    const [report] = open;
    assert.equal(report.reported_id, sam);
    assert.equal(report.reporter_id, anna);
    assert.equal(report.letter_body, 'I know where you live');
    const ids = { reported_id: report.reported_id, reporter_id: report.reporter_id };

    // The two addresses, each beside its id: the warning and the email after a
    // threat go to different people.
    const people = (await db.query(fill(addresses, ids))).rows;
    assert.deepEqual(Object.fromEntries(people.map((person) => [person.id, person.email])), {
      [sam]: 'sam@example.test',
      [anna]: 'anna@example.test',
    });
    assert.deepEqual(
      people.map((person) => person.banned_until),
      [null, null],
    );

    // A threat: stop the account, delete nothing.
    await db.query(fill(suspend, ids));
    assert.deepEqual(
      (await db.query(SUSPENDED_WITH_A_PROFILE)).rows.map((row) => row.id),
      [sam],
    );
    assert.equal(await count(db, `select 1 from public.messages`), 1);

    // It proves unfounded: the account is as it was.
    await db.query(fill(lift, ids));
    assert.deepEqual((await db.query(SUSPENDED_WITH_A_PROFILE)).rows, []);
    assert.equal(
      await count(db, `select 1 from auth.users where id = $1 and banned_until is null`, [sam]),
      1,
    );
    assert.equal(await count(db, `select 1 from public.profiles where id = $1`, [sam]), 1);
    assert.equal(await count(db, `select 1 from public.messages`), 1);

    // It was one after all: suspend again, and remove when the week is up.
    await db.query(fill(suspend, ids));
    await db.query(fill(remove, ids));
    assert.equal(await count(db, `select 1 from public.profiles where id = $1`, [sam]), 0);
    assert.equal(await count(db, `select 1 from public.messages`), 0);
    assert.equal(
      await count(
        db,
        `select 1 from auth.users where id = $1 and banned_until > now() + interval '700 days'`,
        [sam],
      ),
      1,
    );

    // Recorded, the report leaves the queue.
    await db.query(fill(resolve, { 'report id': report.id }));
    assert.deepEqual((await db.query(queue)).rows, []);
  });
});

describe('gdpr-records.md 5.4, deleting an account for someone, run as written', () => {
  const blocks = sqlBetween('docs/store/gdpr-records.md', '### 5.4 ', '### 5.5 ');
  const [lookUp, deleteAccount] = theBlockWith(blocks, 'private.delete_account').split(/\n\n/);
  const clearLog = theBlockWith(blocks, 'delete from auth.audit_log_entries');

  it('finds the account whatever the case of the address as it was typed', async () => {
    const db = await createTestDatabase();
    const anna = await createUser(db, { email: 'anna@example.test', username: 'anna' });

    const found = (await db.query(fill(lookUp, { 'E-Mail-Adresse': 'Anna@Example.TEST' }))).rows;

    assert.deepEqual(found, [{ id: anna, email: 'anna@example.test', banned_until: null }]);
  });

  /**
   * The statement used to look at actor_id and actor_username only. What the
   * operator does to an account through the dashboard - deleting it there, above
   * all - is logged under "service_role", with the person in traits: those
   * entries stayed, id and address and all, for up to 30 days. (Found in review.)
   */
  it('clears from the sign-in log every entry that names the person, and nobody else’s', async () => {
    const db = await createTestDatabase();
    const anna = await createUser(db, { email: 'anna@example.test', username: 'anna' });
    const ben = await createUser(db, { email: 'ben@example.test', username: 'ben' });
    await signInLogFor(db, anna, 'anna@example.test');
    await signInLogFor(db, ben, 'ben@example.test');
    // The dashboard's Delete user: the row goes, and GoTrue writes this.
    await db.query(`delete from auth.users where id = $1`, [anna]);
    await logEntry(db, {
      action: 'user_deleted',
      actor_id: '00000000-0000-0000-0000-000000000000',
      actor_username: 'service_role',
      traits: { user_email: 'anna@example.test', user_id: anna, user_phone: '' },
    });

    await db.query(fill(clearLog, { 'Nutzer-ID': anna, 'E-Mail-Adresse': 'Anna@Example.TEST' }));

    assert.deepEqual(await namedIn(db, anna, 'anna@example.test'), []);
    assert.deepEqual(await namedIn(db, ben, 'ben@example.test'), [
      'login',
      'user_modified',
      'user_signedup',
    ]);
  });

  it('deletes the account and all it holds, bans nothing, and says so when there is none', async (t) => {
    // The function comes with a migration that another branch adds. Until one
    // of this tree's migrations defines it, the step that names it cannot run,
    // and the test says so instead of passing. From then on it runs for good:
    // a function renamed or dropped later is a failure, not a skip.
    if (!migrationsSay('function private.delete_account(')) {
      t.skip('no migration in this tree defines private.delete_account yet');
      return;
    }
    const db = await createTestDatabase();

    const { recipient: anna, sender: ben } = await aLetterBetween(db, { to: 'anna', from: 'ben' });
    await signInLogFor(db, anna, 'anna@example.test');
    const values = { 'Nutzer-ID': anna, 'E-Mail-Adresse': 'anna@example.test' };

    await db.query(fill(deleteAccount, values));

    assert.equal(await count(db, `select 1 from auth.users where id = $1`, [anna]), 0);
    assert.equal(await count(db, `select 1 from public.profiles where id = $1`, [anna]), 0);
    assert.equal(await count(db, `select 1 from public.messages`), 0);
    assert.equal(await count(db, `select 1 from auth.users where id = $1`, [ben]), 1);
    // What the account itself caused is gone with it; what the operator did to
    // it is what step 3 is for.
    assert.deepEqual(await namedIn(db, anna, 'anna@example.test'), ['user_modified']);
    await db.query(fill(clearLog, values));
    assert.deepEqual(await namedIn(db, anna, 'anna@example.test'), []);

    // No ban: the address can sign up again at once.
    await createUser(db, { email: 'anna@example.test', username: 'anna' });

    await assert.rejects(
      db.query(fill(deleteAccount, values)),
      new RegExp(`there is no account ${anna}`),
    );
  });
});
