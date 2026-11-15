// Calendar days are stored as YYYY-MM-DD strings in Nairobi time so a record made at
// 23:30 EAT belongs to the correct school day.
export function nairobiDay(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
export const isDay = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + 'T00:00:00+03:00'));
export const dayStart = (day: string) => new Date(day + 'T00:00:00+03:00');
export function addDays(day: string, count: number) {
  const date = dayStart(day);
  date.setUTCDate(date.getUTCDate() + count);
  return nairobiDay(date);
}
export function time(value: Date | null | undefined) {
  return value
    ? new Intl.DateTimeFormat('en-KE', {
        timeStyle: 'short',
        timeZone: 'Africa/Nairobi',
      }).format(value)
    : '—';
}
// Combine a school day and an HH:MM entry into an instant (Nairobi has no DST).
export function atTime(day: string, hhmm: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  return new Date(day + 'T' + hhmm + ':00+03:00');
}
export const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
// Monday = 1 ... Sunday = 7. Noon avoids any date-boundary ambiguity.
export function weekdayOf(day: string) {
  return new Date(day + 'T12:00:00+03:00').getUTCDay() || 7;
}
export function nowHHMM(value = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}
