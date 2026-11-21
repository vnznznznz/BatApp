import { RELOCATION_HOURS } from '@/constants/config';
import { formatSettlesAt } from '@/features/cities/settles-at';
import { formatTimestamp } from '@/lib/format';

describe('formatSettlesAt', () => {
  const now = new Date(2026, 10, 17, 21, 0);

  it('gives the time alone later the same day', () => {
    expect(formatSettlesAt(new Date(2026, 10, 17, 23, 5), now)).toBe('23:05');
  });

  it('gives the day and the time later this year', () => {
    expect(formatSettlesAt(new Date(2026, 10, 18, 21, 0), now)).toBe('18 Nov 21:00');
  });

  it('gives the day, the year and the time once the year turns', () => {
    const newYearsEve = new Date(2026, 11, 31, 21, 0);

    expect(formatSettlesAt(new Date(2027, 0, 1, 21, 0), newYearsEve)).toBe('1 Jan 2027 21:00');
    expect(formatSettlesAt(new Date(2027, 0, 1, 0, 30), newYearsEve)).toBe('1 Jan 2027 00:30');
  });

  /**
   * formatSettlesAt was written while formatTimestamp dropped the time from a
   * date in another year. formatTimestamp now keeps it for any moment still to
   * come, and a move always settles RELOCATION_HOURS after the moment it is
   * asked about. So the two should say the same for every such moment: here,
   * every seven minutes around the turn of the year, the two nights the clocks
   * change in Europe, and a day in summer. Both read the same local fields of
   * a date, so whatever zone the run is in, they agree or disagree together.
   */
  const moments = (from: Date, to: Date) => {
    const all: Date[] = [];
    for (let at = from.getTime(); at <= to.getTime(); at += 7 * 60_000) all.push(new Date(at));
    return all;
  };

  it.each([
    ['the turn of the year', [2026, 11, 29], [2027, 0, 3]],
    ['the night the clocks go forward', [2027, 2, 26], [2027, 2, 29]],
    ['the night the clocks go back', [2026, 9, 23], [2026, 9, 26]],
    ['a day in summer', [2027, 6, 14], [2027, 6, 15]],
  ] as const)('names a move asked about around %s as formatTimestamp does', (_, from, to) => {
    const differences = moments(new Date(...from), new Date(...to))
      .map((asked) => {
        const settles = new Date(asked.getTime() + RELOCATION_HOURS * 3_600_000);
        return [asked, formatSettlesAt(settles, asked), formatTimestamp(settles, asked)] as const;
      })
      .filter(([, before, after]) => before !== after);

    expect(differences).toEqual([]);
  });

  it('has the year, and the time, in what both say on New Year’s Eve', () => {
    const asked = new Date(2026, 11, 31, 23, 30);
    const settles = new Date(asked.getTime() + RELOCATION_HOURS * 3_600_000);

    expect(formatTimestamp(settles, asked)).toBe(formatSettlesAt(settles, asked));
    expect(formatTimestamp(settles, asked)).toBe('1 Jan 2027 23:30');
  });
});
