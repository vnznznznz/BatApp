import { act, renderHook } from '@testing-library/react-native';

import { useNow } from '@/lib/use-now';

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

const NOW = new Date('2026-11-04T20:00:00Z').getTime();
const SECOND = 1000;

/** Lets time pass, with every tick that is due in it. */
const passes = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  mockScreen.inFront = true;
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useNow', () => {
  it('is the time now, and moves on with each interval while the screen is in front', async () => {
    const { result } = await renderHook(() => useNow(SECOND));
    expect(result.current).toBe(NOW);

    await passes(3 * SECOND);

    expect(result.current).toBe(NOW + 3 * SECOND);
  });

  it('moves on only as often as it is asked to', async () => {
    const { result } = await renderHook(() => useNow(60 * SECOND));
    await passes(0);

    await passes(59 * SECOND);
    expect(result.current).toBe(NOW);

    await passes(SECOND);
    expect(result.current).toBe(NOW + 60 * SECOND);
  });

  /**
   * The roost stays mounted three screens back in the stack. Ticking there
   * draws it again every second for nobody, and a timer left running wakes
   * the phone for nothing.
   */
  it('stops once another screen covers this one, and leaves no timer running', async () => {
    const { result } = await renderHook(() => useNow(SECOND));
    await passes(2 * SECOND);

    await screenIs('covered');
    const covered = result.current;
    await passes(10 * SECOND);

    expect(result.current).toBe(covered);
    expect(jest.getTimerCount()).toBe(0);
  });

  /** A countdown seen again must not show a stale time for up to a whole interval. */
  it('catches up at once on coming back into view, and goes on from there', async () => {
    const { result } = await renderHook(() => useNow(60 * SECOND));
    await screenIs('covered');
    await passes(10 * 60 * SECOND);

    await screenIs('in front');
    await passes(0);
    expect(result.current).toBe(NOW + 10 * 60 * SECOND);

    await passes(60 * SECOND);
    expect(result.current).toBe(NOW + 11 * 60 * SECOND);
  });

  it('leaves no timer behind when the screen goes', async () => {
    const { unmount } = await renderHook(() => useNow(SECOND));
    await passes(SECOND);

    await unmount();
    // Rendering leaves timers of React's own for a moment.
    await passes(10 * SECOND);

    expect(jest.getTimerCount()).toBe(0);
  });
});
