import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { REFUSALS, RpcError } from '@/lib/rpc-error';
import { usePaged } from '@/lib/use-paged';

/**
 * Stands in for navigation focus. `useFocusEffect` runs its effect whenever the
 * screen gains focus and cleans it up when the screen loses it. Here the first
 * focus is the mount, and `returnToScreen()` is leaving the list for a letter
 * and coming back to it.
 */
const mockScreen = { visits: new Set<() => void>() };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      const [visit, setVisit] = React.useState(0);
      React.useEffect(() => {
        const comeBack = () => setVisit((count) => count + 1);
        mockScreen.visits.add(comeBack);
        return () => {
          mockScreen.visits.delete(comeBack);
        };
      }, []);
      React.useEffect(() => effect(), [effect, visit]);
    },
  };
});

async function returnToScreen() {
  await act(() => mockScreen.visits.forEach((comeBack) => comeBack()));
}

/** The app moving between foreground and background, as React Native reports it. */
const appStateListeners = new Set<(state: AppStateStatus) => void>();

async function appBecomes(state: AppStateStatus) {
  await act(() => appStateListeners.forEach((listener) => listener(state)));
}

type Item = { id: string };

/** A small page keeps the fixtures readable; the hook takes any size. */
const PAGE = 3;

const page = (...ids: string[]): Item[] => ids.map((id) => ({ id }));
const idsOf = (items: readonly Item[]) => items.map((item) => item.id);

/** A `loadPage` that answers each call with the next of `answers`, in order. */
function pages(...answers: (Item[] | Error | Promise<Item[]>)[]) {
  const loadPage = jest.fn<Promise<Item[]>, [olderThan?: string]>();
  for (const answer of answers) {
    loadPage.mockImplementationOnce(() =>
      answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
    );
  }
  return loadPage;
}

/** A page that arrives only when the test says so. */
function later() {
  let resolve: (items: Item[]) => void = () => {};
  const promise = new Promise<Item[]>((settle) => {
    resolve = settle;
  });
  return { promise, arrive: (items: Item[]) => act(async () => resolve(items)) };
}

/** Lets every response that has already arrived run to completion. */
const settle = () => act(() => new Promise<void>((done) => setTimeout(done, 0)));

