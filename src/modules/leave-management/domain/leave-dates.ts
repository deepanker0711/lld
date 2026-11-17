/**
 * Leave dates are calendar days, not instants: 'YYYY-MM-DD' strings everywhere.
 * - They compare correctly as strings ('2026-11-03' < '2026-11-10').
 * - Arithmetic goes through UTC midnight, so the server's time zone never shifts a day.
 * - "Today" is computed in the COMPANY's time zone: at 01:00 IST it's already
 *   tomorrow in India but still yesterday in UTC. That off-by-one is the classic bug.
 */
export type Day = string;

const DAY_MS = 86_400_000;

function toUtcMs(day: Day): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function addDays(day: Day, n: number): Day {
  return new Date(toUtcMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** to − from in calendar days (negative if to is earlier). */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function isWeekend(day: Day): boolean {
  const dow = new Date(toUtcMs(day)).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Mon–Fri between from and to, inclusive, minus holidays. O(days); a range is at most a year. */
export function workingDaysBetween(
  from: Day,
  to: Day,
  holidays: ReadonlySet<Day> = new Set(),
): number {
  let count = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isWeekend(d) && !holidays.has(d)) count++;
  }
  return count;
}

/** Inclusive ranges overlap iff each starts on or before the other ends. */
export function overlaps(
  a: { from: Day; to: Day },
  b: { from: Day; to: Day },
): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/** Calendar date "now" in a time zone, e.g. todayIn('Asia/Kolkata', new Date()). */
export function todayIn(timeZone: string, now: Date): Day {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
