import { ref } from 'vue';
import { localToday } from '../dateUtils';
import type { Habit } from '../types';
import { ApiError, useApi } from './useApi';

const habits = ref<Habit[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const api = useApi();

// Shared by every mutating action: on session expiry redirect to /login, otherwise
// surface the message via error.value so the view can show it.
function handleError(e: unknown) {
  if (e instanceof ApiError && e.status === 401) {
    window.location.href = '/login';
    return;
  }
  error.value = (e as Error).message;
}

async function fetchHabits() {
  loading.value = true;
  error.value = null;
  try {
    habits.value = await api.get<Habit[]>('/api/habits');
  } catch (e) {
    handleError(e);
  } finally {
    loading.value = false;
  }
}

async function addHabit(name: string, colorId: string): Promise<boolean> {
  error.value = null;
  try {
    const habit = await api.post<Habit>('/api/habits', { name, colorId, createdAt: localToday() });
    habits.value = [...habits.value, habit];
    return true;
  } catch (e) {
    handleError(e);
    return false;
  }
}

async function renameHabit(id: string, name: string): Promise<boolean> {
  error.value = null;
  try {
    const updated = await api.patch<Habit>(`/api/habits/${id}`, { name });
    habits.value = habits.value.map((h) => (h.id === id ? updated : h));
    return true;
  } catch (e) {
    handleError(e);
    return false;
  }
}

async function deleteHabit(id: string): Promise<boolean> {
  error.value = null;
  try {
    await api.delete(`/api/habits/${id}`);
    habits.value = habits.value.filter((h) => h.id !== id);
    return true;
  } catch (e) {
    handleError(e);
    return false;
  }
}

export function useHabits() {
  return { habits, loading, error, fetchHabits, addHabit, renameHabit, deleteHabit };
}
