export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}
