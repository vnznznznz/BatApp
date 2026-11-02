import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { messageOf, RpcError, type RefusalReason } from '@/lib/rpc-error';

export type Remote<T> = {
  /** The last successful result. Kept through a failed reload, so a screen does not blank. */
  data: T | null;
  error: string | null;
  /**
   * Why the latest fetch was refused, when the server said - `message_not_found`
   * for a letter that has gone, or been hidden by a block, since it was loaded.
   * Null after a success, and for failures that were not refusals.
   */
  reason: RefusalReason | null;
  /** True until the first load settles, either way. */
  isLoading: boolean;
  /** True while a refresh the user asked for is running - for pull-to-refresh. */
  isRefreshing: boolean;
  /**
   * When the latest fetch finished, successfully or not. Changes on every fetch
   * even when the data does not, so an effect can react to "the server answered
   * again" - see `useRefreshAt`.
   */
  settledAt: number;
  /** Fetches again without showing a spinner. */
  reload: () => Promise<void>;
  /** Fetches again, showing that it is doing so. */
  refresh: () => Promise<void>;
};

/**
 * Server data for one screen, kept fresh while the screen is in front of the
 * user.
 *
 * Loads when the screen gains focus - including the first time - and again
 * whenever the app returns from the background, because that is exactly when
 * a bat may have landed. `load` must be stable (a module-level function, or
 * one wrapped in `useCallback`), or this reloads on every render.
 *
 * Deliberately small. If screens ever need shared caching, deduplication or
 * optimistic updates, replace this with a query library rather than growing it.
 */
export function useRemote<T>(load: () => Promise<T>): Remote<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<RefusalReason | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settledAt, setSettledAt] = useState(0);

  // Identifies the newest request, so a slow response cannot overwrite a newer one.
  const latest = useRef(0);

  const run = useCallback(
    async (visible: boolean) => {
      const request = ++latest.current;
      if (visible) setIsRefreshing(true);
      try {
        const next = await load();
        if (request !== latest.current) return;
        setData(next);
        setError(null);
        setReason(null);
      } catch (caught) {
        if (request !== latest.current) return;
        setError(messageOf(caught));
        setReason(caught instanceof RpcError ? caught.reason : null);
      } finally {
        if (request === latest.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          setSettledAt(Date.now());
        }
      }
    },
    [load],
  );

  const reload = useCallback(() => run(false), [run]);
  const refresh = useCallback(() => run(true), [run]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void reload();
      });
      return () => subscription.remove();
    }, [reload]),
  );

  return { data, error, reason, isLoading, isRefreshing, settledAt, reload, refresh };
}
