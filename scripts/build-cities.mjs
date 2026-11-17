/**
 * Builds the city reference data from GeoNames, as a SQL migration.
 *
 * Night Courier turns the distance between two cities into a delivery time, so
 * it needs coordinates. Those coordinates live in Postgres rather than in the
 * app bundle, and the client sends only a city id.
 *
 * That is a security decision, not a storage one. If the client sent latitude
 * and longitude, anyone could claim to live next door to the recipient and
 * forge a short flight. The delivery time has to be derived from data the client
 * cannot choose.
 *
 * GeoNames is also preferred over a geocoding API: no third party learns where
 * any user lives, there is no API key or rate limit, and the same city always
 * yields the same distance. The trade-off is a finite list - a village below the
 * population cut-off cannot be chosen, and the user picks the nearest town
 * instead. At city-level granularity that changes nothing meaningful.
 *
 * Run by hand - it downloads about 3 MB - and commit what it writes:
 *   node scripts/build-cities.mjs
 *
 * Every run writes a NEW migration, supabase/migrations/<now>_cities_data.sql,
 * and leaves the earlier ones exactly as they are. A database runs a migration
 * once and never again: had this script rewritten the file it wrote last time,
 * the tests and the local stack - which replay everything - would have had the
 * new cities, the hosted project would have kept the old ones, and
 * `db push` would have said "up to date".
 *
 * The new file holds every city, and where a row is there already it is
 * brought up to date instead of refused. Applied after the earlier files it
 * therefore changes what has changed and adds what is new. It takes nothing
 * away: a town that has dropped out of the list stays in the table, because a
 * courier may live there.
 *
 * After a run: commit the new migration and the fold-parity fixture, bring it
 * to the hosted project (`npx supabase@3.2.0 db push --remote --yes`), and look
 * for the old number of cities in the tests and the documents.
 *
 * --dump <file> reads a cities15000.txt that is already on disk instead of
 * downloading one. --migrations <folder> and --fixture <file> write somewhere
 * else than into this repository; the tests use all three.
 *
 * Source: GeoNames cities15000 (every city above 15,000 inhabitants),
 * licensed CC BY 4.0. https://download.geonames.org/export/dump/
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`build-cities: ${message}`);
  process.exit(1);
}

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const MIGRATIONS = resolve(option('--migrations') ?? join(ROOT, 'supabase', 'migrations'));
const FIXTURE = resolve(
  option('--fixture') ?? join(ROOT, 'src', 'features', 'cities', 'fold-parity.fixture.json'),
);

const DUMP = 'cities15000';
const SOURCE_URL = `https://download.geonames.org/export/dump/${DUMP}.zip`;

/**
 * Countries kept in full, down to the 15,000 cut-off: this app is for one
 * person's friends and family, who are overwhelmingly in the German-speaking
 * countries. Everywhere else keeps only cities large enough that someone abroad
 * can still find a recognisable place near them.
 */
const FULL_COVERAGE = new Set(['DE', 'AT', 'CH']);
const WORLD_MIN_POPULATION = 200_000;

/** GeoNames column indices, from the readme accompanying the dump. */
const COL = { id: 0, name: 1, alternates: 3, lat: 4, lon: 5, country: 8, population: 14 };

/**
 * GeoNames' primary name is frequently the English one: Vienna, not Wien;
 * Munich, not München; Nuremberg, not Nürnberg. A German-speaking user typing
 * the name they actually use would find nothing for roughly a fifth of the
 * cities they might look for, so the alternate names are folded into a search
 * index alongside the primary.
 *
 * The alternates column carries every language GeoNames knows, unlabelled, so
 * it is filtered to Latin script. That drops Cyrillic, Greek, CJK, Arabic and
 * Hebrew forms - most of the volume and none of the value here - while keeping
 * every European exonym.
 */
