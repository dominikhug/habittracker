<script setup lang="ts">
import { onMounted, ref } from 'vue';
import BottomNav from '../components/BottomNav.vue';
import WeekBar from '../components/WeekBar.vue';
import { ApiError, useApi } from '../composables/useApi';
import { localToday } from '../dateUtils';

interface WeekHabit {
  habitId: string;
  name: string;
  colorId: string;
  daysDone: number;
  daysTotal: number;
  percent: number;
  days: { date: string; done: boolean }[];
}

const api = useApi();
const habits = ref<WeekHabit[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function fetchWeek() {
  loading.value = true;
  error.value = null;
  try {
    const result = await api.get<{ habits: WeekHabit[] }>(`/api/weekly?date=${encodeURIComponent(localToday())}`);
    habits.value = result.habits;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      window.location.href = '/login';
      return;
    }
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchWeek);
</script>

<template>
  <div class="week-view">
    <h1>Letzte 7 Tage</h1>
    <p class="subtitle">Ein gleitendes Fenster — eine Lücke wirft dich nicht zurück auf null.</p>

    <p v-if="loading" class="hint">Lädt…</p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="habit-blocks">
      <div v-for="habit in habits" :key="habit.habitId" class="habit-block">
        <div class="habit-header">
          <span class="name">{{ habit.name }}</span>
          <span class="fraction">{{ habit.daysDone }} von {{ habit.daysTotal }}</span>
        </div>
        <WeekBar :color-id="habit.colorId" :days="habit.days" />
      </div>
      <p v-if="!loading && habits.length === 0" class="empty">
        Noch keine Gewohnheiten angelegt.
      </p>
    </div>
  </div>
  <BottomNav active="week" />
</template>

<style scoped>
.week-view {
  max-width: 420px;
  margin: 0 auto;
  padding: 28px 24px 100px;
}

h1 {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 4px;
}

.subtitle {
  font-size: 13px;
  color: #837d72;
  margin-bottom: 20px;
}

.hint {
  color: #837d72;
  font-size: 14px;
}

.error {
  color: #a13d3d;
  font-size: 14px;
}

.habit-blocks {
  display: flex;
  flex-direction: column;
  gap: 26px;
}

.habit-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.name {
  font-size: 15px;
  font-weight: 600;
}

.fraction {
  font-size: 13px;
  color: #837d72;
}

.empty {
  color: #837d72;
  font-size: 14px;
}
</style>
