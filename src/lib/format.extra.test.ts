import { formatFlightEstimate, formatTimestamp } from '@/lib/format';

/**
 * Every date here is built with the local-time constructor, as the reader's
 * device would see it, so these pass in any time zone the tests run in.
 * Months are zero-based: `new Date(2026, 9, 31)` is 31 October 2026.
 */
const at = (year: number, month: number, day: number, hours = 0, minutes = 0) =>
  new Date(year, month, day, hours, minutes);

describe('formatTimestamp', () => {
  const now = at(2026, 9, 31, 12, 0);

  it('shows only the time for a moment earlier today', () => {
    expect(formatTimestamp(at(2026, 9, 31, 9, 41), now)).toBe('09:41');
  });

  it('pads the time to a 24-hour clock', () => {
    expect(formatTimestamp(at(2026, 9, 31, 0, 5), now)).toBe('00:05');
    expect(formatTimestamp(at(2026, 9, 31, 23, 59), at(2026, 9, 31, 23, 59))).toBe('23:59');
  });

  it('says "Yesterday" for the day before', () => {
    expect(formatTimestamp(at(2026, 9, 30, 21, 4), now)).toBe('Yesterday 21:04');
  });

  /** A calendar day, not a span of 24 hours. */
  it('counts the day by the calendar, not by how many hours ago it was', () => {
    const justAfterMidnight = at(2026, 9, 31, 0, 10);

    expect(formatTimestamp(at(2026, 9, 30, 23, 50), justAfterMidnight)).toBe('Yesterday 23:50');
    expect(formatTimestamp(at(2026, 9, 29, 23, 50), now)).toBe('29 Oct 23:50');
  });

  it('recognises yesterday across the end of a month', () => {
    expect(formatTimestamp(at(2026, 9, 31, 22, 15), at(2026, 10, 1, 8, 0))).toBe('Yesterday 22:15');
    expect(formatTimestamp(at(2026, 1, 28, 22, 15), at(2026, 2, 1, 8, 0))).toBe('Yesterday 22:15');
  });

  it('recognises yesterday on the leap day', () => {
    expect(formatTimestamp(at(2028, 1, 29, 6, 30), at(2028, 2, 1, 8, 0))).toBe('Yesterday 06:30');
  });

  /** Yesterday wins over the change of year: no "31 Dec 2026" on New Year's morning. */
  it('recognises yesterday across the end of a year', () => {
    expect(formatTimestamp(at(2026, 11, 31, 23, 45), at(2027, 0, 1, 0, 30))).toBe(
      'Yesterday 23:45',
    );
  });

  it('shows the day, month and time for an earlier day this year', () => {
    expect(formatTimestamp(at(2026, 9, 12, 21, 4), now)).toBe('12 Oct 21:04');
    expect(formatTimestamp(at(2026, 0, 3, 7, 5), now)).toBe('3 Jan 07:05');
  });

  it('shows the year instead of the time for an earlier year', () => {
    expect(formatTimestamp(at(2025, 9, 12, 21, 4), now)).toBe('12 Oct 2025');
    expect(formatTimestamp(at(2026, 11, 30, 23, 45), at(2027, 0, 1, 0, 30))).toBe('30 Dec 2026');
  });

  it('names every month the same way on any device', () => {
    const months = Array.from({ length: 12 }, (_, month) =>
      formatTimestamp(at(2026, month, 1, 12, 0), at(2026, 11, 31, 12, 0)),
    );

    expect(months).toEqual([
      '1 Jan 12:00',
      '1 Feb 12:00',
      '1 Mar 12:00',
      '1 Apr 12:00',
      '1 May 12:00',
      '1 Jun 12:00',
      '1 Jul 12:00',
      '1 Aug 12:00',
      '1 Sep 12:00',
      '1 Oct 12:00',
      '1 Nov 12:00',
      '1 Dec 12:00',
    ]);
  });

  /** When an in-flight letter lands, for example. There is no "Tomorrow". */
  it('dates a moment later this year like any other day', () => {
    expect(formatTimestamp(at(2026, 10, 1, 6, 18), now)).toBe('1 Nov 06:18');
  });

  it('renders a placeholder for a date that could not be read', () => {
    expect(formatTimestamp(new Date('not a date'), now)).toBe('—');
  });

  describe('without an explicit now', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: at(2026, 9, 31, 12, 0) });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('measures against the current time', () => {
      expect(formatTimestamp(at(2026, 9, 31, 8, 30))).toBe('08:30');
      expect(formatTimestamp(at(2026, 9, 30, 8, 30))).toBe('Yesterday 08:30');
    });
  });
});

describe('formatFlightEstimate', () => {
  it('describes the flight the server worked out, as an estimate', () => {
    expect(formatFlightEstimate(6 * 3600 + 18 * 60)).toBe('about 6h 18m');
  });

  /** The shortest flight there is: the minimum, between two couriers in one city. */
  it('describes the twenty-minute minimum flight', () => {
    expect(formatFlightEstimate(20 * 60)).toBe('about 20m');
  });

  it('describes a flight of whole hours or days without a zero part', () => {
    expect(formatFlightEstimate(3 * 3600)).toBe('about 3h');
    expect(formatFlightEstimate(2 * 86_400)).toBe('about 2d');
  });

  it('describes a cross-continent flight in days and hours', () => {
    expect(formatFlightEstimate(3 * 86_400 + 4 * 3600 + 59 * 60)).toBe('about 3d 4h');
  });

  it('renders a placeholder rather than a flight that takes no time', () => {
    expect(formatFlightEstimate(0)).toBe('—');
    expect(formatFlightEstimate(-60)).toBe('—');
  });

  it('renders a placeholder for a number it cannot use', () => {
    expect(formatFlightEstimate(Number.NaN)).toBe('—');
    expect(formatFlightEstimate(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
