import { describeProgress, flightProgress, pointOnArc } from '@/lib/flight';

const MINUTE = 60_000;
const sentAt = new Date('2026-11-04T18:00:00Z');
const deliverAt = new Date(sentAt.getTime() + 100 * MINUTE);

describe('flightProgress', () => {
  it('is 0 as the bat leaves and 1 as it lands, and in between by the clock', () => {
    expect(flightProgress(sentAt, deliverAt, sentAt.getTime())).toBe(0);
    expect(flightProgress(sentAt, deliverAt, sentAt.getTime() + 25 * MINUTE)).toBe(0.25);
    expect(flightProgress(sentAt, deliverAt, deliverAt.getTime())).toBe(1);
  });

  /** A phone clock a little behind the server's, or a landing not yet fetched. */
  it('stays between 0 and 1 whatever the clock says', () => {
    expect(flightProgress(sentAt, deliverAt, sentAt.getTime() - MINUTE)).toBe(0);
    expect(flightProgress(sentAt, deliverAt, deliverAt.getTime() + MINUTE)).toBe(1);
  });

  it('counts a flight of no length as over rather than dividing by nothing', () => {
    expect(flightProgress(sentAt, sentAt, sentAt.getTime())).toBe(1);
  });
});

describe('pointOnArc', () => {
  const from = { x: 10, y: 80 };
  const to = { x: 310, y: 80 };

  it('starts and ends at the two places', () => {
    expect(pointOnArc(from, to, 30, 0)).toEqual(from);
    expect(pointOnArc(from, to, 30, 1)).toEqual(to);
  });

  it('is highest in the middle, by the height asked for', () => {
    const top = pointOnArc(from, to, 30, 0.5);

    expect(top.x).toBeCloseTo(160);
    expect(top.y).toBeCloseTo(50);
    expect(pointOnArc(from, to, 30, 0.25).y).toBeGreaterThan(top.y);
    expect(pointOnArc(from, to, 30, 0.75).y).toBeGreaterThan(top.y);
  });
});

describe('describeProgress', () => {
  it('says how far along the bat is, from where to where', () => {
    expect(describeProgress(0.4, 'Berlin', 'Munich')).toBe(
      'Bat 40% of the way from Berlin to Munich',
    );
  });

  it('says it is arriving once it is due', () => {
    expect(describeProgress(1, 'Berlin', 'Munich')).toBe('Bat arriving in Munich, from Berlin');
  });
});
