<script setup lang="ts">
import { colorFor } from '../colors';

const props = defineProps<{
  colorId: string;
  days: { date: string; done: boolean }[];
}>();
</script>

<template>
  <div class="week-bar">
    <div v-if="props.days.length < 7" class="spacer" :style="{ gridColumn: `1 / ${8 - props.days.length}` }" />
    <div
      v-for="day in props.days"
      :key="day.date"
      class="segment"
      :style="{ background: colorFor(colorId, day.done) }"
    />
  </div>
</template>

<style scoped>
.week-bar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}

.segment {
  height: 36px;
  border-radius: 10px;
}
</style>
