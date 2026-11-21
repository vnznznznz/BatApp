import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { RELOCATION_HOURS } from '@/constants/config';
import {
  toProfile,
  useProfile,
  type CityCondition,
  type CitySave,
} from '@/features/profile/use-profile';
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
  cities: { id: 2950159, name: 'Munich', country_code: 'DE', qualifier: null },
  settled: null,
  has_corresponded: true,
  ...overrides,
});

type Answer = { data: Row | null; error: { message: string } | null };

/** Which rows a request is about: the table, and the column and value they are picked by. */
type Asked = { table: string; where: [column: string, value: unknown] };

/** A further condition on the row a change is made to: a column's value, or PostgREST's `or`. */
type Condition = [kind: 'eq', column: string, value: unknown] | [kind: 'or', filters: string];

type Changed = { data: { id: string }[] | null; error: ApiError | null };

/**
 * The database, as far as this hook asks it: one row read, and one row changed.
 * Each is handed what was asked for, so that a test can say whose row it was -
 * a save that names another row changes nothing, and the database calls that
 * no error.
 */
const mockDatabase = {
  read: jest.fn<Promise<Answer>, [asked: Asked & { columns: string }]>(),
  /** A change awaited as it is: answered with whether it failed, and nothing else. */
  change: jest.fn<Promise<{ error: ApiError | null }>, [asked: Asked & { values: object }]>(),
  /**
   * A change asked for the rows it changed: made only where its conditions
   * hold as well, so it can change none at all.
   */
  changeRows: jest.fn<
    Promise<Changed>,
    [asked: Asked & { values: object; conditions: Condition[]; columns: string }]
  >(),
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
        eq: (...where: Asked['where']) => {
          const conditions: Condition[] = [];
          const change = {
            // Awaited as it is, it is a change to the row picked.
            then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
              mockDatabase.change({ table, values, where }).then(resolve, reject),
            eq: (column: string, value: unknown) => {
              conditions.push(['eq', column, value]);
              return change;
            },
            or: (filters: string) => {
              conditions.push(['or', filters]);
              return change;
            },
            select: (columns: string) =>
              mockDatabase.changeRows({ table, values, where, conditions, columns }),
          };
          return change;
        },
      }),
    }),
  },
}));

/** Who is signed in. Anna, unless a test says otherwise; null for nobody. */
const mockSignedIn: { userId: string | null } = { userId: 'user-anna' };

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    session: mockSignedIn.userId ? { user: { id: mockSignedIn.userId } } : null,
  }),
}));

/** The signed-in courier's own row, and no other. */
const ownRow = (userId = 'user-anna'): Asked => ({ table: 'profiles', where: ['id', userId] });

/**
 * What a profile is made of: its own columns and both of its cities, each by
 * the foreign key that says which of the two it is.
 */
const COLUMNS =
  'id, username, display_name, avatar_url, city_changed_at, has_corresponded, ' +
  'cities!profiles_city_id_fkey(id, name, country_code, qualifier), ' +
  'settled:cities!profiles_settled_city_id_fkey(id, name, country_code, qualifier)';

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
const GONE =
  'This account no longer exists: it has been deleted or removed. ' +
  'All that is left to do is to sign out.';

