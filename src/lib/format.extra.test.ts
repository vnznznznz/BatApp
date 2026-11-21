import { formatDay, formatFlightEstimate, formatOnDay, formatTimestamp } from '@/lib/format';

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

  it('shows the day, month and time for an earlier day', () => {
    expect(formatTimestamp(at(2026, 9, 12, 21, 4), now)).toBe('12 Oct 21:04');
    expect(formatTimestamp(at(2026, 1, 3, 7, 5), now)).toBe('3 Feb 07:05');
  });

  /**
   * The time used to go whenever the year differed. That was meant for old
   * letters, but on New Year's Eve it took the time off a landing a few hours
   * ahead - "It will reach Ben in 6h 18m, at 1 Jan 2027" - and in January off
   * every letter of the week before. (Found in review.)
   */
  describe('around New Year', () => {
    const newYearsEve = at(2026, 11, 31, 22, 0);
    const secondOfJanuary = at(2027, 0, 2, 9, 0);

    it('keeps the time of a moment still to come once the year turns, and names the year', () => {
      // A bat that lands six hours on.
      expect(formatTimestamp(at(2027, 0, 1, 4, 18), newYearsEve)).toBe('1 Jan 2027 04:18');
      // A move that settles a day on.
      expect(formatTimestamp(at(2027, 0, 1, 22, 0), newYearsEve)).toBe('1 Jan 2027 22:00');
      // A flight across the world.
      expect(formatTimestamp(at(2027, 0, 10, 9, 30), newYearsEve)).toBe('10 Jan 2027 09:30');
    });

    it('names the year from the first minute of it', () => {
      expect(formatTimestamp(at(2027, 0, 1, 0, 0), at(2026, 11, 31, 23, 59))).toBe(
        '1 Jan 2027 00:00',
      );
    });

    it('names no year for a moment still to come in this one', () => {
      expect(formatTimestamp(at(2026, 11, 31, 4, 18), at(2026, 11, 30, 22, 0))).toBe(
        '31 Dec 04:18',
      );
      expect(formatTimestamp(at(2027, 0, 3, 4, 18), secondOfJanuary)).toBe('3 Jan 04:18');
    });

    it('keeps the time of a letter from the last days of the old year', () => {
      expect(formatTimestamp(at(2026, 11, 30, 21, 4), secondOfJanuary)).toBe('30 Dec 21:04');
      expect(formatTimestamp(at(2026, 11, 31, 23, 59), secondOfJanuary)).toBe('31 Dec 23:59');
      expect(formatTimestamp(at(2026, 11, 30, 23, 45), at(2027, 0, 1, 0, 30))).toBe('30 Dec 23:45');
    });

    it('keeps the time of a letter from months before, across the turn of the year', () => {
      expect(formatTimestamp(at(2026, 9, 12, 21, 4), secondOfJanuary)).toBe('12 Oct 21:04');
      expect(formatTimestamp(at(2026, 3, 1, 8, 0), secondOfJanuary)).toBe('1 Apr 08:00');
    });

    it('shows only the time on New Year’s Day itself, as on any day', () => {
      expect(formatTimestamp(at(2027, 0, 1, 4, 18), at(2027, 0, 1, 0, 5))).toBe('04:18');
    });
  });

  /**
   * By then the day says enough - and it comes with its year, because the day
   * and month alone would soon be taken for the ones coming round again.
   */
  describe('long ago', () => {
    it('shows the year instead of the time for a moment more than three hundred days back', () => {
      expect(formatTimestamp(at(2025, 9, 12, 21, 4), now)).toBe('12 Oct 2025');
      expect(formatTimestamp(at(2025, 11, 20, 8, 0), now)).toBe('20 Dec 2025');
      expect(formatTimestamp(at(2019, 5, 1, 12, 0), now)).toBe('1 Jun 2019');
    });

    it('does so whichever year that was, this one included', () => {
      expect(formatTimestamp(at(2026, 0, 3, 7, 5), now)).toBe('3 Jan 2026');
      expect(formatTimestamp(at(2026, 0, 1, 12, 0), at(2026, 11, 31, 12, 0))).toBe('1 Jan 2026');
    });

    it('keeps the time for a moment less than three hundred days back', () => {
      expect(formatTimestamp(at(2026, 0, 6, 7, 5), now)).toBe('6 Jan 07:05');
      expect(formatTimestamp(at(2025, 11, 20, 8, 0), at(2026, 8, 1, 12, 0))).toBe('20 Dec 08:00');
    });

    /** The line is drawn at three hundred days exactly, whatever the reader's time zone does in between. */
    it('draws the line at three hundred days, to the minute', () => {
      const DAY = 86_400_000;
      const onTheLine = new Date(now.getTime() - 300 * DAY);
      const justBeyond = new Date(onTheLine.getTime() - 60_000);

      expect(formatTimestamp(onTheLine, now)).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/);
      expect(formatTimestamp(justBeyond, now)).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
    });

    it('never drops the time of a moment still to come, however far off', () => {
      expect(formatTimestamp(at(2027, 11, 30, 21, 4), at(2027, 0, 2, 9, 0))).toBe('30 Dec 21:04');
      expect(formatTimestamp(at(2029, 5, 1, 12, 0), now)).toBe('1 Jun 2029 12:00');
    });
  });

  it('names every month the same way on any device', () => {
    const months = Array.from({ length: 12 }, (_, month) =>
      formatTimestamp(at(2026, month, 1, 12, 0), at(2026, month, 20, 12, 0)),
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

describe('formatDay', () => {
  const now = at(2026, 9, 31, 12, 0);

  it('says "today" and "yesterday" by the calendar', () => {
    expect(formatDay(at(2026, 9, 31, 0, 1), now)).toBe('today');
    expect(formatDay(at(2026, 9, 30, 23, 59), now)).toBe('yesterday');
  });

  /** It follows "since": "Friends since 2 Oct", never "since on 2 Oct". (Found in review.) */
  it('names an earlier day this year without the year, and without "on"', () => {
    expect(formatDay(at(2026, 9, 2, 8, 0), now)).toBe('2 Oct');
  });

  it('adds the year for a day in another year', () => {
    expect(formatDay(at(2025, 11, 31, 22, 0), now)).toBe('31 Dec 2025');
  });

  it('says nothing misleading about a date it cannot read', () => {
    expect(formatDay(new Date('not a date'), now)).toBe('—');
  });
});

describe('formatOnDay', () => {
  const now = at(2026, 9, 31, 12, 0);

  /** It follows a verb: "You asked on 2 Oct", "Blocked yesterday". */
  it('puts "on" before a date, and nothing before today or yesterday', () => {
    expect(formatOnDay(at(2026, 9, 31, 9, 0), now)).toBe('today');
    expect(formatOnDay(at(2026, 9, 30, 9, 0), now)).toBe('yesterday');
    expect(formatOnDay(at(2026, 9, 2, 9, 0), now)).toBe('on 2 Oct');
    expect(formatOnDay(at(2025, 11, 31, 9, 0), now)).toBe('on 31 Dec 2025');
  });

  it('says nothing misleading about a date it cannot read', () => {
    expect(formatOnDay(new Date('not a date'), now)).toBe('—');
  });
});
