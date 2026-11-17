import { useCallback, useEffect, useState } from 'react';

import { RELOCATION_HOURS } from '@/constants/config';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/lib/supabase';

export type ProfileCity = {
  id: number;
  name: string;
  countryCode: string;
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
};

type CityRow = { id: number; name: string; country_code: string };

type Row = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  city_changed_at: string | null;
  cities: CityRow | null;
  settled: CityRow | null;
};

// The foreign keys are named because profiles refers to cities twice - the
// city, and while a move settles the one the bats still fly from - and
// PostgREST refuses an embed it cannot attribute to exactly one of them.
const SELECT =
  'id, username, display_name, avatar_url, city_changed_at, ' +
  'cities!profiles_city_id_fkey(id, name, country_code), ' +
  'settled:cities!profiles_settled_city_id_fkey(id, name, country_code)';

const toCity = (row: CityRow): ProfileCity => ({
  id: row.id,
  name: row.name,
  countryCode: row.country_code,
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
  };
}

/**
 * The signed-in user's own profile.
 *
 * There is deliberately no way to load anybody else's: row level security
 * returns nothing for another user's id, and until friend search exists in
 * Phase 5 there is no route from one user to another.
 */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGone, setIsGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;

    // Nothing is set before the first await: this runs from an effect, and a
    // synchronous setState there costs an extra render pass before paint.
    const { data, error: failure } = await supabase
      .from('profiles')
      .select(SELECT)
      .eq('id', userId)
      .maybeSingle<Row>();

    if (failure) {
      setError('Your profile could not be loaded. Check your connection.');
    } else if (data) {
      setProfile(toProfile(data));
      setIsGone(false);
      setError(null);
    } else {
      // The trigger creates a profile alongside the auth user, so no row means
      // the account has gone since: deleted on another device, or removed.
      // This device's sign-in goes on working for up to an hour all the same,
      // and what it showed of the profile is no longer true.
      setProfile(null);
      setIsGone(true);
      setError(
        'This account no longer exists: it has been deleted or removed. ' +
          'All that is left to do is to sign out.',
      );
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    // `load` sets state only after awaiting the query, so nothing is updated
    // synchronously here and React batches the updates that follow into a single
    // pass. The rule cannot see through the async boundary to establish that.
    // If this hook ever grows real caching needs, replace the pattern with a
    // query library rather than widening this exemption.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

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

  const updateCity = useCallback(
    async (cityId: number) => {
      if (!userId) return;
      // Only the id crosses the wire. The coordinates behind it are the
      // server's, so a client cannot shorten its own flights.
      const { error: failure } = await supabase
        .from('profiles')
        .update({ city_id: cityId })
        .eq('id', userId);

      if (failure) throw new Error('That city could not be saved.');
      await load();
    },
    [userId, load],
  );

  return { profile, isLoading, isGone, error, reload: load, updateDisplayName, updateCity };
}
