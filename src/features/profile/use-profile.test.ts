import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { RELOCATION_HOURS } from '@/constants/config';
import { toProfile, useProfile } from '@/features/profile/use-profile';
import { REFUSALS, RpcError, type ApiError } from '@/lib/rpc-error';

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

/** Which rows a request is about: the table, and the column and value they are picked by. */
type Asked = { table: string; where: [column: string, value: unknown] };

/**
 * The database, as far as this hook asks it: one row read, and one row changed.
 * Each is handed what was asked for, so that a test can say whose row it was -
 * a save that names another row changes nothing, and the database calls that
 * no error.
 */
const mockDatabase = {
  read: jest.fn<Promise<Answer>, [asked: Asked & { columns: string }]>(),
  change: jest.fn<Promise<{ error: ApiError | null }>, [asked: Asked & { values: object }]>(),
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    // Asked to say when the session is renewed: a load that got no answer is
    // made again then (src/lib/renewal.ts).
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (...where: Asked['where']) => ({
          maybeSingle: () => mockDatabase.read({ table, columns, where }),
        }),
      }),
      update: (values: object) => ({
        eq: (...where: Asked['where']) => mockDatabase.change({ table, values, where }),
      }),
    }),
  },
}));

/** Who is signed in. Anna, unless a test says otherwise. */
const mockSignedIn = { userId: 'user-anna' };

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: mockSignedIn.userId } } }),
}));

/** The signed-in courier's own row, and no other. */
const ownRow = (userId = 'user-anna'): Asked => ({ table: 'profiles', where: ['id', userId] });

/**
 * What a profile is made of: its own columns and both of its cities, each by
 * the foreign key that says which of the two it is.
 */
const COLUMNS =
  'id, username, display_name, avatar_url, city_changed_at, ' +
  'cities!profiles_city_id_fkey(id, name, country_code), ' +
  'settled:cities!profiles_settled_city_id_fkey(id, name, country_code)';

/**
 * Stands in for navigation focus: an effect that runs while the screen is in
 * front and is cleaned up when another covers it. A screen starts in front;
 * `screenIs` moves it.
 */
const mockScreen = { inFront: true, watchers: new Set<(inFront: boolean) => void>() };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      const [inFront, setInFront] = React.useState(mockScreen.inFront);
      React.useEffect(() => {
        mockScreen.watchers.add(setInFront);
        return () => {
          mockScreen.watchers.delete(setInFront);
        };
      }, []);
      React.useEffect(() => (inFront ? effect() : undefined), [effect, inFront]);
    },
  };
});

async function screenIs(where: 'in front' | 'covered') {
  mockScreen.inFront = where === 'in front';
  await act(async () => mockScreen.watchers.forEach((watch) => watch(mockScreen.inFront)));
}

/** The app moving between foreground and background, as React Native reports it. */
const appStateListeners = new Set<(state: AppStateStatus) => void>();

