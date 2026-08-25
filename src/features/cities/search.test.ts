import fixture from '@/features/cities/fold-parity.fixture.json';
import { describeCity, fold, MIN_QUERY_LENGTH } from '@/features/cities/search';

describe('fold', () => {
  it('lower-cases and strips diacritics', () => {
    expect(fold('Zürich')).toBe('zurich');
    expect(fold('Köln')).toBe('koln');
    expect(fold('Rösrath')).toBe('rosrath');
    expect(fold('Málaga')).toBe('malaga');
  });

  it('expands the sharp s, which NFD leaves alone', () => {
    expect(fold('Gießen')).toBe('giessen');
  });

  it('keeps the punctuation that appears in real place names', () => {
    expect(fold("Val-d'Or")).toBe("val-d'or");
    expect(fold('St. Gallen')).toBe('st. gallen');
  });

  /**
   * The folded query is interpolated into a LIKE pattern server-side. The
   * function refuses wildcards so a query of "%" cannot match every city; the
   * migration re-sanitises regardless, since the client is not trusted.
   */
  it('drops characters that would act as wildcards', () => {
    expect(fold('%')).toBe('');
    expect(fold('a_b')).toBe('ab');
    expect(fold('Wien%')).toBe('wien');
  });

  it('drops non-Latin script rather than mangling it', () => {
    expect(fold('東京')).toBe('');
    expect(fold('Москва')).toBe('');
  });

  /**
   * The single most important test in this file. `cities.search_index` was
   * folded at generation time by scripts/build-cities.mjs; this function folds
   * the query at run time. If they ever disagree, nothing throws — search just
   * quietly stops finding cities.
   */
  it('reproduces exactly what the generator wrote into search_index', () => {
    expect(fixture.pairs.length).toBeGreaterThan(100);

    const mismatches = fixture.pairs.filter(([raw, expected]) => fold(raw!) !== expected);

    expect(mismatches).toEqual([]);
  });
});

describe('describeCity', () => {
  it('names the city and its country', () => {
    expect(describeCity({ name: 'Rösrath', countryCode: 'DE' })).toBe('Rösrath, DE');
  });
});

describe('MIN_QUERY_LENGTH', () => {
  it('is short enough for two-letter cities but not a single letter', () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
  });
});
