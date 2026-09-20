import crypto from 'node:crypto';
import { isValidColorId } from './colorIds.js';
import { ValidationError, NotFoundError } from './errors.js';
import type { DataFile, Habit } from './types.js';

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
