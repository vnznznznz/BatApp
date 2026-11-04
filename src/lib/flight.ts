/**
 * The geometry of a flight, for drawing it: how far along a bat is, and where
 * that puts it on the arc between two places. Decoration only - when a letter
 * lands is the server's answer, and nothing here changes it.
 */

/**
 * How far along its flight a bat is, from 0 (just left) to 1 (due, or landed),
 * by the clock. A flight with no length - which the server never sends - counts
 * as over, rather than dividing by nothing.
 */
export function flightProgress(sentAt: Date, deliverAt: Date, now: number): number {
  const length = deliverAt.getTime() - sentAt.getTime();
  if (!(length > 0)) return 1;
  return Math.min(1, Math.max(0, (now - sentAt.getTime()) / length));
}

export type Point = { x: number; y: number };

/**
 * The point `t` of the way (0 to 1) along an arc from `from` to `to` that rises
 * `height` above the higher of the two at its middle: a quadratic curve, whose
 * control point sits twice that height up.
 */
export function pointOnArc(from: Point, to: Point, height: number, t: number): Point {
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 2 * height };
  const rest = 1 - t;
  return {
    x: rest * rest * from.x + 2 * rest * t * control.x + t * t * to.x,
    y: rest * rest * from.y + 2 * rest * t * control.y + t * t * to.y,
  };
}

/** "Bat 40% of the way from Berlin to Munich" - the drawing, in words. */
export function describeProgress(progress: number, from: string, to: string): string {
  if (progress >= 1) return `Bat arriving in ${to}, from ${from}`;
  return `Bat ${Math.round(progress * 100)}% of the way from ${from} to ${to}`;
}
