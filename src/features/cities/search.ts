import { supabase } from '@/lib/supabase';

export type City = {
  id: number;
  name: string;
  countryCode: string;
  population: number;
  /**
   * What tells the city apart from another of the same name in the same
   * country - "near Augsburg" for one Friedberg, "near Frankfurt am Main" for
   * the other - worked out from where the towns are (see the city qualifiers
   * migration). Null for a city whose name is its own.
   */
  qualifier: string | null;
};

/** Below this, a search would return most of the table for no useful reason. */
export const MIN_QUERY_LENGTH = 2;

/**
 * Normalises a name to the form stored in `cities.search_index`.
 *
 * Folding diacritics means "Zurich" finds Zürich and "Koln" finds Köln, which
 * matters because typing umlauts on a phone keyboard is possible but nobody
 * bothers. Sharp s becomes "ss" before the marks are stripped, since NFD leaves
 * it alone and "Gießen" should be reachable as "giessen". A typographic
 * apostrophe, which a phone's keyboard may type for a plain one, counts as
 * the plain one. Brackets, slashes and commas part words, as in "Halle
 * (Saale)" and "Biel/Bienne", and runs of spaces close up. Then the saints
 * become one form: see `saintForm`.
 *
 * **This must stay identical to `fold()` in `scripts/build-cities.mjs`.** A
 * divergence would not raise an error; search would simply stop finding cities.
 * `search.test.ts` asserts the two agree against a generated fixture.
 */
export function fold(value: string): string {
  return saintForm(
    value
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(/[‘’ʼ]/g, "'")
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[(),/]/g, ' ')
      .replace(/[^a-z0-9 .'-]/g, '')
      .replace(/ +/g, ' ')
      .trim(),
  );
}

/**
 * "St Gallen", "St. Gallen", "St.Gallen" and "Saint Gallen" all mean Sankt
 * Gallen, which is how GeoNames writes it. So st, st., sankt and saint at the
 * start of a word become "sankt", here and in the search index alike. Only a
 * whole word does: "st" or "saint" at the very end of what is typed may still
 * become Stuttgart or Saintes, and is left as it is. A dot ends the word.
 */
function saintForm(folded: string): string {
  return folded
    .replace(/(^|[ -])st\.(?=[a-z0-9])/g, '$1sankt ')
    .replace(/(^|[ -])(?:st\.|st(?=[ -])|saint(?=[ -]))/g, '$1sankt');
}

/**
 * Searches the city table by folded name or alias.
 *
 * The search runs on the server: the coordinates behind these ids decide how
 * long a message takes, so the table is not shipped to the client, and the
 * client never learns or sends a latitude. Ranking is the database's job too -
 * see `search_cities` in the migration.
 */
export async function searchCities(query: string, limit = 20): Promise<City[]> {
  const term = fold(query.trim());
  if (term.length < MIN_QUERY_LENGTH) return [];

  const { data, error } = await supabase.rpc('search_cities', {
    folded_query: term,
    max_results: limit,
  });

  if (error) throw new Error('Cities could not be searched. Check your connection.');

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    name: String(row.name),
    countryCode: String(row.country_code),
    population: Number(row.population),
    qualifier: typeof row.qualifier === 'string' ? row.qualifier : null,
  }));
}

/**
 * The city data is GeoNames' (scripts/build-cities.mjs), under CC BY 4.0, which
 * asks for three things wherever it is shown: credit, a link to the licence, and
 * a word that it was changed - here, cut down to larger cities and given extra
 * search names. The city picker and the profile say so.
 */
export const CITY_DATA_CREDIT =
  'City names and places adapted from GeoNames (geonames.org), licensed under ' +
  'CC BY 4.0 (creativecommons.org/licenses/by/4.0).';

/**
 * "Rösrath, DE" — and, for one of two towns of the same name in the same
 * country, where it is: "Friedberg (near Augsburg), DE".
 */
export function describeCity(
  city: Pick<City, 'name' | 'countryCode'> & { qualifier?: string | null },
): string {
  return `${cityName(city)}, ${city.countryCode}`;
}

/**
 * A city's name as short as it can be and still be told apart: "Rösrath" -
 * and "Friedberg (near Augsburg)" for one of two towns of the same name in
 * the same country. For where a name stands without its country, as on the
 * lists of letters and the flight path: "Friedberg" alone was either one.
 * (Found in review.)
 */
export function cityName(city: Pick<City, 'name'> & { qualifier?: string | null }): string {
  return city.qualifier ? `${city.name} (${city.qualifier})` : city.name;
}
