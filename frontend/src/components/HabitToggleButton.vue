<script setup lang="ts">
import { computed } from 'vue';
import { colorFor, textColorFor } from '../colors';

const props = defineProps<{ name: string; colorId: string; done: boolean; disabled?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const bg = computed(() => colorFor(props.colorId, props.done));
const textColor = computed(() => textColorFor(props.done));
const badgeBg = computed(() => (props.done ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)'));
const icon = computed(() => (props.done ? '✓' : '○'));
</script>

<template>
  <button
    type="button"
    class="toggle-button"
    :aria-pressed="done"
    :disabled="disabled"
    :style="{ background: bg, color: textColor }"
    @click="emit('toggle')"
  >
    <span class="badge" :style="{ background: badgeBg }">{{ icon }}</span>
    <span class="name">{{ name }}</span>
  </button>
</template>

<style scoped>
.toggle-button {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px 18px;
  border-radius: 16px;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition:
    background 150ms ease,
    transform 150ms ease;
}

.toggle-button:active {
  transform: scale(0.98);
}

.toggle-button:disabled {
  opacity: 0.7;
  cursor: default;
}

.badge {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
}

.name {
  flex-grow: 1;
  font-weight: 600;
  font-size: 16px;
}
</style>
