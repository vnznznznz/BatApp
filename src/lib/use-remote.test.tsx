import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { RpcError } from '@/lib/rpc-error';
import { useRemote } from '@/lib/use-remote';

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

/** What a request that never reached the server is reported as. */
const noAnswer = () => new RpcError('No connection. Check your network and try again.', null);
const refusal = () => new RpcError('That letter could not be found.', 'message_not_found');

/** A load that answers each call with the next of `answers`, and the last of them from then on. */
function loads(...answers: (string | Error)[]) {
  const load = jest.fn<Promise<string>, []>();
  answers.forEach((answer, index) => {
    const respond = () =>
      answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    if (index === answers.length - 1) load.mockImplementation(respond);
    else load.mockImplementationOnce(respond);
  });
  return load;
}

/** An answer that arrives only when the test says so. */
function later() {
  let resolve: (value: string) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<string>((succeed, fail) => {
    resolve = succeed;
    reject = fail;
  });
  return {
    promise,
    arrive: (value: string) => act(async () => resolve(value)),
    fail: (error: Error) => act(async () => reject(error)),
  };
}

beforeEach(() => {
  mockScreen.inFront = true;
  jest.mocked(AppState.addEventListener).mockImplementation((_type, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRemote', () => {
  /**
   * A letter already on screen can be refused on a reload - hidden by a block
   * just made, or deleted with its sender's account. The data is kept through
   * a failed reload, so the screen has to be told why it failed to know that
   * what it is showing is gone. (Found in review.)
   */
  it('says why a reload was refused, and keeps the last data', async () => {
    const load = loads('the letter', refusal());
    const { result } = await renderHook(() => useRemote(load));
    await waitFor(() => expect(result.current.data).toBe('the letter'));

    await act(() => result.current.reload());

    expect(result.current.reason).toBe('message_not_found');
    expect(result.current.error).toBe('That letter could not be found.');
    expect(result.current.data).toBe('the letter');
  });

  it('has no reason for a failure that was not a refusal, nor after a success', async () => {
    const load = loads(new Error('Network request failed'), 'the letter');
    const { result } = await renderHook(() => useRemote(load));
    await waitFor(() => expect(result.current.error).toBe('Network request failed'));
    expect(result.current.reason).toBeNull();

    await act(() => result.current.reload());

    expect(result.current.reason).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('does not let a slow earlier answer take the place of a newer one', async () => {
    const slow = later();
    const load = jest
      .fn<Promise<string>, []>()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValue('the newer answer');
    const { result } = await renderHook(() => useRemote(load));

    await act(() => result.current.reload());
    expect(result.current.data).toBe('the newer answer');

    await slow.arrive('the older answer');

    expect(result.current.data).toBe('the newer answer');
  });

  /**
   * A screen opened without a signal showed its error for as long as it stayed
   * in front: nothing asked again unless the courier left the screen, sent the
   * app to the background, or thought of pulling down. On the compose screen
   * that meant a letter that could be written and never sent.
   */
  describe('after a load that got no answer', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('asks again by itself until there is one', async () => {
      const load = loads(noAnswer(), noAnswer(), 'the roost');
      const { result } = await renderHook(() => useRemote(load));
      await passes(0);
      expect(result.current.error).toBe('No connection. Check your network and try again.');
      expect(result.current.isLoading).toBe(false);

      await passes(2 * SECOND);
      expect(load).toHaveBeenCalledTimes(2);
      expect(result.current.data).toBeNull();

      await passes(4 * SECOND);

      expect(load).toHaveBeenCalledTimes(3);
      expect(result.current.data).toBe('the roost');
      expect(result.current.error).toBeNull();
    });

    it('waits twice as long each time, from two seconds up to a minute', async () => {
      const load = loads(noAnswer());
      await renderHook(() => useRemote(load));
      await passes(0);

      const asked: number[] = [];
      let seen = load.mock.calls.length;
      for (let second = 1; second <= 250; second++) {
        await passes(SECOND);
        if (load.mock.calls.length > seen) asked.push(second);
        seen = load.mock.calls.length;
      }

      // After 2, 4, 8, 16 and 32 seconds, and then every minute.
      expect(asked).toEqual([2, 6, 14, 30, 62, 122, 182, 242]);
    });

    it('does so without a spinner', async () => {
      const second = later();
      const load = jest
        .fn<Promise<string>, []>()
        .mockRejectedValueOnce(noAnswer())
        .mockReturnValue(second.promise);
      const { result } = await renderHook(() => useRemote(load));
      await passes(2 * SECOND);
      expect(load).toHaveBeenCalledTimes(2);

      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.isLoading).toBe(false);
      await second.arrive('the roost');
    });

    /** "No connection" above a roost that is still showing should heal as well. */
    it('asks again for a reload that failed, keeping what it had meanwhile', async () => {
      const load = loads('three bats at home', noAnswer(), 'two bats at home');
      const { result } = await renderHook(() => useRemote(load));
      await passes(0);

      await act(() => result.current.reload());
      expect(result.current.data).toBe('three bats at home');
      expect(result.current.error).toBe('No connection. Check your network and try again.');

      await passes(2 * SECOND);

      expect(result.current.data).toBe('two bats at home');
      expect(result.current.error).toBeNull();
    });

    /** One round of attempts at a time, however many loads fail. */
    it('leaves the asking to the newest load when an older one fails after it', async () => {
      const older = later();
      const load = jest
        .fn<Promise<string>, []>()
        .mockReturnValueOnce(older.promise)
        .mockRejectedValue(noAnswer());
      const { result } = await renderHook(() => useRemote(load));
      await passes(0);

      await act(() => result.current.reload());
      await older.fail(noAnswer());
      expect(load).toHaveBeenCalledTimes(2);

      // The newer load's round: after two seconds, then after four more.
      await passes(2 * SECOND);
      expect(load).toHaveBeenCalledTimes(3);
      await passes(3 * SECOND);
      expect(load).toHaveBeenCalledTimes(3);
      await passes(1 * SECOND);
      expect(load).toHaveBeenCalledTimes(4);
    });

    it('tells whoever watches for answers about each attempt', async () => {
      const load = loads(noAnswer(), 'the roost');
      const { result } = await renderHook(() => useRemote(load));
      await passes(0);
      const first = result.current.settledAt;

      await passes(2 * SECOND);

      expect(result.current.settledAt).toBeGreaterThan(first);
    });

    it('goes on asking after an error that is nobody in particular', async () => {
      const load = loads(new Error('Something else went wrong.'), 'the roost');
      const { result } = await renderHook(() => useRemote(load));
      await passes(2 * SECOND);

      expect(result.current.data).toBe('the roost');
    });
  });

  describe('when the server has answered', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    /** A letter that is gone is gone: asking again would only ask again. */
    it('does not ask again after a refusal', async () => {
      const load = loads(refusal());
      const { result } = await renderHook(() => useRemote(load));
      await passes(0);
      expect(result.current.reason).toBe('message_not_found');

      await passes(10 * MINUTE);

      expect(load).toHaveBeenCalledTimes(1);
    });

    it('does not ask again once it has what it asked for', async () => {
      const load = loads(noAnswer(), 'the roost');
      await renderHook(() => useRemote(load));
      await passes(2 * SECOND);
      expect(load).toHaveBeenCalledTimes(2);

      await passes(10 * MINUTE);

      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  /** Nobody is waiting for a screen they cannot see. */
  describe('while nobody is looking', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('stops asking once another screen covers this one, and asks at once on coming back', async () => {
      const load = loads(noAnswer());
      await renderHook(() => useRemote(load));
      await passes(0);
      expect(load).toHaveBeenCalledTimes(1);

      await screenIs('covered');
      await passes(10 * MINUTE);
      expect(load).toHaveBeenCalledTimes(1);

      await screenIs('in front');
      expect(load).toHaveBeenCalledTimes(2);

      // And goes on from there by itself.
      await passes(2 * SECOND);
      expect(load).toHaveBeenCalledTimes(3);
    });

    it('stops asking while the app is in the background, and asks at once on return', async () => {
      const load = loads(noAnswer());
      await renderHook(() => useRemote(load));
      await passes(0);

      await appBecomes('background');
      await passes(10 * MINUTE);
      expect(load).toHaveBeenCalledTimes(1);

      await appBecomes('active');
      expect(load).toHaveBeenCalledTimes(2);

      await passes(2 * SECOND);
      expect(load).toHaveBeenCalledTimes(3);
    });

    it('does not start asking from the background for a load that failed there', async () => {
      const answer = later();
      const load = jest.fn<Promise<string>, []>().mockReturnValue(answer.promise);
      await renderHook(() => useRemote(load));
      await passes(0);

      await appBecomes('inactive');
      await answer.fail(noAnswer());
      await passes(10 * MINUTE);

      expect(load).toHaveBeenCalledTimes(1);
    });

    it('does not start asking from behind another screen for a load that failed there', async () => {
      const answer = later();
      const load = jest.fn<Promise<string>, []>().mockReturnValue(answer.promise);
      await renderHook(() => useRemote(load));
      await passes(0);

      await screenIs('covered');
      await answer.fail(noAnswer());
      await passes(10 * MINUTE);

      expect(load).toHaveBeenCalledTimes(1);
    });

    it('asks nothing more once the screen is gone', async () => {
      const load = loads(noAnswer());
      const { unmount } = await renderHook(() => useRemote(load));
      await passes(0);

      await unmount();
      await passes(10 * MINUTE);

      expect(load).toHaveBeenCalledTimes(1);
      expect(appStateListeners.size).toBe(0);
    });
  });

  describe('when the courier asks again by hand', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('starts the pauses again from the shortest', async () => {
      const load = loads(noAnswer());
      const { result } = await renderHook(() => useRemote(load));
      // Failed at 0, 2, 6 and 14 seconds; the next attempt is due at 30.
      await passes(15 * SECOND);
      expect(load).toHaveBeenCalledTimes(4);

      await act(() => result.current.refresh());
      expect(load).toHaveBeenCalledTimes(5);

      await passes(2 * SECOND);
      expect(load).toHaveBeenCalledTimes(6);
    });

    it('lets that take the place of the attempt it was waiting to make', async () => {
      const load = loads(noAnswer());
      const { result } = await renderHook(() => useRemote(load));
      await passes(1 * SECOND);
      expect(load).toHaveBeenCalledTimes(1);

      // An attempt is due in a second. The courier is quicker.
      await act(() => result.current.reload());
      expect(load).toHaveBeenCalledTimes(2);

      await passes(1 * SECOND);
      expect(load).toHaveBeenCalledTimes(2);

      await passes(1 * SECOND);
      expect(load).toHaveBeenCalledTimes(3);
    });
  });
});
