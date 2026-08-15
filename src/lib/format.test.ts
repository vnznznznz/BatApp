import { formatBatCount, formatDistance, formatDuration } from '@/lib/format';

describe('formatDuration', () => {
  it('renders minutes below an hour', () => {
    expect(formatDuration(12 * 60_000)).toBe('12m');
  });

  it('renders hours and minutes', () => {
    expect(formatDuration(7 * 3_600_000 + 42 * 60_000)).toBe('7h 42m');
  });

  it('drops the minutes component when it is zero', () => {
    expect(formatDuration(3 * 3_600_000)).toBe('3h');
  });

  it('renders days and hours for long flights', () => {
    expect(formatDuration(3 * 86_400_000 + 4 * 3_600_000)).toBe('3d 4h');
  });

  it('drops the hours component when it is zero', () => {
    expect(formatDuration(2 * 86_400_000)).toBe('2d');
  });

  it('describes sub-minute durations without a number', () => {
    expect(formatDuration(30_000)).toBe('less than a minute');
  });

  it('treats an elapsed arrival time as imminent rather than negative', () => {
    expect(formatDuration(-5_000)).toBe('any moment now');
    expect(formatDuration(0)).toBe('any moment now');
  });

  it('does not render NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('any moment now');
  });
});

describe('formatDistance', () => {
  it('keeps one decimal for short hops', () => {
    expect(formatDistance(3.42)).toBe('3.4 km');
  });

  it('rounds and groups longer distances', () => {
    expect(formatDistance(584.3)).toBe('584 km');
    expect(formatDistance(8423.9)).toBe('8,424 km');
  });

  it('renders a placeholder for unusable input', () => {
    expect(formatDistance(-1)).toBe('—');
    expect(formatDistance(Number.NaN)).toBe('—');
  });
});

describe('formatBatCount', () => {
  it('uses the plural for zero and for several bats', () => {
    expect(formatBatCount(0, 3)).toBe('0 / 3 bats available');
    expect(formatBatCount(3, 3)).toBe('3 / 3 bats available');
  });

  it('uses the singular for exactly one bat', () => {
    expect(formatBatCount(1, 3)).toBe('1 / 3 bat available');
  });
});
