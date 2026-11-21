import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { renewOnNextRequest } from '@/lib/renewal';
import { useRetry } from '@/lib/use-retry';

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

/** Whoever is waiting to hear that the session was renewed, as renewal.ts keeps them. */
const mockRenewalListeners = new Set<() => void>();

jest.mock('@/lib/renewal', () => ({
  renewOnNextRequest: jest.fn(),
  onSessionRenewed: (listener: () => void) => {
    mockRenewalListeners.add(listener);
    return () => {
      mockRenewalListeners.delete(listener);
    };
  },
}));

async function screenIs(where: 'in front' | 'covered') {
  mockScreen.inFront = where === 'in front';
  await act(async () => mockScreen.watchers.forEach((watch) => watch(mockScreen.inFront)));
}

/** The app moving between foreground and background, as React Native reports it. */
const appStateListeners = new Set<(state: AppStateStatus) => void>();

async function appBecomes(state: AppStateStatus) {
  await act(async () => appStateListeners.forEach((listener) => listener(state)));
}

/** The client has renewed the session. */
const sessionRenewed = () => act(async () => mockRenewalListeners.forEach((renewed) => renewed()));

/** Lets time pass, with every attempt that is due in it. */
const passes = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

/** An attempt that got no answer, and so is worth making again. */
const unanswered = (_visible: boolean) => Promise.resolve(true);

/** An attempt that settles only when the test says so. */
function later() {
  let settle: (again: boolean) => void = () => {};
  const promise = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  return { promise, settle: (again: boolean) => act(async () => settle(again)) };
}

const renewals = jest.mocked(renewOnNextRequest);

beforeEach(() => {
  jest.useFakeTimers();
  mockScreen.inFront = true;
  mockRenewalListeners.clear();
  renewals.mockClear();
  jest.mocked(AppState.addEventListener).mockImplementation((_type, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  appStateListeners.clear();
  jest.useRealTimers();
});

/** The hook over `attempt`, and the function it returns. */
async function retrying(attempt: jest.Mock<Promise<boolean>, [boolean]>) {
  const hook = await renderHook(() => useRetry(attempt));
  return { ...hook, run: (visible: boolean) => act(() => hook.result.current(visible)) };
}

describe('renewing the session first', () => {
  /**
   * "Try again" or a pull: the network may be back, and the client's memory of
   * the last renewal that failed would answer for a minute without asking.
   */
  it('renews first for a load someone pressed for', async () => {
    const { run } = await retrying(jest.fn(unanswered));

    await run(true);

    expect(renewals).toHaveBeenCalledTimes(1);
  });

  /**
   * Coming into view and the app's return ask for a load as well, but nobody
   * pressed anything. Renewing for them without a network started half a
   * minute of attempts at every screen opened, and Sign out waited behind
   * them. (Found in review.)
   */
  it('does not renew for a load on coming into view, or on the app coming back', async () => {
    const { run } = await retrying(jest.fn(unanswered));

    await run(false);

    expect(renewals).not.toHaveBeenCalled();
  });

  it('does not renew for the attempts it makes again by itself', async () => {
    const attempt = jest.fn(unanswered);
    const { run } = await retrying(attempt);
    await run(true);

    await passes(2000 + 4000 + 8000);

    expect(attempt).toHaveBeenCalledTimes(4);
    expect(renewals).toHaveBeenCalledTimes(1);
  });
});

describe('when the session has been renewed', () => {
  it('makes the attempt waiting its turn at once', async () => {
    const attempt = jest.fn(unanswered);
    const { run } = await retrying(attempt);
    await run(false);

    await sessionRenewed();

    expect(attempt).toHaveBeenCalledTimes(2);
  });

  /** Nothing is waiting for a screen in the background, nor for its loads. */
  it('makes no attempt while the app is in the background', async () => {
    const attempt = jest.fn(unanswered);
    const { run } = await retrying(attempt);
    await run(false);
    await appBecomes('background');

    await sessionRenewed();
    await passes(60_000);

    expect(attempt).toHaveBeenCalledTimes(1);
  });

  /** A newer load has taken the place of the attempt that was waiting: one at a time. */
  it('makes no attempt beside a newer load that is still out', async () => {
    const out = later();
    const attempt = jest.fn(unanswered);
    const { run, result } = await retrying(attempt);
    await run(false);
    attempt.mockReturnValueOnce(out.promise);
    let newer: Promise<void> = Promise.resolve();
    await act(async () => {
      newer = result.current(true);
    });

    await sessionRenewed();

    expect(attempt).toHaveBeenCalledTimes(2);
    await out.settle(false);
    await act(() => newer);
  });

  /** A screen that is covered or gone stops listening, and so is not woken twice when it is back. */
  it('stops listening once the screen is covered, and once it is gone', async () => {
    const { unmount } = await retrying(jest.fn(unanswered));
    expect(mockRenewalListeners.size).toBe(1);

    await screenIs('covered');
    expect(mockRenewalListeners.size).toBe(0);

    await screenIs('in front');
    expect(mockRenewalListeners.size).toBe(1);

    await unmount();
    expect(mockRenewalListeners.size).toBe(0);
  });
});
