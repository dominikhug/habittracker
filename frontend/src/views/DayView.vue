<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BottomNav from '../components/BottomNav.vue';
import HabitToggleButton from '../components/HabitToggleButton.vue';
import { ApiError, useApi } from '../composables/useApi';
import { localToday } from '../dateUtils';

interface DayHabit {
  habitId: string;
  name: string;
  colorId: string;
  done: boolean;
}

const api = useApi();

const date = ref(localToday());
const habits = ref<DayHabit[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const pendingHabitIds = ref(new Set<string>());

const isToday = computed(() => date.value === localToday());
const dateLabel = computed(() => {
  const formatted = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' }).format(
    new Date(`${date.value}T00:00:00`)
  );
  return isToday.value ? `Heute, ${formatted}` : formatted;
});

// Guards against out-of-order responses when the user navigates dates quickly: only
// the most recently started fetch is allowed to update the visible state.
let fetchEpoch = 0;

async function fetchDay() {
  const epoch = ++fetchEpoch;
  loading.value = true;
  error.value = null;
  try {
    const result = await api.get<{ date: string; habits: DayHabit[] }>(
      `/api/day?date=${encodeURIComponent(date.value)}`
    );
    if (epoch !== fetchEpoch) return; // a newer fetch has since started; drop this one
    habits.value = result.habits;
  } catch (e) {
    if (epoch !== fetchEpoch) return;
    if (e instanceof ApiError && e.status === 401) {
      window.location.href = '/login';
      return;
    }
    error.value = (e as Error).message;
  } finally {
    if (epoch === fetchEpoch) {
      loading.value = false;
    }
  }
}

function shiftDate(deltaDays: number) {
  const d = new Date(`${date.value}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  date.value = d.toLocaleDateString('en-CA');
  fetchDay();
}

function goToday() {
  date.value = localToday();
  fetchDay();
}

async function handleToggle(habit: DayHabit) {
  if (pendingHabitIds.value.has(habit.habitId)) return; // ignore rapid double-taps
  pendingHabitIds.value.add(habit.habitId);

  const previousDone = habit.done;
  habit.done = !previousDone; // optimistic — immediate visual feedback (the "reward" moment)

  const query = `habitId=${encodeURIComponent(habit.habitId)}&date=${encodeURIComponent(date.value)}`;
  try {
    if (habit.done) {
      await api.put(`/api/entries?${query}`);
    } else {
      await api.delete(`/api/entries?${query}`);
    }
  } catch (e) {
    habit.done = previousDone; // roll back on failure
    if (e instanceof ApiError && e.status === 401) {
      window.location.href = '/login';
      return;
    }
    error.value = (e as Error).message;
  } finally {
    pendingHabitIds.value.delete(habit.habitId);
  }
}

onMounted(fetchDay);
</script>

<template>
  <div class="day-view">
    <div class="date-nav">
      <button type="button" class="nav-arrow" aria-label="Vorheriger Tag" @click="shiftDate(-1)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 6 9 12 15 18" />
        </svg>
      </button>
      <button type="button" class="date-label" @click="!isToday && goToday()">
        {{ dateLabel }}
      </button>
      <button
        type="button"
        class="nav-arrow"
        aria-label="Nächster Tag"
        :disabled="isToday"
        @click="shiftDate(1)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
    </div>

    <p v-if="loading" class="hint">Lädt…</p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="habit-list">
      <HabitToggleButton
        v-for="habit in habits"
        :key="habit.habitId"
        :name="habit.name"
        :color-id="habit.colorId"
        :done="habit.done"
        :disabled="pendingHabitIds.has(habit.habitId)"
        @toggle="handleToggle(habit)"
      />
      <p v-if="!loading && habits.length === 0" class="empty">
        Noch keine Gewohnheiten für diesen Tag. Leg welche unter "Verwalten" an.
      </p>
    </div>
  </div>
  <BottomNav active="day" />
</template>

<style scoped>
.day-view {
  max-width: 420px;
  margin: 0 auto;
  padding: 20px 24px 100px;
}

.date-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 20px;
}

.nav-arrow {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: #2e2b26;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.nav-arrow:disabled {
  color: #c9c4b7;
  cursor: default;
}

.date-label {
  font-size: 16px;
  font-weight: 600;
  border: none;
  background: transparent;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
}

.hint {
  color: #837d72;
  font-size: 14px;
}

.error {
  color: #a13d3d;
  font-size: 14px;
}

.habit-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty {
  color: #837d72;
  font-size: 14px;
}
</style>
