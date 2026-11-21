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

/**
 * The values the migration writes for city `id`, read back out of it:
 * numbers, strings with their quotes undone, and null.
 */
function written(sql, id) {
  const line = sql.split('\n').find((text) => text.startsWith(`  (${id}, `));
  if (!line) return undefined;
  const values = [];
  const token = /\s*(?:'((?:[^']|'')*)'|(-?[\d.]+)|(null))\s*(?:,|\)[,;]?$)/gy;
  token.lastIndex = 3;
  let match;
  while ((match = token.exec(line))) {
    if (match[1] !== undefined) values.push(match[1].replace(/''/g, "'"));
    else if (match[2] !== undefined) values.push(Number(match[2]));
    else values.push(null);
  }
  return values;
}

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
    assert.deepEqual(written(sql, 2657896), [
      2657896,
      'Zürich',
      'CH',
      47.3667,
      8.55,
      341730,
      'zurich|zuerich',
    ]);
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
    // Without the database password db push does not stop: it takes a
    // temporary login role nobody has tried on a real project. The hint once
    // gave the bare command, so it sends the reader to the runbook's way.
    assert.match(result.stdout, /SUPABASE_DB_PASSWORD/);
    assert.match(result.stdout, /docs\/GO-LIVE\.md, "Setting up the hosted project", step 3/);
  });
});

describe('build-cities.mjs, folding names', () => {
  /** Names as GeoNames writes them, and the ways people type them. */
  const SPELLINGS_DUMP = [
    line(2658822, 'Sankt Gallen', 'St. Gallen,Saint-Gall,San Gallo', 47.4239, 9.3748, 'CH', 75833),
    line(2911522, 'Halle (Saale)', 'Halle,Halle an der Saale', 51.4816, 11.9795, 'DE', 237865),
    line(2661513, 'Biel/Bienne', 'Biel,Bienne', 47.1371, 7.2461, 'CH', 55120),
    line(5045360, 'Saint Paul', 'St. Paul,St Paul', 44.9444, -93.0933, 'US', 300851),
    line(268743, 'Ra’s Bayrūt', '', 33.9, 35.4833, 'LB', 1251739),
    line(12492662, 'Mianzhu, Deyang, Sichuan', '', 31.3379, 104.2206, 'CN', 510000),
    line(2820973, 'Trossingen', 'Trosingen', 48.07667, 8.64409, 'DE', 15040),
  ].join('\n');

  const fromSpellings = () => {
    writeFileSync(dump, SPELLINGS_DUMP + '\n');
    const result = fromDump();
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(join(migrations, readdirSync(migrations).sort().at(-1)), 'utf8');
  };

  /** The search index the migration gives a city, read back out of it. */
  const indexOf = (sql, id) => written(sql, id)?.[6];

  /**
   * One form for st, st., sankt and saint at the start of a word, which is
   * what the client sends whichever was typed - and before it the form as
   * written, so that what found the town before, typed half-way, still does,
   * and the first term is the town's own name as it is written: search_cities
   * ranks by it.
   */
  it('keeps each name as it was written, first, and makes the saints one form after it', () => {
    const sql = fromSpellings();

    assert.equal(indexOf(sql, 2658822), 'sankt gallen|st. gallen|saint-gall|sankt-gall|san gallo');
    assert.equal(indexOf(sql, 5045360), 'saint paul|sankt paul|st. paul|st paul');
  });

  it('indexes a name with brackets, slashes or commas, reading them as spaces', () => {
    const sql = fromSpellings();

    assert.equal(indexOf(sql, 2911522), 'halle saale|halle|halle an der saale');
    assert.equal(indexOf(sql, 2661513), 'biel bienne|biel|bienne');
    assert.equal(indexOf(sql, 12492662), 'mianzhu deyang sichuan');
  });

  it('indexes a name with a typographic apostrophe, read as a plain one', () => {
    assert.equal(indexOf(fromSpellings(), 268743), "ra's bayrut");
  });

  it('pins how the spellings people type fold, beside the names it wrote', () => {
    fromSpellings();
    const { pairs, spellings } = JSON.parse(readFileSync(fixture, 'utf8'));

    assert.deepEqual(
      pairs.find(([name]) => name === 'Halle (Saale)'),
      ['Halle (Saale)', 'halle saale'],
    );
    const folded = new Map(spellings);
    assert.equal(folded.get('St Gallen'), 'sankt gallen');
    assert.equal(folded.get('St.Gallen'), 'sankt gallen');
    assert.equal(folded.get('Saint Gallen'), 'sankt gallen');
    assert.equal(folded.get('Biel/Bienne'), 'biel bienne');
    assert.equal(folded.get('Ra’s Bayrūt'), "ra's bayrut");
    assert.equal(folded.get('St'), 'st');
    assert.equal(folded.get('Stuttgart'), 'stuttgart');
  });
});

