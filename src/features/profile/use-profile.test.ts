import { RELOCATION_HOURS } from '@/constants/config';
import { toProfile } from '@/features/profile/use-profile';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 31, 12, 0);

const row = (overrides: Partial<Parameters<typeof toProfile>[0]> = {}) => ({
  id: 'user-anna',
  username: 'anna',
  display_name: 'Anna',
  avatar_url: null,
  city_changed_at: null,
  cities: { id: 2950159, name: 'Munich', country_code: 'DE' },
  settled: null,
  ...overrides,
});

describe('toProfile', () => {
  it('maps the city the courier chose', () => {
    expect(toProfile(row(), NOW).city).toEqual({
      id: 2950159,
      name: 'Munich',
      countryCode: 'DE',
    });
  });

  it('has no move when no change of city is pending', () => {
    expect(toProfile(row(), NOW).move).toBeNull();
  });

  /** A new city takes RELOCATION_HOURS to become where the bats fly from. */
  it('reports where letters still leave from, and until when, while a move settles', () => {
    const changedAt = new Date(NOW - 2 * HOUR);

    const { move } = toProfile(
      row({
        city_changed_at: changedAt.toISOString(),
        settled: { id: 2950159, name: 'Berlin', country_code: 'DE' },
      }),
      NOW,
    );

    expect(move).toEqual({
      from: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
      settlesAt: new Date(changedAt.getTime() + RELOCATION_HOURS * HOUR),
    });
  });

  it('drops the move once it has settled', () => {
    const { move } = toProfile(
      row({
        city_changed_at: new Date(NOW - (RELOCATION_HOURS + 1) * HOUR).toISOString(),
        settled: { id: 2950159, name: 'Berlin', country_code: 'DE' },
      }),
      NOW,
    );

    expect(move).toBeNull();
  });
});
