import { renderHook } from '@testing-library/react-native';

import { useRefreshAt } from '@/lib/use-refresh-at';

const NOW = new Date('2026-10-31T21:00:00Z').getTime();
const SECOND = 1000;
const MINUTE = 60 * SECOND;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRefreshAt', () => {
  it('asks a second after the time it was given, so that the server is past it too', async () => {
    const refresh = jest.fn();
    await renderHook(() => useRefreshAt(NOW + 5 * SECOND, 0, refresh));

    jest.advanceTimersByTime(6 * SECOND - 1);
    expect(refresh).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not ask while nothing is due', async () => {
    const refresh = jest.fn();
    await renderHook(() => useRefreshAt(null, 0, refresh));

    jest.advanceTimersByTime(60 * MINUTE);

    expect(refresh).not.toHaveBeenCalled();
  });

  /**
   * A time that did not parse is not a number, and a timer set for "not a
   * number" fires at once: every answer set the next one, and the screen asked
   * the server again as fast as it answered.
   */
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'does not ask for %p, which is no time at all',
    async (at) => {
      const refresh = jest.fn();
      const { rerender } = await renderHook(
        ({ settledAt }: { settledAt: number }) => useRefreshAt(at, settledAt, refresh),
        { initialProps: { settledAt: 0 } },
      );
      jest.advanceTimersByTime(60 * MINUTE);

      // Nor after an answer, which is what set the next timer.
      await rerender({ settledAt: Date.now() });
      jest.advanceTimersByTime(60 * MINUTE);

      expect(refresh).not.toHaveBeenCalled();
    },
  );

  describe('while what was due has not happened yet', () => {
    it.each([
      ['two seconds at the least', 1 * SECOND, 2 * SECOND],
      ['half as long as it is overdue', 30 * SECOND, 15 * SECOND],
      ['a minute at the most', 10 * MINUTE, MINUTE],
    ])('asks again after a pause of %s', async (_, overdue, pause) => {
      const refresh = jest.fn();
      await renderHook(() => useRefreshAt(NOW - overdue, 0, refresh));

      jest.advanceTimersByTime(pause - 1);
      expect(refresh).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('asks once for each answer, not over and over', async () => {
      const refresh = jest.fn();
      const { rerender } = await renderHook(
        ({ settledAt }: { settledAt: number }) => useRefreshAt(NOW - MINUTE, settledAt, refresh),
        { initialProps: { settledAt: 0 } },
      );

      jest.advanceTimersByTime(10 * MINUTE);
      expect(refresh).toHaveBeenCalledTimes(1);

      // The answer comes, and what was due has still not happened.
      await rerender({ settledAt: Date.now() });
      jest.advanceTimersByTime(10 * MINUTE);

      expect(refresh).toHaveBeenCalledTimes(2);
    });
  });

  it('leaves no timer behind when the screen goes', async () => {
    const refresh = jest.fn();
    const { unmount } = await renderHook(() => useRefreshAt(NOW + MINUTE, 0, refresh));

    await unmount();
    jest.advanceTimersByTime(60 * MINUTE);

    expect(refresh).not.toHaveBeenCalled();
  });
});