async function appBecomes(state: AppStateStatus) {
  await act(async () => appStateListeners.forEach((listener) => listener(state)));
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Lets time pass, with every load that is due in it. */
const passes = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

const found = (overrides: Partial<Row> = {}): Answer => ({ data: row(overrides), error: null });
const notThere: Answer = { data: null, error: null };
const failed: Answer = { data: null, error: { message: 'TypeError: Network request failed' } };

const COULD_NOT_LOAD = 'Your profile could not be loaded. Check your connection.';

beforeEach(() => {
  mockDatabase.read.mockReset();
  mockDatabase.change.mockReset().mockResolvedValue({ error: null });
  mockSignedIn.userId = 'user-anna';
  mockScreen.inFront = true;
  jest.mocked(AppState.addEventListener).mockImplementation((_type, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  jest.useRealTimers();
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
    expect(mockDatabase.read.mock.calls).toEqual([[{ ...ownRow(), columns: COLUMNS }]]);
  });

  it('asks for the row of the courier who is signed in, whoever that is', async () => {
    mockSignedIn.userId = 'user-ben';
    mockDatabase.read.mockResolvedValue(found({ id: 'user-ben', username: 'ben' }));

    const { result } = await renderHook(() => useProfile());

    await waitFor(() => expect(result.current.profile?.username).toBe('ben'));
    expect(mockDatabase.read.mock.calls).toEqual([[{ ...ownRow('user-ben'), columns: COLUMNS }]]);
  });

  it('says when the profile could not be loaded', async () => {
    mockDatabase.read.mockResolvedValue(failed);

    const { result } = await renderHook(() => useProfile());

    await waitFor(() => expect(result.current.error).toBe(COULD_NOT_LOAD));
    expect(result.current.profile).toBeNull();
    expect(result.current.isGone).toBe(false);
  });

  /**
   * The profile was loaded once, when a screen was first shown. If that one
   * request failed, the roost kept "Your profile could not be loaded" and a
   * disabled "Write a letter" over bats that had long loaded, and compose kept
   * its letter unsendable, until the courier left the screen.
   */
  describe('after a load that got no answer', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('asks again by itself until there is one', async () => {
      mockDatabase.read
        .mockResolvedValueOnce(failed)
        .mockResolvedValueOnce(failed)
        .mockResolvedValue(found());
      const { result } = await renderHook(() => useProfile());
      await passes(0);
      expect(result.current.error).toBe(COULD_NOT_LOAD);
      expect(result.current.isLoading).toBe(false);

      await passes(2 * SECOND);
      expect(mockDatabase.read).toHaveBeenCalledTimes(2);

      await passes(4 * SECOND);

      expect(mockDatabase.read).toHaveBeenCalledTimes(3);
      expect(result.current.profile?.username).toBe('anna');
      expect(result.current.error).toBeNull();
    });

    it('stops asking once another screen covers this one', async () => {
      mockDatabase.read.mockResolvedValue(failed);
      await renderHook(() => useProfile());
      await passes(0);
      expect(mockDatabase.read).toHaveBeenCalledTimes(1);

      await screenIs('covered');
      await passes(10 * MINUTE);

      expect(mockDatabase.read).toHaveBeenCalledTimes(1);
    });

    it('asks nothing more once the screen is gone', async () => {
      mockDatabase.read.mockResolvedValue(failed);
      const { unmount } = await renderHook(() => useProfile());
      await passes(0);

      await unmount();
      await passes(10 * MINUTE);

      expect(mockDatabase.read).toHaveBeenCalledTimes(1);
      expect(appStateListeners.size).toBe(0);
    });

    /** An account that is gone has been answered for, as has one that is there. */
    it('does not ask again once the server has answered', async () => {
      mockDatabase.read.mockResolvedValueOnce(failed).mockResolvedValue(notThere);
      const { result } = await renderHook(() => useProfile());
      await passes(2 * SECOND);
      expect(result.current.isGone).toBe(true);

      await passes(10 * MINUTE);

      expect(mockDatabase.read).toHaveBeenCalledTimes(2);
    });
  });

  describe('coming back', () => {
    /**
     * The profile screen and the city picker change what the screens under
     * them show, and the picker pops back without a word to anyone.
     */
    it('loads again when the screen comes back into view', async () => {
      mockDatabase.read
        .mockResolvedValueOnce(found())
        .mockResolvedValue(found({ display_name: 'Anna B.' }));
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile?.displayName).toBe('Anna'));

      await screenIs('covered');
      expect(mockDatabase.read).toHaveBeenCalledTimes(1);
      await screenIs('in front');

      await waitFor(() => expect(result.current.profile?.displayName).toBe('Anna B.'));
      expect(mockDatabase.read).toHaveBeenCalledTimes(2);
    });

    it('loads again when the app returns from the background', async () => {
      mockDatabase.read.mockResolvedValueOnce(failed).mockResolvedValue(found());
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.error).toBe(COULD_NOT_LOAD));

      await appBecomes('background');
      expect(mockDatabase.read).toHaveBeenCalledTimes(1);
      await appBecomes('active');

      await waitFor(() => expect(result.current.profile?.username).toBe('anna'));
      expect(mockDatabase.read).toHaveBeenCalledTimes(2);
    });
  });

  describe('saving', () => {
    it('saves a name without the spaces around it, and reads the profile back', async () => {
      mockDatabase.read
        .mockResolvedValueOnce(found())
        .mockResolvedValue(found({ display_name: 'Anna B.' }));
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile?.displayName).toBe('Anna'));

      await act(() => result.current.updateDisplayName('  Anna B. '));

      // Their own row and no other: a save that names another row changes
      // nothing, and comes back without an error all the same.
      expect(mockDatabase.change.mock.calls).toEqual([
        [{ ...ownRow(), values: { display_name: 'Anna B.' } }],
      ]);
      expect(mockDatabase.read).toHaveBeenLastCalledWith({ ...ownRow(), columns: COLUMNS });
      expect(result.current.profile?.displayName).toBe('Anna B.');
    });

    it('saves a city by its id alone, and reads the profile back', async () => {
      mockDatabase.read
        .mockResolvedValueOnce(found())
        .mockResolvedValue(found({ cities: { id: 2911298, name: 'Hamburg', country_code: 'DE' } }));
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile?.city?.name).toBe('Munich'));

      await act(() => result.current.updateCity(2911298));

      expect(mockDatabase.change.mock.calls).toEqual([
        [{ ...ownRow(), values: { city_id: 2911298 } }],
      ]);
      expect(mockDatabase.read).toHaveBeenLastCalledWith({ ...ownRow(), columns: COLUMNS });
      expect(result.current.profile?.city?.name).toBe('Hamburg');
    });

    it('saves to the row of the courier who is signed in, whoever that is', async () => {
      mockSignedIn.userId = 'user-ben';
      mockDatabase.read.mockResolvedValue(found({ id: 'user-ben', username: 'ben' }));
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile?.username).toBe('ben'));

      await act(() => result.current.updateDisplayName('Ben'));
      await act(() => result.current.updateCity(2911298));

      expect(mockDatabase.change.mock.calls).toEqual([
        [{ ...ownRow('user-ben'), values: { display_name: 'Ben' } }],
        [{ ...ownRow('user-ben'), values: { city_id: 2911298 } }],
      ]);
    });

    it.each([
      [
        'a name',
        () => (hook: ReturnType<typeof useProfile>) => hook.updateDisplayName('Anna B.'),
        'That name could not be saved.',
      ],
      [
        'a city',
        () => (hook: ReturnType<typeof useProfile>) => hook.updateCity(2911298),
        'That city could not be saved.',
      ],
    ])('says so when %s could not be saved, and keeps what it had', async (_, save, words) => {
      mockDatabase.read.mockResolvedValue(found());
      mockDatabase.change.mockResolvedValue({
        error: { message: 'internal error', code: 'XX000', hint: null },
      });
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile?.displayName).toBe('Anna'));

      let failure: unknown;
      await act(async () => {
        failure = await save()(result.current).catch((error: unknown) => error);
      });

      expect(failure).toEqual(new Error(words));
      expect(mockDatabase.read).toHaveBeenCalledTimes(1);
      expect(result.current.profile?.displayName).toBe('Anna');
    });

    /**
     * A refusal has words of its own, as it has from every other function of
     * the database. The profile's were dropped: a suspended courier saving a
     * name or a city read "could not be saved". (Found in the merged tree:
     * PATCH /rest/v1/profiles answers 400, P0001, hint account_suspended.)
     */
    it.each([
      ['a name', (hook: ReturnType<typeof useProfile>) => hook.updateDisplayName('Anna B.')],
      ['a city', (hook: ReturnType<typeof useProfile>) => hook.updateCity(2911298)],
    ])('says why when saving %s was refused', async (_, save) => {
      mockDatabase.read.mockResolvedValue(found());
      mockDatabase.change.mockResolvedValue({
        error: { message: 'this account is suspended', code: 'P0001', hint: 'account_suspended' },
      });
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile?.displayName).toBe('Anna'));

      let failure: unknown;
      await act(async () => {
        failure = await save(result.current).catch((error: unknown) => error);
      });

      expect(failure).toBeInstanceOf(RpcError);
      expect(failure).toMatchObject({
        message: REFUSALS.account_suspended,
        reason: 'account_suspended',
      });
    });

    it('says that there is no connection when the save got no answer', async () => {
      mockDatabase.read.mockResolvedValue(found());
      mockDatabase.change.mockResolvedValue({
        error: { message: 'TypeError: Network request failed' },
      });
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile?.displayName).toBe('Anna'));

      let failure: unknown;
      await act(async () => {
        failure = await result.current
          .updateDisplayName('Anna B.')
          .catch((error: unknown) => error);
      });

      expect(failure).toEqual(new Error('No connection. Check your network and try again.'));
    });

    /**
     * A load that was under way when the name was saved comes back with the
     * old name. Arriving after the one that read the new name back, it used to
     * put the old one on screen again, under "Saved."
     */
    it('does not let a slow earlier answer put the old name back after a save', async () => {
      let arriveLate: (answer: Answer) => void = () => {};
      mockDatabase.read
        .mockReturnValueOnce(new Promise<Answer>((resolve) => (arriveLate = resolve)))
        .mockResolvedValue(found({ display_name: 'Anna B.' }));
      const { result } = await renderHook(() => useProfile());

      await act(() => result.current.updateDisplayName('Anna B.'));
      expect(result.current.profile?.displayName).toBe('Anna B.');

      await act(async () => arriveLate(found({ display_name: 'Anna' })));

      expect(result.current.profile?.displayName).toBe('Anna B.');
    });
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
