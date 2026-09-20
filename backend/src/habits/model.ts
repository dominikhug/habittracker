import crypto from 'node:crypto';
import { addDaysIso } from '../util/dates.js';
import { isValidColorId } from './colorIds.js';
import { ValidationError, NotFoundError } from './errors.js';
import type { DataFile, Habit } from './types.js';

export interface DayHabit {
  habitId: string;
  name: string;
  colorId: string;
  done: boolean;
}

export interface WeekDay {
  date: string;
  done: boolean;
}

export interface WeekHabit {
  habitId: string;
  name: string;
  colorId: string;
  daysDone: number;
  daysTotal: number;
  percent: number;
  days: WeekDay[];
}

export interface WeekResult {
  windowStart: string;
  windowEnd: string;
  habits: WeekHabit[];
}

const MAX_NAME_LENGTH = 100;

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ValidationError('name must not be empty');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

function validateColorId(colorId: string): string {
  if (!isValidColorId(colorId)) {
    throw new ValidationError(`invalid colorId: ${colorId}`);
  }
  return colorId;
}

export function addHabit(
  data: DataFile,
  name: string,
  colorId: string,
  createdAt: string
): { data: DataFile; habit: Habit } {
  const habit: Habit = {
    id: crypto.randomUUID(),
    name: validateName(name),
    colorId: validateColorId(colorId),
    createdAt,
  };
  return { data: { ...data, habits: [...data.habits, habit] }, habit };
}

export function updateHabit(
  data: DataFile,
  id: string,
  changes: { name?: string; colorId?: string }
): { data: DataFile; habit: Habit } {
  const index = data.habits.findIndex((h) => h.id === id);
  if (index === -1) {
    throw new NotFoundError(`habit not found: ${id}`);
  }

  const current = data.habits[index];
  const updated: Habit = {
    ...current,
    name: changes.name !== undefined ? validateName(changes.name) : current.name,
    colorId: changes.colorId !== undefined ? validateColorId(changes.colorId) : current.colorId,
  };

  const habits = [...data.habits];
  habits[index] = updated;
  return { data: { ...data, habits }, habit: updated };
}

export function deleteHabit(data: DataFile, id: string): { data: DataFile } {
  if (!data.habits.some((h) => h.id === id)) {
    throw new NotFoundError(`habit not found: ${id}`);
  }
  return {
    data: {
      ...data,
      habits: data.habits.filter((h) => h.id !== id),
      entries: data.entries.filter((e) => e.habitId !== id),
    },
  };
}

// Marks (or unmarks) a habit done for a given day. Idempotent: setting an already-set
// state (or clearing an already-clear one) is a no-op, not an error.
export function setEntryDone(data: DataFile, habitId: string, date: string, done: boolean): { data: DataFile } {
  if (!data.habits.some((h) => h.id === habitId)) {
    throw new NotFoundError(`habit not found: ${habitId}`);
  }

  const exists = data.entries.some((e) => e.habitId === habitId && e.date === date);
  if (done === exists) {
    return { data };
  }

  if (done) {
    return { data: { ...data, entries: [...data.entries, { habitId, date }] } };
  }
  return { data: { ...data, entries: data.entries.filter((e) => !(e.habitId === habitId && e.date === date)) } };
}

// Habits that didn't exist yet on `date` are left out entirely — never shown as
// "missed" for days before they were created (see plan: non-shaming design).
export function getDayView(data: DataFile, date: string): DayHabit[] {
  return data.habits
    .filter((h) => h.createdAt <= date)
    .map((h) => ({
      habitId: h.id,
      name: h.name,
      colorId: h.colorId,
      done: data.entries.some((e) => e.habitId === h.id && e.date === date),
    }));
}

// Rolling 7-day window ending at `endDate` (inclusive). Days before a habit's
// createdAt are left out entirely (never rendered as "missed") — daysTotal shrinks
// accordingly, e.g. a habit created yesterday shows 1/2, never an artificial 1/7.
// This is the concrete mechanism behind the plan's non-shaming design principle.
export function computeWeek(data: DataFile, endDate: string): WeekResult {
  const windowDates: string[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    windowDates.push(addDaysIso(endDate, -offset));
  }
  const windowStart = windowDates[0];
  const windowEnd = windowDates[windowDates.length - 1];

  const habits: WeekHabit[] = data.habits
    .map((h) => {
      const doneDates = new Set(
        data.entries.filter((e) => e.habitId === h.id).map((e) => e.date)
      );
      const days: WeekDay[] = windowDates
        .filter((date) => date >= h.createdAt)
        .map((date) => ({ date, done: doneDates.has(date) }));
      const daysDone = days.filter((d) => d.done).length;
      const daysTotal = days.length;
      const percent = daysTotal === 0 ? 0 : Math.round((daysDone / daysTotal) * 100);
      return { habitId: h.id, name: h.name, colorId: h.colorId, daysDone, daysTotal, percent, days };
    })
    // Same rule as getDayView: a habit whose entire window predates its createdAt
    // (e.g. createdAt clock-skewed slightly into the future) is left out entirely,
    // never shown as an empty "0 von 0" card.
    .filter((h) => h.daysTotal > 0);

  return { windowStart, windowEnd, habits };
}
