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
 * Run manually - this downloads about 3 MB - and commit the result:
 *   node scripts/build-cities.mjs
 *
 * Source: GeoNames cities15000 (every city above 15,000 inhabitants),
 * licensed CC BY 4.0. https://download.geonames.org/export/dump/
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A fixed filename, so re-running replaces the data rather than stacking up a
 * second copy. The schema it fills lives in the hand-written migration that
 * sorts immediately before it.
 */
const OUT = join(ROOT, 'supabase', 'migrations', '20260825120100_cities_data.sql');

const TMP = join(ROOT, '.cities-tmp');
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

mkdirSync(TMP, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });
console.log(`Downloading ${SOURCE_URL}`);
execFileSync('curl', ['-sSL', '--max-time', '300', '-o', join(TMP, 'dump.zip'), SOURCE_URL]);
execFileSync('unzip', ['-o', '-q', join(TMP, 'dump.zip'), '-d', TMP]);

const rows = readFileSync(join(TMP, `${DUMP}.txt`), 'utf8').split('\n');
console.log(`Read ${rows.length} rows.`);

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

const header = `-- Night Courier city reference data.
--
-- GENERATED FILE - do not edit. Regenerate with:
--   node scripts/build-cities.mjs
--
-- Source: GeoNames ${DUMP}, licensed CC BY 4.0.
-- Contains data from GeoNames (https://www.geonames.org), used under CC BY 4.0.
-- https://creativecommons.org/licenses/by/4.0/
--
-- ${cities.length} cities: every city above 15,000 inhabitants in ${[...FULL_COVERAGE].join(', ')},
-- plus every city worldwide above ${WORLD_MIN_POPULATION.toLocaleString('en-US')} inhabitants.
--
-- Ids are GeoNames ids, which are stable across dumps, so re-running this
-- script updates rows in place rather than renumbering them.

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

writeFileSync(OUT, header + statements.join('\n\n') + '\n');
writeFixture(cities);
rmSync(TMP, { recursive: true, force: true });
console.log(`Wrote ${cities.length} cities to ${OUT.replace(ROOT + '/', '')}`);

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

  const file = join(ROOT, 'src', 'features', 'cities', 'fold-parity.fixture.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify(
      {
        note: 'GENERATED by scripts/build-cities.mjs. Pins the folding used to build search_index.',
        pairs: sample,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Wrote ${sample.length} folding pairs to ${file.replace(ROOT + '/', '')}`);
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
