import { supabase } from '@/lib/supabase';

export type City = {
  id: number;
  name: string;
  countryCode: string;
  population: number;
};

/** Below this, a search would return most of the table for no useful reason. */
export const MIN_QUERY_LENGTH = 2;

/**
 * Normalises a name to the form stored in `cities.search_index`.
 *
 * Folding diacritics means "Zurich" finds Zürich and "Koln" finds Köln, which
 * matters because typing umlauts on a phone keyboard is possible but nobody
 * bothers. Sharp s becomes "ss" before the marks are stripped, since NFD leaves
 * it alone and "Gießen" should be reachable as "giessen".
 *
 * **This must stay identical to `fold()` in `scripts/build-cities.mjs`.** A
 * divergence would not raise an error; search would simply stop finding cities.
 * `search.test.ts` asserts the two agree against a generated fixture.
 */
export function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9 .'-]/g, '');
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
  }));
}

/** "Rösrath, DE" — enough to disambiguate two towns sharing a name. */
export function describeCity(city: Pick<City, 'name' | 'countryCode'>): string {
  return `${city.name}, ${city.countryCode}`;
}
