import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { RELOCATION_HOURS } from '@/constants/config';
import { useAuth } from '@/features/auth/auth-context';
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

      if (failure) throw new Error('That name could not be saved.');
      await load();
    },
    [userId, load],
  );

  /**
   * Saves a city, and resolves with whether it was saved. `beforeFirstLetter`
   * saves it only while no letter has gone to or from the courier: the picker
   * says such a move counts at once, which is so only until then, and a letter
   * can come or go between its question and the answer. If one did, nothing
   * is saved and this resolves with false.
   *
   * With nobody signed in, or with the account gone - deleted on another
   * device while the picker asked - there is no row to save to, and that is
   * an error, not a false: the picker takes false for a letter that came in
   * between. (Found in review.)
   */
  const updateCity = useCallback(
    async (cityId: number, { beforeFirstLetter = false }: { beforeFirstLetter?: boolean } = {}) => {
      if (!userId) throw new Error('Your session has ended. Sign in again.');
      // Only the id crosses the wire. The coordinates behind it are the
      // server's, so a client cannot shorten its own flights.
      const change = supabase.from('profiles').update({ city_id: cityId }).eq('id', userId);

      // Answered with the row it changed: a change that reaches no row - an
      // account deleted since, a letter in between - is no error to the
      // database.
      const { data, error: failure } = await (
        beforeFirstLetter ? change.eq('has_corresponded', false) : change
      ).select('id');
      if (failure) throw new Error('That city could not be saved.');
      await load();
      if ((data ?? []).length > 0) return true;

      // Loaded again, the row tells which it was.
      if (shown.current === null) throw new Error(GONE);
      if (!beforeFirstLetter) throw new Error('That city could not be saved.');
      return false;
    },
    [userId, load],
  );

  return { profile, isLoading, isGone, error, reload: load, updateDisplayName, updateCity };
}
