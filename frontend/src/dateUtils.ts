// Local calendar date (not UTC) — matters wherever "today" is sent to the backend
// (createdAt on habit creation, /api/day, /api/weekly), so a habit isn't mis-dated
// relative to the user's own "today" near midnight.
export function localToday(): string {
  return new Date().toLocaleDateString('en-CA');
}
