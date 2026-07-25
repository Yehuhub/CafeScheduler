// Week lifecycle by calendar date, shared by server (edit guards) and client
// (show/hide + current-week detection) so the "past" rule can't drift between them.
//
// A week spans [startDate, startDate + 7 days). Israeli convention: startDate is the
// Sunday the week begins. Classification is done at whole-day granularity in UTC —
// startDate is stored as a UTC-midnight Sunday, and the rest of the app formats dates
// in UTC, so we normalize `now` to a UTC day too.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function weekStartDayMs(startDate: string | Date): number {
  return utcDayMs(new Date(startDate));
}

// True once the week has fully elapsed — today is on/after the following Sunday.
// The current week (today still within its 7 days) is NOT past.
export function isPastWeek(startDate: string | Date, now: Date = new Date()): boolean {
  return utcDayMs(now) >= weekStartDayMs(startDate) + 7 * MS_PER_DAY;
}

// True when today falls within the week's 7 days.
export function isCurrentWeek(startDate: string | Date, now: Date = new Date()): boolean {
  const start = weekStartDayMs(startDate);
  const today = utcDayMs(now);
  return today >= start && today < start + 7 * MS_PER_DAY;
}

// The Sunday (UTC midnight) that begins the week containing `date` — used by the
// employee schedule navigator to step ±7 days across the calendar, schedule or not.
export function weekStartOf(date: Date = new Date()): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}
