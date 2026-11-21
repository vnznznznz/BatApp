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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * How far back a moment is shown by its day alone. Less than a year, so that a
 * day and month shown without a year can only be the last ones gone by.
 */
const LONG_AGO_MS = 300 * DAY_MS;

/**
 * A moment in the reader's local time, as briefly as is unambiguous: "21:04"
 * today, "Yesterday 21:04", "12 Oct 21:04" for the months just gone and for
 * anything still to come - "1 Jan 2027 04:18" when that is in a year not yet
 * begun - and "12 Oct 2025", the day alone, for anything longer ago.
 *
 * The time is dropped by how long ago the moment was, not by its year. It used
 * to go whenever the year differed: meant for old letters, that also took the
 * time off a landing a few hours ahead on New Year's Eve, and in January off
 * every letter of the week before. (Found in review.)
 *
 * Written out rather than left to `Intl`, which renders differently per device
 * locale and per JavaScript engine. A 24-hour clock with the day before the
 * month is how the people this app is for write dates.
 */
export function formatTimestamp(date: Date, now: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return '—';

  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (sameDay(date, now)) return time;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `Yesterday ${time}`;

  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (now.getTime() - date.getTime() > LONG_AGO_MS) return `${day} ${date.getFullYear()}`;

  // Only a moment still to come can be in a later year than now.
  return date.getFullYear() > now.getFullYear()
    ? `${day} ${date.getFullYear()} ${time}`
    : `${day} ${time}`;
}

/**
 * "today", "yesterday", "31 Oct", or "31 Oct 2025" - a day, worded to follow
 * "since": "Friends since 31 Oct".
 */
export function formatDay(date: Date, now: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return '—';
  if (sameDay(date, now)) return 'today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'yesterday';

  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

/**
 * "today", "yesterday", or "on 31 Oct" - the same day, worded to follow a verb:
 * "You asked on 31 Oct", "Blocked yesterday".
 */
export function formatOnDay(date: Date, now: Date = new Date()): string {
  const day = formatDay(date, now);
  return day === 'today' || day === 'yesterday' || day === '—' ? day : `on ${day}`;
}

/** "about 6h 18m" — how long a bat will take, for an estimate shown before sending. */
export function formatFlightEstimate(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  return `about ${formatDuration(seconds * 1000)}`;
}
