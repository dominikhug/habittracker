<script setup lang="ts">
import { onMounted, ref } from 'vue';
import BottomNav from '../components/BottomNav.vue';
import { COLOR_CATALOG, swatchColorFor } from '../colors';
import { useAuth } from '../composables/useAuth';
import { useHabits } from '../composables/useHabits';

const { habits, loading, error, fetchHabits, addHabit, deleteHabit } = useHabits();
const { me, logout } = useAuth();

const newName = ref('');
const newColorId = ref(COLOR_CATALOG[0].id);
const submitting = ref(false);
const confirmingDeleteId = ref<string | null>(null);

onMounted(fetchHabits);

async function handleAdd() {
  const name = newName.value.trim();
  if (!name) return;
  submitting.value = true;
  try {
    const ok = await addHabit(name, newColorId.value);
    if (ok) {
      newName.value = '';
    }
  } finally {
    submitting.value = false;
  }
}

function requestDelete(id: string) {
  confirmingDeleteId.value = id;
}

async function confirmDelete(id: string) {
  const ok = await deleteHabit(id);
  if (ok) {
    confirmingDeleteId.value = null;
  }
}

function cancelDelete() {
  confirmingDeleteId.value = null;
}
</script>

<template>
  <div class="habits-view">
    <h1>Deine Gewohnheiten</h1>

    <p v-if="loading" class="hint">Lädt…</p>
    <p v-if="error" class="error">{{ error }}</p>

    <ul class="habit-list">
      <li v-for="habit in habits" :key="habit.id" class="habit-row">
        <span class="dot" :style="{ background: swatchColorFor(habit.colorId) }"></span>
        <span class="name">{{ habit.name }}</span>
        <template v-if="confirmingDeleteId === habit.id">
          <button type="button" class="confirm-btn" @click="confirmDelete(habit.id)">Löschen?</button>
          <button type="button" class="cancel-btn" @click="cancelDelete">Abbrechen</button>
        </template>
        <button v-else type="button" class="delete-btn" aria-label="Gewohnheit löschen" @click="requestDelete(habit.id)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 7 20 7" />
            <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
            <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
          </svg>
        </button>
      </li>
      <li v-if="!loading && habits.length === 0" class="empty">Noch keine Gewohnheiten angelegt.</li>
    </ul>

    <form class="add-form" @submit.prevent="handleAdd">
      <label for="habit-name">Name</label>
      <input id="habit-name" v-model="newName" type="text" placeholder="z.B. Dankbarkeitstagebuch" maxlength="100" />

      <span class="color-label">Farbe</span>
      <div class="swatches">
        <button
          v-for="color in COLOR_CATALOG"
          :key="color.id"
          type="button"
          class="swatch"
          :aria-pressed="newColorId === color.id"
          :aria-label="color.label"
          :class="{ selected: newColorId === color.id }"
          :style="{ background: swatchColorFor(color.id) }"
          @click="newColorId = color.id"
        />
      </div>

      <button type="submit" class="submit-btn" :disabled="submitting || !newName.trim()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Neue Gewohnheit
      </button>
    </form>

    <div class="account">
      <span v-if="me" class="account-name">Angemeldet als {{ me.name }}</span>
      <button type="button" class="logout-btn" @click="logout">Abmelden</button>
    </div>
  </div>
  <BottomNav active="habits" />
</template>

<style scoped>
.habits-view {
  max-width: 420px;
  margin: 0 auto;
  padding: 28px 24px 100px;
  font-family: inherit;
  color: #2e2b26;
}

h1 {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 700;
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
  list-style: none;
  margin: 0 0 18px;
  padding: 0;
}

.habit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #e6e1d6;
}

.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.name {
  flex-grow: 1;
  font-size: 15px;
  font-weight: 500;
}

.delete-btn,
.confirm-btn,
.cancel-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}

.delete-btn {
  width: 44px;
  height: 44px;
  color: #b7ada0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-btn {
  color: #a13d3d;
  font-weight: 600;
  font-size: 13px;
}

.cancel-btn {
  color: #837d72;
  font-size: 13px;
}

.empty {
  color: #837d72;
  font-size: 14px;
  padding: 8px 0;
}

.add-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #e6e1d6;
}

.add-form label,
.color-label {
  font-size: 12px;
  font-weight: 600;
  color: #837d72;
}

.add-form input {
  padding: 11px 12px;
  border-radius: 10px;
  border: 1px solid #e0dacb;
  font-size: 14px;
  background: #fbfaf7;
  font-family: inherit;
  box-sizing: border-box;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.swatch {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
  padding: 0;
}

.swatch.selected {
  border-color: #2e2b26;
}

.submit-btn {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px;
  border-radius: 12px;
  border: none;
  background: #2e6b63;
  color: #ffffff;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.account {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid #e6e1d6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.account-name {
  font-size: 13px;
  color: #837d72;
}

.logout-btn {
  border: none;
  background: transparent;
  color: #a13d3d;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
}
</style>
