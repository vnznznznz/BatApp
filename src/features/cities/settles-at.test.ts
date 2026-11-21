import { formatSettlesAt } from '@/features/cities/settles-at';

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
});
