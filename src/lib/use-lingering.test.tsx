import { act, renderHook } from '@testing-library/react-native';

import { LINGERING_MS, useLingering } from '@/lib/use-lingering';

/** Every value the hook returned, render by render, with whether it was waiting then. */
let seen: [waiting: boolean, lingering: boolean][];

async function watch(waiting: boolean) {
  seen = [];
  return renderHook(
    ({ waiting: now }: { waiting: boolean }) => {
      const lingering = useLingering(now);
      seen.push([now, lingering]);
      return lingering;
    },
    { initialProps: { waiting } },
  );
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useLingering', () => {
  it('is false at first, and true once the wait has gone on for a while', async () => {
    const { result } = await watch(true);
    expect(result.current).toBe(false);

    await act(() => jest.advanceTimersByTimeAsync(LINGERING_MS - 1));
    expect(result.current).toBe(false);

    await act(() => jest.advanceTimersByTimeAsync(1));
    expect(result.current).toBe(true);
  });

  /**
   * Not for a single render after the wait is over: the words "still trying"
   * would stand for a moment beside what came. (Unpinned until the tests
   * review.)
   */
  it('is false in the very render in which the wait ends', async () => {
    const { rerender } = await watch(true);
    await act(() => jest.advanceTimersByTimeAsync(LINGERING_MS));

    await rerender({ waiting: false });

    expect(seen.filter(([waiting, lingering]) => !waiting && lingering)).toEqual([]);
  });

  it('starts counting again from nothing when a new wait begins', async () => {
    const { result, rerender } = await watch(true);
    await act(() => jest.advanceTimersByTimeAsync(LINGERING_MS));
    await rerender({ waiting: false });

    await rerender({ waiting: true });
    expect(result.current).toBe(false);
    await act(() => jest.advanceTimersByTimeAsync(LINGERING_MS));
    expect(result.current).toBe(true);
  });
});