beforeEach(() => {
  mockDatabase.read.mockReset();
  mockDatabase.change.mockReset().mockResolvedValue({ error: null });
  mockDatabase.changeRows
    .mockReset()
    .mockResolvedValue({ data: [{ id: 'user-anna' }], error: null });
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
      qualifier: null,
    });
  });

  /** One of two Friedbergs in Germany, and what tells it apart. */
  it('keeps what tells the city apart from another of its name', () => {
    const { city } = toProfile(
      row({
        cities: {
          id: 2924802,
          name: 'Friedberg',
          country_code: 'DE',
          qualifier: 'near Frankfurt am Main',
        },
      }),
      NOW,
    );

    expect(city).toEqual({
      id: 2924802,
      name: 'Friedberg',
      countryCode: 'DE',
      qualifier: 'near Frankfurt am Main',
    });
  });

  /** Until a letter has gone to or from the courier, a move counts at once. */
  it('says whether a letter has gone to or from the courier yet', () => {
    expect(toProfile(row({ has_corresponded: false }), NOW).hasCorresponded).toBe(false);
    expect(toProfile(row({ has_corresponded: true }), NOW).hasCorresponded).toBe(true);
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
        settled: { id: 2950159, name: 'Berlin', country_code: 'DE', qualifier: null },
      }),
      NOW,
    );

    expect(move).toEqual({
      from: { id: 2950159, name: 'Berlin', countryCode: 'DE', qualifier: null },
      settlesAt: new Date(changedAt.getTime() + RELOCATION_HOURS * HOUR),
    });
  });

  it('drops the move once it has settled', () => {
    const { move } = toProfile(
      row({
        city_changed_at: new Date(NOW - (RELOCATION_HOURS + 1) * HOUR).toISOString(),
        settled: { id: 2950159, name: 'Berlin', country_code: 'DE', qualifier: null },
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
        .mockResolvedValue(
          found({ cities: { id: 2911298, name: 'Hamburg', country_code: 'DE', qualifier: null } }),
        );
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile?.city?.name).toBe('Munich'));

      await act(() => result.current.updateCity(2911298));

      expect(mockDatabase.changeRows.mock.calls).toEqual([
        [{ ...ownRow(), values: { city_id: 2911298 }, conditions: [], columns: 'id' }],
      ]);
      expect(mockDatabase.read).toHaveBeenLastCalledWith({ ...ownRow(), columns: COLUMNS });
      expect(result.current.profile?.city?.name).toBe('Hamburg');
    });

    /**
     * The picker says a move counts at once while no letter has gone to or
     * from the courier. Saved that way, it is saved only while that is so;
     * when a letter came or went in between, nothing is saved, and the hook
     * says so - with the profile as it is now, to ask again from - instead of
     * saving a move that would take a day.
     */
    it.each([
      ['saves it', [{ id: 'user-anna' }], true],
      ['saves nothing, and says so, once a letter has come or gone', [], false],
    ])('asked to save a city before the first letter, %s', async (_, changed, saved) => {
      mockDatabase.read
        .mockResolvedValueOnce(found({ has_corresponded: false }))
        .mockResolvedValue(found({ has_corresponded: !saved }));
      mockDatabase.changeRows.mockResolvedValue({ data: changed, error: null });
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile?.hasCorresponded).toBe(false));

      let answer: CitySave | undefined;
      await act(async () => {
        answer = await result.current.updateCity(2911298, { beforeFirstLetter: true });
      });

      expect(result.current.profile?.hasCorresponded).toBe(!saved);
      expect(answer).toEqual(
        saved ? { saved: true } : { saved: false, profile: result.current.profile },
      );
      expect(mockDatabase.change).not.toHaveBeenCalled();
      expect(mockDatabase.changeRows.mock.calls).toEqual([
        [
          {
            ...ownRow(),
            values: { city_id: 2911298 },
            conditions: [['eq', 'has_corresponded', false]],
            columns: 'id',
          },
        ],
      ]);
      expect(mockDatabase.read).toHaveBeenLastCalledWith({ ...ownRow(), columns: COLUMNS });
    });

    it('says a city saved as it always was is saved', async () => {
      mockDatabase.read.mockResolvedValue(found());
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile).not.toBeNull());

      let answer: CitySave | undefined;
      await act(async () => {
        answer = await result.current.updateCity(2911298);
      });

      expect(answer).toEqual({ saved: true });
      expect(mockDatabase.changeRows.mock.calls[0]?.[0].conditions).toEqual([]);
    });

    /**
     * The picker's question says where the bats leave from: the city a move
     * is settling away from until it has settled, and the courier's city
     * otherwise - "Move back to Friedberg? Your bats are still there, so it
     * counts at once", or "Until 22 Nov 08:41, your letters leave from La
     * Ceiba". A move that settled between the question and the answer made
     * the one take a day and the other leave from another city. (Found in
     * review.) Saved on condition that the bats leave from where the
     * question said, as the server reads it when the save arrives.
     */
    describe('while the bats leave from where the question said', () => {
      /** A day before the save, which comes half a minute after the profile was read. */
      const DAY_BEFORE = '2026-10-30T12:00:30.000Z';
      const NO_MOVE = `settled_city_id.is.null,city_changed_at.is.null,city_changed_at.lte.${DAY_BEFORE}`;

      beforeEach(() => {
        jest.useFakeTimers({ now: NOW });
      });

      it.each([
        [
          'a city',
          2950159,
          `and(settled_city_id.eq.2950159,city_changed_at.gt.${DAY_BEFORE}),` +
            `and(city_id.eq.2950159,or(${NO_MOVE}))`,
        ],
        ['nowhere', null, `and(city_id.is.null,or(${NO_MOVE}))`],
      ])(
        'saves a move only while they leave from %s, at the moment it is saved',
        async (_, departing, filter) => {
          mockDatabase.read.mockResolvedValue(found());
          const { result } = await renderHook(() => useProfile());
          await passes(0);
          jest.setSystemTime(NOW + 30 * SECOND);

          let answer: CitySave | undefined;
          await act(async () => {
            answer = await result.current.updateCity(2911298, { departing });
          });

          expect(answer).toEqual({ saved: true });
          expect(mockDatabase.changeRows.mock.calls).toEqual([
            [
              {
                ...ownRow(),
                values: { city_id: 2911298 },
                conditions: [['or', filter]],
                columns: 'id',
              },
            ],
          ]);
        },
      );

      it('saves nothing once they leave from elsewhere, and answers with the profile as it is', async () => {
        const berlin = { id: 2950159, name: 'Berlin', country_code: 'DE', qualifier: null };
        // Read an hour before the move settles; saved an hour after.
        mockDatabase.read.mockResolvedValue(
          found({ settled: berlin, city_changed_at: new Date(NOW - 23 * HOUR).toISOString() }),
        );
        mockDatabase.changeRows.mockResolvedValue({ data: [], error: null });
        const { result } = await renderHook(() => useProfile());
        await passes(0);
        expect(result.current.profile?.move?.from.name).toBe('Berlin');
        jest.setSystemTime(NOW + 2 * HOUR);

        let answer: CitySave | undefined;
        await act(async () => {
          answer = await result.current.updateCity(2950159, { departing: 2950159 });
        });

        expect(answer).toEqual({ saved: false, profile: result.current.profile });
        expect(result.current.profile?.move).toBeNull();
      });
    });

    /**
     * An account deleted on another device goes on signing this one in for up
     * to an hour, and a save to it changes no row: the database calls that no
     * error. Taken for a letter that came in between, the picker told a
     * courier who never had one that a letter had gone to or from them, and
     * a save without a condition said it had saved. (Found in review.)
     */
    it.each<[string, CityCondition | undefined]>([
      ['a city', undefined],
      ['a city before the first letter', { beforeFirstLetter: true }],
      ['a city while the bats leave from Munich', { departing: 2867714 }],
    ])('says the account is gone when %s is saved to an account deleted since', async (_, how) => {
      mockDatabase.read
        .mockResolvedValueOnce(found({ has_corresponded: false }))
        .mockResolvedValue(notThere);
      mockDatabase.changeRows.mockResolvedValue({ data: [], error: null });
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile).not.toBeNull());

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.updateCity(2911298, how).then(
          (saved) => ({ saved }),
          (error: unknown) => error,
        );
      });

      expect(outcome).toEqual(new Error(GONE));
      expect(result.current.isGone).toBe(true);
    });

    /** A save that changed nothing has not saved, whatever else is true. */
    it('does not say a city is saved when the save changed no row of an account still there', async () => {
      mockDatabase.read.mockResolvedValue(found());
      mockDatabase.changeRows.mockResolvedValue({ data: [], error: null });
      const { result } = await renderHook(() => useProfile());
      await waitFor(() => expect(result.current.profile).not.toBeNull());

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.updateCity(2911298).then(
          (saved) => ({ saved }),
          (error: unknown) => error,
        );
      });

      expect(outcome).toEqual(new Error('That city could not be saved.'));
    });

    /**
     * With nobody signed in - signed out, or the session ran out while the
     * picker was open - there is no row to save to. That has to be an error:
     * the picker takes "not saved" for a letter that came in between, and
     * told the courier so. (Found in review.)
     */
    it.each<[string, CityCondition | undefined]>([
      ['a city', undefined],
      ['a city before the first letter', { beforeFirstLetter: true }],
    ])('says the session has ended when asked to save %s with nobody signed in', async (_, how) => {
      mockSignedIn.userId = null;
      const { result } = await renderHook(() => useProfile());

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.updateCity(2911298, how).then(
          (saved) => ({ saved }),
          (error: unknown) => error,
        );
      });

      expect(outcome).toEqual(new Error('Your session has ended. Sign in again.'));
      expect(mockDatabase.change).not.toHaveBeenCalled();
      expect(mockDatabase.changeRows).not.toHaveBeenCalled();
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
      ]);
      expect(mockDatabase.changeRows.mock.calls).toEqual([
        [{ ...ownRow('user-ben'), values: { city_id: 2911298 }, conditions: [], columns: 'id' }],
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
      // Neither a refusal with a reason nor a lost connection: the words the
      // save falls back on. (A lost connection has words of its own.)
      const refused = { message: 'internal error', code: 'XX000', hint: null };
      mockDatabase.read.mockResolvedValue(found());
      mockDatabase.change.mockResolvedValue({ error: refused });
      mockDatabase.changeRows.mockResolvedValue({ data: null, error: refused });
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
      const refusal = {
        message: 'this account is suspended',
        code: 'P0001',
        hint: 'account_suspended',
      };
      // A name is saved as it is; a city asks for the row it changed.
      mockDatabase.change.mockResolvedValue({ error: refusal });
      mockDatabase.changeRows.mockResolvedValue({ data: null, error: refusal });
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
