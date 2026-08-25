import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/lib/supabase';

export type ProfileCity = {
  id: number;
  name: string;
  countryCode: string;
};

export type Profile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Null until the user has chosen one. No message can be sent without it. */
  city: ProfileCity | null;
};

type Row = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  cities: { id: number; name: string; country_code: string } | null;
};

const SELECT = 'id, username, display_name, avatar_url, cities(id, name, country_code)';

function toProfile(row: Row): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    city: row.cities
      ? { id: row.cities.id, name: row.cities.name, countryCode: row.cities.country_code }
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
      setError(null);
    } else {
      // The trigger creates a profile alongside the auth user, so this means the
      // row was removed underneath us rather than never created.
      setError('Your profile is missing. Signing out and in again may recover it.');
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

  return { profile, isLoading, error, reload: load, updateDisplayName, updateCity };
}
