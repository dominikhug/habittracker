export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Format check AND real-calendar-date check (rejects e.g. 2026-02-30 — Date silently
// normalizes that to a different date, so a round-trip comparison catches it).
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) {
    return false;
  }
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The server only knows UTC "today", but a client's own local calendar day can be up
// to a day ahead of UTC (any timezone up to UTC+14). Rather than rejecting legitimate
// "today" values for those users, only reject dates clearly beyond any real timezone's
// current day — this is a UX safety net (the frontend already disables navigating
// into the future), not a security boundary.
export function isTooFarInFuture(date: string): boolean {
  return date > addDaysIso(todayIso(), 1);
}
