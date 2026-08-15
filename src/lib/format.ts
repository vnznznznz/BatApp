/**
 * Presentation helpers for flight information.
 *
 * These are pure and deliberately free of any date library: the app only ever
 * needs to render a coarse "time remaining" and a rounded distance.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Renders a duration the way the flight screen shows it: "7h 42m", "3d 4h",
 * "12m". Durations at or below zero render as "any moment now" — a bat whose
 * arrival time has passed but which the delivery worker has not yet processed.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'any moment now';

  if (ms >= DAY_MS) {
    const days = Math.floor(ms / DAY_MS);
    const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (ms >= HOUR_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const minutes = Math.floor(ms / MINUTE_MS);
  return minutes > 0 ? `${minutes}m` : 'less than a minute';
}

/**
 * Renders a distance in kilometres. Short hops keep one decimal so that a
 * cross-town flight does not collapse to "0 km".
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '—';
  if (km < 10) return `${Math.round(km * 10) / 10} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

/** "3 / 3 bats available" — the headline figure on the home screen. */
export function formatBatCount(available: number, total: number): string {
  const noun = available === 1 ? 'bat' : 'bats';
  return `${available} / ${total} ${noun} available`;
}