async function renderList(loadPage: (olderThan?: string) => Promise<Item[]>) {
  const hook = await renderHook(() => usePaged(loadPage, PAGE));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

beforeEach(() => {
  jest.mocked(AppState.addEventListener).mockImplementation((_type, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePaged', () => {
  describe('the first page', () => {
    it('loads when the list is first shown', async () => {
      const loadPage = pages(page('a', 'b', 'c'));

      const { result } = await renderList(loadPage);

      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c']);
      expect(loadPage).toHaveBeenCalledTimes(1);
      expect(loadPage).toHaveBeenCalledWith(undefined, PAGE);
      expect(result.current.error).toBeNull();
    });

    it('is loading, without a refresh spinner, until the page arrives', async () => {
      const first = later();
      const loadPage = pages(first.promise);
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.items).toEqual([]);

      await first.arrive(page('a'));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(idsOf(result.current.items)).toEqual(['a']);
    });

    it('expects more after a full page', async () => {
      const { result } = await renderList(pages(page('a', 'b', 'c')));

      expect(result.current.hasMore).toBe(true);
    });

    it('knows there is nothing older when the first page is already short', async () => {
      const { result } = await renderList(pages(page('a', 'b')));

      expect(result.current.hasMore).toBe(false);
    });

    it('reports a failed first load, and stops loading', async () => {
      const { result } = await renderList(
        pages(new Error('Your letters could not be loaded. Check your connection.')),
      );

      expect(result.current.error).toBe('Your letters could not be loaded. Check your connection.');
      expect(result.current.items).toEqual([]);
    });
  });

  describe('why the first page was refused', () => {
    it('is the refusal, as the server gave it', async () => {
      const { result } = await renderList(
        pages(new RpcError(REFUSALS.account_suspended, 'account_suspended')),
      );

      expect(result.current.reason).toBe('account_suspended');
    });

    /** "Null after a success": a reason left over would outlast what it explained. */
    it('is gone once a load goes through', async () => {
      const { result } = await renderList(
        pages(new RpcError(REFUSALS.account_suspended, 'account_suspended'), page('a')),
      );

      await act(() => result.current.refresh());

      expect(result.current.error).toBeNull();
      expect(result.current.reason).toBeNull();
    });
  });

  describe('loading more', () => {
    it('asks for the page after the last item held, and adds it below', async () => {
      const loadPage = pages(page('a', 'b', 'c'), page('d', 'e', 'f'));
      const { result } = await renderList(loadPage);

      await act(() => result.current.loadMore());

      expect(loadPage).toHaveBeenLastCalledWith('c');
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.isLoadingMore).toBe(false);
    });

    it('stops expecting more once a page comes back short', async () => {
      const { result } = await renderList(pages(page('a', 'b', 'c'), page('d')));

      await act(() => result.current.loadMore());

      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c', 'd']);
      expect(result.current.hasMore).toBe(false);
    });

    /** The end of a list is reached many times while a page is on its way. */
    it('asks for one page at a time, however often it is asked', async () => {
      const next = later();
      const loadPage = pages(page('a', 'b', 'c'), next.promise);
      const { result } = await renderList(loadPage);

      await act(async () => {
        void result.current.loadMore();
        void result.current.loadMore();
      });

      expect(loadPage).toHaveBeenCalledTimes(2);
      expect(result.current.isLoadingMore).toBe(true);

      await next.arrive(page('d', 'e', 'f'));

      await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('does not ask for more before anything has loaded', async () => {
      const first = later();
      const loadPage = pages(first.promise);
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));

      await act(() => result.current.loadMore());

      expect(loadPage).toHaveBeenCalledTimes(1);
      expect(loadPage).toHaveBeenCalledWith(undefined, PAGE);
    });

    it('never shows an item twice when a page overlaps the one before it', async () => {
      const { result } = await renderList(pages(page('a', 'b', 'c'), page('c', 'd')));

      await act(() => result.current.loadMore());

      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('keeps what it has when the next page fails, and can try again', async () => {
      const loadPage = pages(page('a', 'b', 'c'), new Error('No connection.'), page('d'));
      const { result } = await renderList(loadPage);

      await act(() => result.current.loadMore());

      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c']);
      expect(result.current.error).toBe('No connection.');
      expect(result.current.hasMore).toBe(true);
      expect(result.current.isLoadingMore).toBe(false);

      await act(() => result.current.loadMore());

      expect(loadPage).toHaveBeenLastCalledWith('c');
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c', 'd']);
    });

    // Found by this test: loadMore used to set `error` when a page failed and
    // never clear it when a later page succeeded, so "could not be loaded"
    // stayed in the list header after the retry had loaded fine.
    it('clears the error of a failed page once the next attempt succeeds', async () => {
      const { result } = await renderList(
        pages(page('a', 'b', 'c'), new Error('No connection.'), page('d')),
      );

      await act(() => result.current.loadMore());
      expect(result.current.error).toBe('No connection.');

      await act(() => result.current.loadMore());

      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c', 'd']);
      expect(result.current.error).toBeNull();
    });
  });

  describe('when the item a page continues from has gone', () => {
    /**
     * A letter can be deleted between pages - with its sender's account - and
     * the server then cannot place the next page. An empty answer would read as
     * the end of the list, leaving every older letter out of reach.
     */
    it('starts the list again from the top instead of ending it', async () => {
      const loadPage = pages(
        page('a', 'b', 'c'),
        new RpcError(REFUSALS.cursor_not_found, 'cursor_not_found'),
        page('a', 'b', 'd'),
      );
      const { result } = await renderList(loadPage);

      await act(() => result.current.loadMore());
      await waitFor(() => expect(idsOf(result.current.items)).toEqual(['a', 'b', 'd']));

      expect(loadPage).toHaveBeenLastCalledWith(undefined, PAGE);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('coming back to the list', () => {
    /**
     * Returning from a letter must not throw away the pages already scrolled
     * through and jump the reader back to the top.
     */
    it('splices the fresh first page onto the older pages already loaded', async () => {
      const loadPage = pages(page('a', 'b', 'c'), page('d', 'e', 'f'), page('new', 'a', 'b'));
      const { result } = await renderList(loadPage);
      await act(() => result.current.loadMore());

      await returnToScreen();

      await waitFor(() =>
        expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c', 'd', 'e', 'f']),
      );
      expect(loadPage).toHaveBeenCalledTimes(3);
      expect(loadPage).toHaveBeenLastCalledWith(undefined, PAGE);
      expect(result.current.hasMore).toBe(true);
    });

    it('keeps the list as it was when nothing has changed', async () => {
      const loadPage = pages(page('a', 'b', 'c'), page('d', 'e', 'f'), page('a', 'b', 'c'));
      const { result } = await renderList(loadPage);
      await act(() => result.current.loadMore());

      await returnToScreen();
      await settle();

      expect(loadPage).toHaveBeenCalledTimes(3);
      expect(loadPage).toHaveBeenLastCalledWith(undefined, PAGE);
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(result.current.hasMore).toBe(true);
    });

    /**
     * The fresh page is full, so on its own it would suggest there is more. The
     * older pages are still held, and the end of those is still the end.
     */
    it('remembers it has reached the end when the fresh page overlaps what it holds', async () => {
      const { result } = await renderList(
        pages(page('a', 'b', 'c'), page('d'), page('new', 'a', 'b')),
      );
      await act(() => result.current.loadMore());
      expect(result.current.hasMore).toBe(false);

      await returnToScreen();

      await waitFor(() => expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c', 'd']));
      expect(result.current.hasMore).toBe(false);
    });

    it('drops an item that is no longer in the fresh first page', async () => {
      const { result } = await renderList(pages(page('a', 'b', 'c'), page('a', 'c', 'd')));

      await returnToScreen();

      await waitFor(() => expect(idsOf(result.current.items)).toEqual(['a', 'c', 'd']));
    });

    /**
     * More has arrived than fits in a page: the fresh page no longer reaches the
     * items held, so whatever lies between is unknown and the older pages
     * cannot simply follow it.
     */
    it('starts again from the fresh page when it does not reach the items held', async () => {
      const { result } = await renderList(
        pages(page('a', 'b', 'c'), page('d'), page('x', 'y', 'z')),
      );
      await act(() => result.current.loadMore());
      expect(result.current.hasMore).toBe(false);

      await returnToScreen();

      await waitFor(() => expect(idsOf(result.current.items)).toEqual(['x', 'y', 'z']));
      expect(result.current.hasMore).toBe(true);
    });

    it('refreshes quietly, without the pull-to-refresh spinner', async () => {
      const fresh = later();
      const { result } = await renderList(pages(page('a', 'b', 'c'), fresh.promise));

      await returnToScreen();

      expect(result.current.isRefreshing).toBe(false);
      await fresh.arrive(page('new', 'a', 'b'));
      await waitFor(() => expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']));
    });

    it('keeps the items it has when the refresh fails, and says so', async () => {
      const { result } = await renderList(
        pages(page('a', 'b', 'c'), new Error('No connection.'), page('a', 'b', 'c')),
      );

      await returnToScreen();

      await waitFor(() => expect(result.current.error).toBe('No connection.'));
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c']);

      await returnToScreen();

      await waitFor(() => expect(result.current.error).toBeNull());
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c']);
    });

    /** That is exactly when a bat may have landed. */
    it('reloads when the app comes back from the background', async () => {
      const loadPage = pages(page('a', 'b', 'c'), page('new', 'a', 'b'));
      const { result } = await renderList(loadPage);

      await appBecomes('background');
      expect(loadPage).toHaveBeenCalledTimes(1);

      await appBecomes('active');

      await waitFor(() => expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']));
      expect(loadPage).toHaveBeenCalledTimes(2);
    });

    it('stops listening for the app once the list is gone', async () => {
      const { unmount } = await renderList(pages(page('a')));
      // Two: the list's own, which loads again on the app's return, and the
      // one that stops the unasked attempts while the app is in the background.
      expect(appStateListeners.size).toBe(2);

      await unmount();

      expect(appStateListeners.size).toBe(0);
    });
  });

  /**
   * A list opened without a signal kept "could not be loaded" over nothing for
   * as long as it stayed in view. The first page is asked for again unasked,
   * as `useRemote` asks; a page further down has a button for it.
   */
  describe('after the first page got no answer', () => {
    const SECOND = 1000;
    const MINUTE = 60 * SECOND;
    const passes = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));
    const noAnswer = () => new RpcError('No connection. Check your network and try again.', null);

    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('asks for it again by itself until there is one', async () => {
      const loadPage = pages(noAnswer(), noAnswer(), page('a', 'b', 'c'));
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));
      await passes(0);
      expect(result.current.error).toBe('No connection. Check your network and try again.');
      expect(result.current.isLoading).toBe(false);

      await passes(2 * SECOND);
      expect(loadPage).toHaveBeenCalledTimes(2);

      await passes(4 * SECOND);

      expect(loadPage).toHaveBeenCalledTimes(3);
      expect(loadPage).toHaveBeenLastCalledWith(undefined, PAGE);
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c']);
      expect(result.current.error).toBeNull();
      expect(result.current.isRefreshing).toBe(false);
    });

    it('asks again for a refresh that failed, keeping the items meanwhile', async () => {
      const loadPage = pages(page('a', 'b', 'c'), noAnswer(), page('new', 'a', 'b'));
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));
      await passes(0);

      await act(() => result.current.refresh());
      expect(result.current.error).toBe('No connection. Check your network and try again.');
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c']);

      await passes(2 * SECOND);

      expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']);
      expect(result.current.error).toBeNull();
    });

    it("asks again as well for a load on the app's return that got no answer", async () => {
      const loadPage = pages(page('a', 'b', 'c'), noAnswer(), page('new', 'a', 'b'));
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));
      await passes(0);

      await appBecomes('active');
      expect(result.current.error).toBe('No connection. Check your network and try again.');

      await passes(2 * SECOND);

      expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']);
      expect(result.current.error).toBeNull();
    });

    /** One round of attempts at a time, however many loads fail. */
    it('leaves the asking to the newest load when an older one fails after it', async () => {
      let failLate: (error: Error) => void = () => {};
      const older = new Promise<Item[]>((_resolve, reject) => (failLate = reject));
      const loadPage = pages(older, noAnswer(), noAnswer(), noAnswer(), noAnswer());
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));
      await passes(0);

      await act(() => result.current.refresh());
      await act(async () => failLate(noAnswer()));
      expect(loadPage).toHaveBeenCalledTimes(2);

      // The newer load's round: after two seconds, then after four more.
      await passes(2 * SECOND);
      expect(loadPage).toHaveBeenCalledTimes(3);
      await passes(3 * SECOND);
      expect(loadPage).toHaveBeenCalledTimes(3);
      await passes(1 * SECOND);
      expect(loadPage).toHaveBeenCalledTimes(4);
    });

    it('does not ask again when it was the server that refused', async () => {
      const loadPage = pages(new RpcError(REFUSALS.account_suspended, 'account_suspended'));
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));
      await passes(0);
      expect(result.current.error).toBe(REFUSALS.account_suspended);

      await passes(10 * MINUTE);

      expect(loadPage).toHaveBeenCalledTimes(1);
    });

    it('does not ask again once it has the page', async () => {
      const loadPage = pages(noAnswer(), page('a', 'b', 'c'));
      await renderHook(() => usePaged(loadPage, PAGE));
      await passes(2 * SECOND);
      expect(loadPage).toHaveBeenCalledTimes(2);

      await passes(10 * MINUTE);

      expect(loadPage).toHaveBeenCalledTimes(2);
    });

    /** The list offers a button for that, and scrolling asks again as well. */
    it('leaves a page further down that failed to whoever asks for it', async () => {
      const loadPage = pages(page('a', 'b', 'c'), noAnswer());
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));
      await passes(0);

      await act(() => result.current.loadMore());
      expect(result.current.error).toBe('No connection. Check your network and try again.');

      await passes(10 * MINUTE);

      expect(loadPage).toHaveBeenCalledTimes(2);
    });

    it('asks nothing more once the list is gone', async () => {
      const loadPage = pages(noAnswer(), noAnswer());
      const { unmount } = await renderHook(() => usePaged(loadPage, PAGE));
      await passes(0);

      await unmount();
      await passes(10 * MINUTE);

      expect(loadPage).toHaveBeenCalledTimes(1);
      expect(appStateListeners.size).toBe(0);
    });
  });

  /**
   * What a screen asks for by itself - the Sent list, when a letter in the air
   * reaches its time - is no pull to refresh, and a spinner over the list once
   * a minute would say that someone pulled.
   */
  describe('loading the first page again by itself', () => {
    it('keeps the list on screen and shows no spinner meanwhile', async () => {
      const fresh = later();
      const loadPage = pages(page('a', 'b', 'c'), fresh.promise);
      const { result } = await renderList(loadPage);

      await act(async () => {
        void result.current.reload();
      });

      expect(loadPage).toHaveBeenCalledTimes(2);
      expect(loadPage).toHaveBeenLastCalledWith(undefined, PAGE);
      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c']);

      await fresh.arrive(page('new', 'a', 'b'));

      await waitFor(() => expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']));
      expect(result.current.isRefreshing).toBe(false);
    });

    it('splices the fresh first page onto the older pages, as on coming back', async () => {
      const loadPage = pages(page('a', 'b', 'c'), page('d', 'e', 'f'), page('new', 'a', 'b'));
      const { result } = await renderList(loadPage);
      await act(() => result.current.loadMore());

      await act(() => result.current.reload());

      expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c', 'd', 'e', 'f']);
      expect(result.current.hasMore).toBe(true);
    });

    it('does not let a slow answer overwrite a newer one', async () => {
      const slow = later();
      const loadPage = pages(page('a', 'b', 'c'), slow.promise, page('new', 'a', 'b'));
      const { result } = await renderList(loadPage);

      await act(async () => {
        void result.current.reload();
      });
      await act(() => result.current.reload());
      expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']);

      await slow.arrive(page('a', 'b', 'c'));
      await settle();

      expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']);
    });

    it('keeps the list when it gets no answer, says so, and asks again by itself', async () => {
      jest.useFakeTimers();
      const noAnswer = new RpcError('No connection. Check your network and try again.', null);
      const loadPage = pages(page('a', 'b', 'c'), noAnswer, page('new', 'a', 'b'));
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));
      await act(() => jest.advanceTimersByTimeAsync(0));

      await act(() => result.current.reload());
      expect(result.current.error).toBe('No connection. Check your network and try again.');
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c']);

      await act(() => jest.advanceTimersByTimeAsync(2000));

      expect(loadPage).toHaveBeenCalledTimes(3);
      expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']);
      expect(result.current.error).toBeNull();
      expect(result.current.isRefreshing).toBe(false);
    });

    it('does not ask again when the server refused', async () => {
      jest.useFakeTimers();
      const loadPage = pages(
        page('a', 'b', 'c'),
        new RpcError(REFUSALS.account_suspended, 'account_suspended'),
      );
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));
      await act(() => jest.advanceTimersByTimeAsync(0));

      await act(() => result.current.reload());
      await act(() => jest.advanceTimersByTimeAsync(10 * 60_000));

      expect(loadPage).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBe(REFUSALS.account_suspended);
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('pull to refresh', () => {
    it('shows that it is refreshing until the fresh page arrives', async () => {
      const fresh = later();
      const { result } = await renderList(pages(page('a', 'b', 'c'), fresh.promise));

      await act(async () => {
        void result.current.refresh();
      });
      expect(result.current.isRefreshing).toBe(true);

      await fresh.arrive(page('new', 'a', 'b'));

      await waitFor(() => expect(result.current.isRefreshing).toBe(false));
      expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']);
    });

    it('stops refreshing when the refresh fails', async () => {
      const { result } = await renderList(pages(page('a', 'b', 'c'), new Error('No connection.')));

      await act(() => result.current.refresh());

      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.error).toBe('No connection.');
      expect(idsOf(result.current.items)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('responses that arrive out of order', () => {
    it('does not let a slow first page overwrite a newer one', async () => {
      const slow = later();
      const fast = later();
      const loadPage = pages(slow.promise, fast.promise);
      const { result } = await renderHook(() => usePaged(loadPage, PAGE));

      await returnToScreen();
      await fast.arrive(page('new', 'a', 'b'));
      await waitFor(() => expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b']));

      await slow.arrive(page('a', 'b', 'c'));
      await settle();

      expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b']);
      expect(result.current.isLoading).toBe(false);
    });

    it('drops a next page that a refresh overtook, and can ask for it again', async () => {
      const more = later();
      const loadPage = pages(page('a', 'b', 'c'), more.promise, page('new', 'a', 'b'), page('d'));
      const { result } = await renderList(loadPage);

      await act(async () => {
        void result.current.loadMore();
      });
      await returnToScreen();
      await waitFor(() => expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']));

      await more.arrive(page('d', 'e', 'f'));
      await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

      expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c']);

      await act(() => result.current.loadMore());

      expect(loadPage).toHaveBeenLastCalledWith('c');
      expect(idsOf(result.current.items)).toEqual(['new', 'a', 'b', 'c', 'd']);
    });

    // Found by this test: loadMore used to discard its page only when a refresh
    // *started* after it. A refresh already in flight shares its request
    // number, so if it then started the list again from a new first page,
    // loadMore still appended the page that followed the *old* last item, and
    // everything between the two was skipped for good.
    it('does not add an older page to a list that a refresh has since started again', async () => {
      const fresh = later();
      const more = later();
      const { result } = await renderList(pages(page('a', 'b', 'c'), fresh.promise, more.promise));

      await act(async () => {
        void result.current.refresh();
      });
      await act(async () => {
        void result.current.loadMore();
      });

      await fresh.arrive(page('x', 'y', 'z'));
      await waitFor(() => expect(idsOf(result.current.items)).toEqual(['x', 'y', 'z']));

      await more.arrive(page('d', 'e', 'f'));
      await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

      expect(idsOf(result.current.items)).toEqual(['x', 'y', 'z']);
    });
  });
});
