import fixture from '@/features/cities/fold-parity.fixture.json';
import { cityName, describeCity, fold, MIN_QUERY_LENGTH } from '@/features/cities/search';

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
    expect(fold('Frankfurt a. M.')).toBe('frankfurt a. m.');
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
   * GeoNames writes "Sankt Gallen" and "Saint Paul"; people type "St Gallen",
   * "St. Gallen", "St.Gallen". Each found nothing for one town or another.
   * (Found in review.)
   */
  it('makes st, st., sankt and saint at the start of a word one form', () => {
    for (const spelling of [
      'St Gallen',
      'St. Gallen',
      'St.Gallen',
      'ST. GALLEN',
      'Sankt Gallen',
      'Saint Gallen',
    ]) {
      expect(fold(spelling)).toBe('sankt gallen');
    }
    expect(fold('Saint-Gall')).toBe('sankt-gall');
    expect(fold('St-Louis')).toBe('sankt-louis');
    expect(fold('Rheinfelden St. Peter')).toBe('rheinfelden sankt peter');
  });

  it('leaves alone a word that only begins with those letters', () => {
    expect(fold('Stuttgart')).toBe('stuttgart');
    expect(fold('Saintes')).toBe('saintes');
    expect(fold('Rust')).toBe('rust');
    expect(fold('Ost-Berlin')).toBe('ost-berlin');
  });

  /**
   * Typed so far, "St" may be the start of Stuttgart, and "Saint" of Saintes:
   * at the end of what is typed they are left as they are. A dot ends the
   * word, so "St." is the saint.
   */
  it('leaves st and saint alone at the end, where a longer word may follow', () => {
    expect(fold('St')).toBe('st');
    expect(fold('Saint')).toBe('saint');
    expect(fold('St.')).toBe('sankt');
  });

  /** "Halle (Saale)" and "Biel/Bienne" are how the list itself names them. */
  it('reads brackets, slashes and commas as spaces between words', () => {
    expect(fold('Halle (Saale)')).toBe('halle saale');
    expect(fold('Halle/Saale')).toBe('halle saale');
    expect(fold('Biel/Bienne')).toBe('biel bienne');
    expect(fold('Kempten (Allgäu)')).toBe('kempten allgau');
    expect(fold('Zürich (Kreis 11) / Oerlikon')).toBe('zurich kreis 11 oerlikon');
    expect(fold('Mianzhu, Deyang, Sichuan')).toBe('mianzhu deyang sichuan');
  });

  /** A phone's keyboard may type ’ where the courier pressed '. */
  it('reads a typographic apostrophe as a plain one', () => {
    expect(fold('Ra’s Bayrūt')).toBe("ra's bayrut");
    expect(fold('Val-d’Or')).toBe("val-d'or");
  });

  it('closes up the spaces between words, and around them', () => {
    expect(fold('  Bad   Homburg ')).toBe('bad homburg');
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

  /**
   * The ways of typing a town that the generator's own folding is held to as
   * well: the saints, brackets and slashes, apostrophes. The database's tests
   * look these towns up by what the fixture says they fold to.
   */
  it('folds every spelling in the fixture as the generator does', () => {
    expect(fixture.spellings.length).toBeGreaterThan(10);

    const mismatches = fixture.spellings.filter(([raw, expected]) => fold(raw!) !== expected);

    expect(mismatches).toEqual([]);
  });
});

describe('describeCity', () => {
  it('names the city and its country', () => {
    expect(describeCity({ name: 'Rösrath', countryCode: 'DE' })).toBe('Rösrath, DE');
    expect(describeCity({ name: 'Rösrath', countryCode: 'DE', qualifier: null })).toBe(
      'Rösrath, DE',
    );
  });

  /** Two Friedbergs in Germany: what tells them apart goes beside the name. */
  it('says where a city is that shares its name and country with another', () => {
    expect(describeCity({ name: 'Friedberg', countryCode: 'DE', qualifier: 'near Augsburg' })).toBe(
      'Friedberg (near Augsburg), DE',
    );
  });
});

/**
 * Where a city's name stands without its country - the lists of letters, the
 * flight path, a letter just sent - "Friedberg" alone could be either.
 */
describe('cityName', () => {
  it('is the name alone for a city whose name is its own', () => {
    expect(cityName({ name: 'Rösrath' })).toBe('Rösrath');
    expect(cityName({ name: 'Rösrath', qualifier: null })).toBe('Rösrath');
  });

  it('says where a city is that shares its name and country with another', () => {
    expect(cityName({ name: 'Friedberg', qualifier: 'near Augsburg' })).toBe(
      'Friedberg (near Augsburg)',
    );
  });
});

describe('MIN_QUERY_LENGTH', () => {
  it('is short enough for two-letter cities but not a single letter', () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
  });
});
