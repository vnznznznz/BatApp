import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * build-cities.mjs turns a GeoNames dump into a migration. It used to rewrite
 * the one file it had written before - and a database that has applied a
 * migration never runs it again, so the hosted project would have kept the old
 * cities while the tests and the local stack, which replay everything, had the
 * new ones. These run the script on a dump of four made-up lines, into a
 * scratch folder, without the network.
 */

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'build-cities.mjs');

/** One line of cities15000.txt: nineteen tab-separated columns. */
const line = (id, name, alternates, lat, lon, country, population) =>
  [
    id,
    name,
    name,
    alternates,
    lat,
    lon,
    'P',
    'PPL',
    country,
    '',
    '',
    '',
    '',
    '',
    population,
    '',
    '',
    'Europe/Zurich',
    '2026-01-01',
  ].join('\t');

const DUMP = [
  line(2657896, 'Zürich', 'Zurich,Zuerich,Цюрих', 47.36667, 8.55, 'CH', 341730),
  line(2820973, 'Trossingen', '', 48.07667, 8.64409, 'DE', 15040),
  line(2988507, 'Paris', 'Parigi', 48.85341, 2.3488, 'FR', 2138551),
  // Outside Germany, Austria and Switzerland only the large cities are kept.
  line(3000001, 'Petiteville', '', 45.0, 3.0, 'FR', 20000),
].join('\n');

const APPLIED = {
  '20260825120000_cities.sql': '-- the table\n',
  '20260825120100_cities_data.sql': '-- the cities, as a hosted project has already applied them\n',
};

let scratch;
let migrations;
let fixture;
let dump;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'build-cities-'));
  migrations = join(scratch, 'migrations');
  fixture = join(scratch, 'fold-parity.fixture.json');
  dump = join(scratch, 'cities15000.txt');
  mkdirSync(migrations);
  for (const [name, text] of Object.entries(APPLIED)) writeFileSync(join(migrations, name), text);
  writeFileSync(dump, DUMP + '\n');
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const run = (args, env = {}) =>
  spawnSync(process.execPath, [SCRIPT, '--migrations', migrations, '--fixture', fixture, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

const fromDump = () => run(['--dump', dump]);

describe('build-cities.mjs', () => {
  it('writes a new migration and leaves the earlier ones as they were', () => {
    const result = fromDump();
    assert.equal(result.status, 0, result.stderr);

    const files = readdirSync(migrations).sort();
    assert.equal(files.length, 3);
    for (const [name, text] of Object.entries(APPLIED))
      assert.equal(readFileSync(join(migrations, name), 'utf8'), text, name);

    const added = files.at(-1);
    assert.match(added, /^\d{14}_cities_data\.sql$/);
    assert.ok(!(added in APPLIED));
  });

  it('writes one that brings a database with the earlier cities up to date', () => {
    fromDump();
    const sql = readFileSync(join(migrations, readdirSync(migrations).sort().at(-1)), 'utf8');

    assert.match(sql, /insert into public\.cities /);
    assert.match(sql, /\(2657896, 'Zürich', 'CH', 47\.3667, 8\.55, 341730, 'zurich\|zuerich'\)/);
    assert.match(sql, /\(2820973, 'Trossingen', 'DE', /);
    assert.match(sql, /\(2988507, 'Paris', 'FR', /);
    assert.doesNotMatch(sql, /Petiteville/);
    // Rows that are there already are updated, not refused.
    assert.match(sql, /on conflict \(id\) do update set/);
    assert.match(sql, /population = excluded\.population/);
    assert.match(sql, /-- 3 cities:/);
  });

  it('writes another file at every run, each after the last', () => {
    assert.equal(fromDump().status, 0);
    assert.equal(fromDump().status, 0);
    assert.equal(fromDump().status, 0);

    const files = readdirSync(migrations).sort();
    assert.equal(files.length, 5);
    assert.equal(new Set(files).size, 5);
    assert.deepEqual(files.slice(0, 2), Object.keys(APPLIED));
  });

  // Migrations run in the order of their names. One written today has to come
  // after every one that exists, whatever dates those carry.
  it('goes after a migration dated later than today', () => {
    writeFileSync(join(migrations, '29991231235959_something_later.sql'), '-- later\n');
    const result = fromDump();
    assert.equal(result.status, 0, result.stderr);

    const files = readdirSync(migrations).sort();
    assert.equal(files.at(-1), '30000101000000_cities_data.sql');
  });

  it('pins the folding of the names it wrote, for the client to be held to', () => {
    fromDump();
    const { pairs } = JSON.parse(readFileSync(fixture, 'utf8'));

    assert.deepEqual(pairs, [
      ['Paris', 'paris'],
      ['Trossingen', 'trossingen'],
      ['Zürich', 'zurich'],
    ]);
  });

  it('says where it wrote, and that the old file was left alone', () => {
    const result = fromDump();

    assert.match(result.stdout, /Wrote 3 cities to .*\d{14}_cities_data\.sql/);
    assert.match(result.stdout, /db push --remote/);
  });
});

describe('build-cities.mjs, downloading', () => {
  let bin;
  let calls;

  /**
   * A stand-in for curl that behaves as curl does when the server answers 404:
   * with --fail it writes nothing and exits 22; without, it saves the error
   * page as if it were the file and exits 0.
   */
  beforeEach(() => {
    bin = join(scratch, 'bin');
    calls = join(scratch, 'curl-calls.txt');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'curl'),
      `#!/bin/sh
echo "$@" >> "${calls}"
out=""
fail=0
while [ $# -gt 0 ]; do
  case "$1" in
    --fail|-f) fail=1 ;;
    -o) out="$2"; shift ;;
  esac
  shift
done
if [ "$fail" = 1 ]; then echo "curl: (22) The requested URL returned error: 404" >&2; exit 22; fi
echo "<html>404 Not Found</html>" > "$out"
exit 0
`,
    );
    chmodSync(join(bin, 'curl'), 0o755);
  });

  // TMPDIR is where the script unpacks; pointing it into the scratch folder
  // shows whether anything is left there afterwards.
  const download = () => {
    mkdirSync(join(scratch, 'tmp'), { recursive: true });
    return run([], { PATH: `${bin}${delimiter}${process.env.PATH}`, TMPDIR: join(scratch, 'tmp') });
  };

  it('stops at an error from the server instead of unpacking the error page', () => {
    const result = download();

    assert.notEqual(result.status, 0);
    assert.match(readFileSync(calls, 'utf8'), /--fail/);
    assert.match(
      result.stderr,
      /build-cities: could not download https:\/\/download\.geonames\.org/,
    );
    assert.doesNotMatch(result.stderr, /unzip|End-of-central-directory/);
  });

  it('writes nothing and leaves nothing behind when the download fails', () => {
    download();

    assert.deepEqual(readdirSync(migrations).sort(), Object.keys(APPLIED));
    assert.ok(!existsSync(fixture));
    assert.deepEqual(readdirSync(join(scratch, 'tmp')), []);
  });
});