const LATIN_NAME = /^[\p{Script=Latin}\p{M}][\p{Script=Latin}\p{M}0-9 .'-]{1,39}$/u;

let dump;
try {
  dump = readDump();
} catch (error) {
  fail(error.message);
}
const rows = dump.split('\n');
console.log(`Read ${rows.length} rows.`);

/** The dump as text: the file named with --dump, or a fresh download. */
function readDump() {
  const given = option('--dump');
  if (given) return readFileSync(resolve(given), 'utf8');

  // Unpacked outside the repository, and removed again whatever happens - which
  // is why a failure in here is thrown, not answered with an exit on the spot.
  const work = mkdtempSync(join(tmpdir(), 'build-cities-'));
  const step = (what, command, args) => {
    try {
      execFileSync(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    } catch (error) {
      throw new Error(`${what} (${command} ended with ${error.status ?? error.code})`);
    }
  };
  try {
    console.log(`Downloading ${SOURCE_URL}`);
    // --fail: without it curl saves the server's error page as if it were the
    // archive, and the failure only shows later, as a broken zip.
    step(`could not download ${SOURCE_URL}`, 'curl', [
      '--fail',
      '-sSL',
      '--max-time',
      '300',
      '-o',
      join(work, 'dump.zip'),
      SOURCE_URL,
    ]);
    step('could not unpack what was downloaded', 'unzip', [
      '-o',
      '-q',
      join(work, 'dump.zip'),
      '-d',
      work,
    ]);
    return readFileSync(join(work, `${DUMP}.txt`), 'utf8');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Keyed by GeoNames id, which is stable across dumps. */
const kept = new Map();

for (const row of rows) {
  if (!row) continue;
  const f = row.split('\t');

  const id = Number.parseInt(f[COL.id], 10);
  const name = f[COL.name];
  const country = f[COL.country];
  const lat = Number.parseFloat(f[COL.lat]);
  const lon = Number.parseFloat(f[COL.lon]);
  const population = Number.parseInt(f[COL.population], 10) || 0;

  if (!Number.isFinite(id) || !name || !country) continue;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  if (!FULL_COVERAGE.has(country) && population < WORLD_MIN_POPULATION) continue;

  kept.set(id, {
    id,
    name,
    country,
    // Four decimals is roughly 11 metres - far finer than a city centre needs.
    lat: round(lat),
    lon: round(lon),
    population,
    searchIndex: searchIndex(name, f[COL.alternates]),
  });
}

const cities = [...kept.values()].sort((a, b) => b.population - a.population);

const OUT = join(MIGRATIONS, `${nextVersion()}_cities_data.sql`);

/**
 * The name of the new migration: now, to the second, in UTC - or one second
 * after the newest migration there is, should that one carry a later date.
 * Migrations run in the order of their names, and this one has to come last.
 */
function nextVersion() {
  const stamp = (date) => date.toISOString().replace(/\D/g, '').slice(0, 14);
  const newest = readdirSync(MIGRATIONS)
    .map((name) => name.match(/^(\d{14})_.*\.sql$/)?.[1])
    .filter(Boolean)
    .sort()
    .at(-1);

  const now = stamp(new Date());
  if (!newest || now > newest) return now;

  const [, y, mo, d, h, mi, sec] = newest.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/);
  return stamp(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec + 1)));
}

const header = `-- Night Courier city reference data, as of ${new Date().toISOString().slice(0, 10)}.
--
-- GENERATED by scripts/build-cities.mjs - do not edit, and do not generate it
-- again: a database that has applied this file never runs it a second time.
-- For newer data run the script once more. It writes a new file beside this
-- one, which brings these rows up to date and adds what is new.
--
-- Source: GeoNames ${DUMP}, licensed CC BY 4.0.
-- Contains data from GeoNames (https://www.geonames.org), used under CC BY 4.0.
-- https://creativecommons.org/licenses/by/4.0/
--
-- ${cities.length} cities: every city above 15,000 inhabitants in ${[...FULL_COVERAGE].join(', ')},
-- plus every city worldwide above ${WORLD_MIN_POPULATION.toLocaleString('en-US')} inhabitants.
--
-- Ids are GeoNames ids, which are the same from one dump to the next, so a row
-- that is there already is updated in place rather than added a second time.

`;

// Batched so no single statement grows unreasonably large.
const BATCH = 500;
const statements = [];
for (let i = 0; i < cities.length; i += BATCH) {
  const values = cities
    .slice(i, i + BATCH)
    .map(
      (c) =>
        `  (${c.id}, ${sql(c.name)}, ${sql(c.country)}, ${c.lat}, ${c.lon}, ` +
        `${c.population}, ${sql(c.searchIndex)})`,
    )
    .join(',\n');

  statements.push(
    `insert into public.cities (id, name, country_code, latitude, longitude, population, search_index)\nvalues\n${values}\non conflict (id) do update set\n` +
      `  name = excluded.name,\n  country_code = excluded.country_code,\n` +
      `  latitude = excluded.latitude,\n  longitude = excluded.longitude,\n` +
      `  population = excluded.population,\n  search_index = excluded.search_index;`,
  );
}

if (cities.length === 0) fail('the dump holds no city that would be kept; nothing written');

mkdirSync(MIGRATIONS, { recursive: true });
// 'wx': never over a file that is there. The name is new by construction; if
// it is not, something is wrong, and an applied migration must not pay for it.
writeFileSync(OUT, header + statements.join('\n\n') + '\n', { flag: 'wx' });
writeFixture(cities);
console.log(`Wrote ${cities.length} cities to ${relative(ROOT, OUT)}`);
console.log(
  'The earlier migrations are untouched. Commit the new one, then bring it to the hosted ' +
    'project: npx supabase@3.2.0 db push --remote --yes',
);

/**
 * The client folds the user's query and the generator folded the search index.
 * If the two ever disagree, search does not fail - it quietly stops finding
 * cities, which is far worse. This fixture pins the generator's output so a
 * test can assert the TypeScript implementation reproduces it exactly.
 *
 * Sampled toward names with diacritics, since those are where the two could
 * plausibly diverge.
 */
function writeFixture(all) {
  const interesting = all.filter((c) => /[^\u0020-\u007E]/.test(c.name));
  const plain = all.filter((c) => !/[^\u0020-\u007E]/.test(c.name));

  const sample = [...interesting.slice(0, 150), ...plain.slice(0, 50)]
    .map((c) => [c.name, fold(c.name)])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));

  mkdirSync(dirname(FIXTURE), { recursive: true });
  writeFileSync(
    FIXTURE,
    JSON.stringify(
      {
        note: 'GENERATED by scripts/build-cities.mjs. Pins the folding used to build search_index.',
        pairs: sample,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Wrote ${sample.length} folding pairs to ${relative(ROOT, FIXTURE)}`);
}

/**
 * Everything the city can be found by, pipe-delimited and folded so that
 * "Zurich" matches "Zürich" and "Koln" matches "Köln" - typing umlauts on a
 * phone keyboard is possible but nobody bothers.
 *
 * Must stay in step with `fold()` in src/features/cities/search.ts. That pairing
 * is asserted by a test, because a silent divergence would make search quietly
 * miss cities rather than fail.
 */
function searchIndex(name, alternates) {
  const seen = new Set();
  const terms = [];

  for (const candidate of [name, ...(alternates ?? '').split(',')]) {
    const trimmed = candidate.trim();
    if (!trimmed || !LATIN_NAME.test(trimmed)) continue;

    const folded = fold(trimmed);
    if (!folded || seen.has(folded)) continue;
    seen.add(folded);
    terms.push(folded);
  }

  return terms.join('|');
}

function fold(value) {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9 .'-]/g, '');
}

/** Single-quoted SQL literal. */
function sql(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function round(value) {
  return Math.round(value * 10_000) / 10_000;
}
