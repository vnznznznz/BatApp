import { formatDay, formatTimestamp } from '@/lib/format';

/**
 * When a move of city settles - a moment still to come, so always with its
 * time: "21:00" today, "18 Nov 21:00", and "1 Jan 2027 21:00" once the year
 * turns first. `formatTimestamp` is written for moments past, and drops the
 * time from a date in another year, which for a move asked about on 31
 * December left only the day.
 */
export function formatSettlesAt(date: Date, now: Date = new Date()): string {
  if (date.getFullYear() === now.getFullYear()) return formatTimestamp(date, now);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${formatDay(date, now)} ${time}`;
}
