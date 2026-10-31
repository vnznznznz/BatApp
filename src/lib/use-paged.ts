import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { messageOf, RpcError } from '@/lib/rpc-error';

export type Paged<T> = {
  items: T[];
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  /** False once a page comes back short: there is nothing older. */
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
};

/**
 * A newest-first list read a page at a time, by keyset: each page is asked for
 * with the id of the last item already held.
 *
 * Refreshing on focus asks again for everything already on screen - up to
 * `maxPageSize`, the most one request may return - so that older entries are as
 * fresh as the newest: a letter opened deep in the list shows as read when the
 * reader comes back, and one deleted since disappears. Returning from a letter
 * therefore neither jumps the list back to the top nor leaves it stale. Beyond
 * `maxPageSize`, the fresh entries are spliced onto the older ones already held,
 * which relies on the server sorting the same way every time, which it does.
 *
 * `loadPage` must be stable, as with `useRemote`.
 */
export function usePaged<T extends { id: string }>(
  loadPage: (olderThan?: string, limit?: number) => Promise<T[]>,
  pageSize: number,
  maxPageSize: number = pageSize,
): Paged<T> {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const latest = useRef(0);
  // Read inside loadMore without making it depend on every change of `items`.
  const held = useRef<T[]>([]);
  const loadingMore = useRef(false);

  const keep = useCallback((next: T[]) => {
    held.current = next;
    setItems(next);
  }, []);

  const loadFirst = useCallback(
    async (visible: boolean, restart = false) => {
      const request = ++latest.current;
      if (visible) setIsRefreshing(true);
      // Everything on screen and a page more, so that letters arriving since
      // push nothing that was showing out of view.
      const want = restart ? pageSize : Math.min(held.current.length + pageSize, maxPageSize);
      try {
        const page = await loadPage(undefined, want);
        if (request !== latest.current) return;

        if (restart || want > held.current.length || page.length < want) {
          // What came back covers everything that was on screen: show it as it
          // is now - opened letters read, deleted ones gone.
          keep(page);
          setHasMore(page.length >= want);
        } else {
          // More is held than one request returns: the fresh entries, then
          // whatever was loaded beyond the last of them. If that one is not
          // among the older entries, everything has moved on and they are
          // stale: start again from what came back.
          const last = page.at(-1);
          const anchor = last ? held.current.findIndex((item) => item.id === last.id) : -1;
          const older = anchor >= 0 ? held.current.slice(anchor + 1) : [];
          keep([...page, ...older]);
          if (anchor < 0) setHasMore(page.length >= want);
        }
        setError(null);
      } catch (caught) {
        if (request !== latest.current) return;
        setError(messageOf(caught));
      } finally {
        if (request === latest.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [keep, loadPage, maxPageSize, pageSize],
  );

  const loadMore = useCallback(async () => {
    const last = held.current.at(-1);
    if (!last || loadingMore.current) return;

    loadingMore.current = true;
    setIsLoadingMore(true);
    const request = latest.current;
    try {
      const page = await loadPage(last.id);
      // A refresh that started meanwhile owns the list now - and so does one
      // that was already running and has since started the list over, which
      // leaves this page following an item that is no longer the last.
      // Appending it then would hide every letter in between.
      if (request !== latest.current || held.current.at(-1)?.id !== last.id) return;
      const seen = new Set(held.current.map((item) => item.id));
      keep([...held.current, ...page.filter((item) => !seen.has(item.id))]);
      setHasMore(page.length >= pageSize);
      // A page arrived, so whatever failed before has recovered.
      setError(null);
    } catch (caught) {
      if (request !== latest.current) return;
      if (caught instanceof RpcError && caught.reason === 'cursor_not_found') {
        // The item this page continued from has gone - its letter was deleted
        // with its sender's account. Nothing can be placed after it, so start
        // the list again from the top rather than stop here for good.
        void loadFirst(false, true);
        return;
      }
      setError(messageOf(caught));
    } finally {
      loadingMore.current = false;
      setIsLoadingMore(false);
    }
  }, [keep, loadFirst, loadPage, pageSize]);

  const refresh = useCallback(() => loadFirst(true), [loadFirst]);

  useFocusEffect(
    useCallback(() => {
      void loadFirst(false);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void loadFirst(false);
      });
      return () => subscription.remove();
    }, [loadFirst]),
  );

  return { items, error, isLoading, isRefreshing, isLoadingMore, hasMore, refresh, loadMore };
}
