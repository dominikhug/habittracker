import crypto from 'node:crypto';
import { isValidColorId } from './colorIds.js';
import { ValidationError, NotFoundError } from './errors.js';
import type { DataFile, Habit } from './types.js';

export interface DayHabit {
  habitId: string;
  name: string;
  colorId: string;
  done: boolean;
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
