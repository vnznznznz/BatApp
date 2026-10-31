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
 * Refreshing on focus fetches only the first page and splices it onto what is
 * already loaded, rather than throwing the older pages away - so returning from
 * a letter does not jump the list back to the top. That relies on the list
 * being sorted by the server in the same order every time, which it is.
 *
 * `loadPage` must be stable, as with `useRemote`.
 */
export function usePaged<T extends { id: string }>(
  loadPage: (olderThan?: string) => Promise<T[]>,
  pageSize: number,
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
      try {
        const page = await loadPage();
        if (request !== latest.current) return;

        const last = page.at(-1);
        const anchor =
          last && !restart ? held.current.findIndex((item) => item.id === last.id) : -1;
        // The fresh first page, then whatever was loaded beyond its last item.
        // If that item is not among the older ones, everything has moved on and
        // the older pages are stale: start again from this page.
        const older = anchor >= 0 ? held.current.slice(anchor + 1) : [];
        keep([...page, ...older]);
        if (anchor < 0) setHasMore(page.length >= pageSize);
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
    [keep, loadPage, pageSize],
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
