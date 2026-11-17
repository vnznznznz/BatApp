import { act, renderHook, waitFor } from '@testing-library/react-native';

import { RELOCATION_HOURS } from '@/constants/config';
import { toProfile, useProfile } from '@/features/profile/use-profile';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 31, 12, 0);

type Row = Parameters<typeof toProfile>[0];

const row = (overrides: Partial<Row> = {}): Row => ({
  id: 'user-anna',
  username: 'anna',
  display_name: 'Anna',
  avatar_url: null,
  city_changed_at: null,
  cities: { id: 2950159, name: 'Munich', country_code: 'DE' },
  settled: null,
  ...overrides,
});

type Answer = { data: Row | null; error: { message: string } | null };

/** The database, as far as this hook asks it: one row read, and one row changed. */
const mockDatabase = {
  read: jest.fn<Promise<Answer>, []>(),
  change: jest.fn<Promise<{ error: { message: string } | null }>, [values: object]>(),
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => mockDatabase.read() }) }),
      update: (values: object) => ({ eq: () => mockDatabase.change(values) }),
    }),
  },
}));

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'user-anna' } } }),
}));

const found = (overrides: Partial<Row> = {}): Answer => ({ data: row(overrides), error: null });
const notThere: Answer = { data: null, error: null };
const failed: Answer = { data: null, error: { message: 'TypeError: Network request failed' } };

const COULD_NOT_LOAD = 'Your profile could not be loaded. Check your connection.';

beforeEach(() => {
  mockDatabase.read.mockReset();
  mockDatabase.change.mockReset().mockResolvedValue({ error: null });
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

describe('useProfile', () => {
  it('loads the profile of whoever is signed in', async () => {
    let arrive: (answer: Answer) => void = () => {};
    mockDatabase.read.mockReturnValue(new Promise<Answer>((resolve) => (arrive = resolve)));

    const { result } = await renderHook(() => useProfile());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.profile).toBeNull();

    await act(async () => arrive(found()));

    expect(result.current.profile?.username).toBe('anna');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isGone).toBe(false);
  });

  it('says when the profile could not be loaded', async () => {
    mockDatabase.read.mockResolvedValue(failed);

    const { result } = await renderHook(() => useProfile());

    await waitFor(() => expect(result.current.error).toBe(COULD_NOT_LOAD));
    expect(result.current.profile).toBeNull();
    expect(result.current.isGone).toBe(false);
  });

  /**
   * A profile is made with its account, so a courier who is signed in and has
   * none has lost the account since: deleted on another device, or removed.
   * This device's sign-in goes on working for up to an hour, and the app used
   * to advise signing out and in again, which cannot bring anything back.
   */
  describe('when the account has gone', () => {
    const GONE =
      'This account no longer exists: it has been deleted or removed. ' +
      'All that is left to do is to sign out.';

    it('says that the account no longer exists', async () => {
      mockDatabase.read.mockResolvedValue(notThere);

      const { result } = await renderHook(() => useProfile());

      await waitFor(() => expect(result.current.isGone).toBe(true));
      expect(result.current.error).toBe(GONE);
      expect(result.current.profile).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('lets go of the profile it was showing', async () => {
      mockDatabase.read.mockResolvedValueOnce(found()).mockResolvedValue(notThere);
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile?.username).toBe('anna'));

      await act(() => result.current.reload());

      expect(result.current.isGone).toBe(true);
      expect(result.current.profile).toBeNull();
      expect(result.current.error).toBe(GONE);
    });

    it('takes it back when the profile is there after all', async () => {
      mockDatabase.read.mockResolvedValueOnce(notThere).mockResolvedValue(found());
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.isGone).toBe(true));

      await act(() => result.current.reload());

      expect(result.current.isGone).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.profile?.username).toBe('anna');
    });

    it('does not take a load that failed for the account being gone, nor forget that it is', async () => {
      mockDatabase.read.mockResolvedValueOnce(notThere).mockResolvedValue(failed);
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.isGone).toBe(true));

      await act(() => result.current.reload());

      expect(result.current.error).toBe(COULD_NOT_LOAD);
      expect(result.current.isGone).toBe(true);
    });
  });
});