/**
 * What tells two towns of one name apart is the database's to work out, over
 * the whole table (private.qualify_cities, in the city qualifiers migration):
 * worked out among one dump's cities, a town left in the table by an earlier
 * run would make its twin look like the only town of its name. (Found in
 * review.) cities.db.test.mjs applies a migration written here to a database
 * and looks at the result.
 */
describe('build-cities.mjs, towns of the same name', () => {
  it('writes no qualifier, and has the database work them out once every row is in', () => {
    writeFileSync(
      dump,
      [
        line(2924803, 'Friedberg', '', 48.3569, 10.9846, 'DE', 29953),
        line(2924802, 'Friedberg', '', 50.3374, 8.7559, 'DE', 27484),
        line(2954172, 'Augsburg', '', 48.3715, 10.8985, 'DE', 301105),
      ].join('\n') + '\n',
    );
    const result = fromDump();
    assert.equal(result.status, 0, result.stderr);
    const sql = readFileSync(join(migrations, readdirSync(migrations).sort().at(-1)), 'utf8');

    assert.equal(written(sql, 2924803).length, 7);
    assert.doesNotMatch(sql, /qualifier =|, qualifier\)/);
    const call = sql.indexOf('select private.qualify_cities();');
    assert.ok(call > sql.lastIndexOf('insert into public.cities'), 'called before the rows are in');
    assert.equal(sql.trimEnd().slice(call), 'select private.qualify_cities();');
  });
});

describe('build-cities.mjs, rows nothing could find', () => {
  const run = (lines) => {
    writeFileSync(dump, lines.join('\n') + '\n');
    const result = fromDump();
    assert.equal(result.status, 0, result.stderr);
    const sql = readFileSync(join(migrations, readdirSync(migrations).sort().at(-1)), 'utf8');
    return { sql, stdout: result.stdout };
  };

  /**
   * The dead rows migration took the two quarters of Köln called Neustadt out
   * of the table. Written into the next migration, they would come back.
   */
  it('leaves out the quarters of Köln that a migration took out', () => {
    const { sql } = run([
      line(2886242, 'Köln', 'Cologne', 50.9333, 6.95, 'DE', 1024621),
      line(8593856, 'Neustadt/Süd', '', 50.9251, 6.9476, 'DE', 37939),
      line(8593855, 'Neustadt/Nord', '', 50.949, 6.9479, 'DE', 28146),
    ]);

    assert.match(sql, /\(2886242, 'Köln', /);
    assert.doesNotMatch(sql, /859385[56]/);
    assert.match(sql, /-- 1 cities:/);
  });

  /**
   * A row with an empty search index can be chosen by nobody. Such a city is
   * not written, and the run says which it was; one that is in the table
   * already keeps what it has.
   */
  it('writes no city that no name could find, and says which it left out', () => {
    const { sql, stdout } = run([
      line(1850147, '東京', 'Токио', 35.6895, 139.6917, 'JP', 9733276),
      line(2820973, 'Trossingen', '', 48.07667, 8.64409, 'DE', 15040),
    ]);

    assert.doesNotMatch(sql, /1850147/);
    assert.match(sql, /\(2820973, 'Trossingen', /);
    assert.match(stdout, /Left out 1 city that no name in the dump could find: 東京, JP/);
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
