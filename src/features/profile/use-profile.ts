import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { RELOCATION_HOURS } from '@/constants/config';
import { useAuth } from '@/features/auth/auth-context';
import { toRpcError } from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';
import { useRetry } from '@/lib/use-retry';

export type ProfileCity = {
  id: number;
  name: string;
  countryCode: string;
  /** Where it is, if another town in the country has its name: "near Augsburg". */
  qualifier?: string | null;
};

/**
 * A move that has not settled yet. A new city takes RELOCATION_HOURS to become
 * where the bats fly from (see the flight migration), so until then letters
 * still leave from `from`.
 */
export type ProfileMove = {
  from: ProfileCity;
  settlesAt: Date;
};

export type Profile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Null until the user has chosen one. No message can be sent without it. */
  city: ProfileCity | null;
  /** Present while a change of city is settling. */
  move: ProfileMove | null;
  /**
   * Whether a letter has gone to or from the courier yet. Until then a move
   * counts at once, as the first city did; from the first letter on it takes
   * RELOCATION_HOURS (see the moves before the first letter migration).
   */
  hasCorresponded?: boolean;
};

/**
 * What a city is saved on condition of. The picker asks before every save,
 * and its question says what the move will be: one that counts at once, or
 * one that takes a day while letters leave from a city it names. A letter, or
 * a move settling, can change that while the question is open, so the answer
 * is saved only while what the question rested on still holds:
 *
 * - `beforeFirstLetter`: no letter has gone to or from the courier yet;
 * - `departing`: the bats leave from this city - its id, or null for nowhere -
 *   when the save arrives.
 */
export type CityCondition = { beforeFirstLetter: true } | { departing: number | null };

/**
 * What saving a city came to: saved, or not - its condition no longer held -
 * with the profile as it is now, to ask again from.
 */
export type CitySave = { saved: true } | { saved: false; profile: Profile };

type CityRow = { id: number; name: string; country_code: string; qualifier: string | null };

type Row = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  city_changed_at: string | null;
  cities: CityRow | null;
  settled: CityRow | null;
  has_corresponded: boolean;
};

// The foreign keys are named because profiles refers to cities twice - the
// city, and while a move settles the one the bats still fly from - and
// PostgREST refuses an embed it cannot attribute to exactly one of them.
const SELECT =
  'id, username, display_name, avatar_url, city_changed_at, has_corresponded, ' +
  'cities!profiles_city_id_fkey(id, name, country_code, qualifier), ' +
  'settled:cities!profiles_settled_city_id_fkey(id, name, country_code, qualifier)';

const GONE =
  'This account no longer exists: it has been deleted or removed. ' +
  'All that is left to do is to sign out.';

const toCity = (row: CityRow): ProfileCity => ({
  id: row.id,
  name: row.name,
  countryCode: row.country_code,
  qualifier: row.qualifier,
});

export function toProfile(row: Row, now: number = Date.now()): Profile {
  const settlesAt = row.city_changed_at
    ? new Date(new Date(row.city_changed_at).getTime() + RELOCATION_HOURS * 3_600_000)
    : null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    city: row.cities ? toCity(row.cities) : null,
    move:
      row.settled && settlesAt && settlesAt.getTime() > now
        ? { from: toCity(row.settled), settlesAt }
        : null,
    hasCorresponded: row.has_corresponded,
  };
}

/**
 * That the bats leave from `departing` - a city's id, or null for nowhere -
 * when a change arrives at `now`, in PostgREST's words for `or`. The row is
 * read as `private.settle_city` reads it: from the city a move is settling
 * away from, while the move is younger than RELOCATION_HOURS, and from the
 * courier's city otherwise. `now` is this device's clock, by which the app
 * says everything it says about a move.
 */
function departingFrom(departing: number | null, now: number): string {
  const dayBefore = new Date(now - RELOCATION_HOURS * 3_600_000).toISOString();
  // No move settling: none made, or the last one a day ago or more.
  const noMove = `settled_city_id.is.null,city_changed_at.is.null,city_changed_at.lte.${dayBefore}`;
  return departing === null
    ? `and(city_id.is.null,or(${noMove}))`
    : `and(settled_city_id.eq.${departing},city_changed_at.gt.${dayBefore}),` +
        `and(city_id.eq.${departing},or(${noMove}))`;
}

