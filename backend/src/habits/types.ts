export interface Habit {
  id: string;
  name: string;
  createdAt: string; // ISO date, YYYY-MM-DD
  colorId: string;
}

export interface Entry {
  habitId: string;
  date: string; // YYYY-MM-DD; presence = done that day
}

export interface DataFile {
  version: 1;
  habits: Habit[];
  entries: Entry[];
}

// The initial data file for a user with no habits yet.
export function emptyDataFile(): DataFile {
  return { version: 1, habits: [], entries: [] };
}