/**
 * The signed-in user's own profile.
 *
 * There is deliberately no way to load anybody else's: row level security
 * returns nothing for another user's id, and until friend search exists in
 * Phase 5 there is no route from one user to another.
 *
 * Kept fresh the way `useRemote` keeps its data: loaded when the screen comes
 * into view - the profile screen and the city picker change what the screens
 * under them show - and when the app returns from the background, and loaded
 * again by itself after a load that got no answer (see `useRetry`).
 */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGone, setIsGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identifies the newest request, so a slow answer cannot put back what a
  // newer one has replaced - the old name, after the new one was saved.
  const latest = useRef(0);

  // What the newest answer was: the profile, or null for an account that is
  // gone; undefined until one has come. A save that changed no row reads it
  // after loading again, to tell an account that has gone from one that is
  // still there.
  const shown = useRef<Profile | null | undefined>(undefined);

  // Resolves with whether the load is worth making again unasked: it failed,
  // and it is still the newest.
  const attempt = useCallback(async () => {
    if (!userId) return false;

    // Nothing is set before the first await: this runs from an effect, and a
    // synchronous setState there costs an extra render pass before paint.
    const request = ++latest.current;
    const { data, error: failure } = await supabase
      .from('profiles')
      .select(SELECT)
      .eq('id', userId)
      .maybeSingle<Row>();
    if (request !== latest.current) return false;

    if (failure) {
      setError('Your profile could not be loaded. Check your connection.');
    } else if (data) {
      shown.current = toProfile(data);
      setProfile(shown.current);
      setIsGone(false);
      setError(null);
    } else {
      // The trigger creates a profile alongside the auth user, so no row means
      // the account has gone since: deleted on another device, or removed.
      // This device's sign-in goes on working for up to an hour all the same,
      // and what it showed of the profile is no longer true.
      shown.current = null;
      setProfile(null);
      setIsGone(true);
      setError(GONE);
    }
    setIsLoading(false);
    return failure !== null;
  }, [userId]);
  const run = useRetry(attempt);
  const load = useCallback(() => run(false), [run]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void load();
      });
      return () => subscription.remove();
    }, [load]),
  );

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      if (!userId) return;
      const { error: failure } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', userId);

      // A refusal keeps its words - "this account has been suspended" - as it
      // does from every function of the database. (Found in the merged tree.)
      if (failure) throw toRpcError(failure, 'That name could not be saved.');
      await load();
    },
    [userId, load],
  );

  /**
   * Saves a city - on `condition`, when one is given - and resolves with
   * whether it was saved. The condition is checked by the database in the
   * same statement that saves, so no letter or other change can come between
   * the two; only the end of a settling move's day is told by this device's
   * clock (see `departingFrom`). If the condition no longer held - a letter
   * came or went, or a move settled, between the picker's question and the
   * answer - nothing is saved, and this resolves with the profile as it is
   * now, for the question to be asked again.
   *
   * With nobody signed in, or with the account gone - deleted on another
   * device while the picker asked - there is no row to save to, and that is
   * an error: the picker would ask again about a city it cannot save.
   * (Found in review.)
   */
  const updateCity = useCallback(
    async (cityId: number, condition?: CityCondition): Promise<CitySave> => {
      if (!userId) throw new Error('Your session has ended. Sign in again.');
      // Only the id crosses the wire. The coordinates behind it are the
      // server's, so a client cannot shorten its own flights.
      const change = supabase.from('profiles').update({ city_id: cityId }).eq('id', userId);

      // Answered with the row it changed: a change that reaches no row - a
      // condition that no longer held, an account deleted since - is no
      // error to the database.
      const { data, error: failure } = await (
        !condition
          ? change
          : 'beforeFirstLetter' in condition
            ? change.eq('has_corresponded', false)
            : change.or(departingFrom(condition.departing, Date.now()))
      ).select('id');
      if (failure) throw toRpcError(failure, 'That city could not be saved.');
      await load();
      if ((data ?? []).length > 0) return { saved: true };

      // Loaded again, the row tells which it was.
      if (shown.current === null) throw new Error(GONE);
      if (!condition || !shown.current) throw new Error('That city could not be saved.');
      return { saved: false, profile: shown.current };
    },
    [userId, load],
  );

  return { profile, isLoading, isGone, error, reload: load, updateDisplayName, updateCity };
}
