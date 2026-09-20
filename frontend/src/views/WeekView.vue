<script setup lang="ts">
import BottomNav from '../components/BottomNav.vue';
</script>

<template>
  <div class="week-view">
    <p class="hint">Wochen-Ansicht folgt in M5.</p>
  </div>
  <BottomNav active="week" />
</template>

<style scoped>
.week-view {
  max-width: 420px;
  margin: 0 auto;
  padding: 28px 24px 100px;
}
.hint {
  color: #837d72;
  font-size: 14px;
}
</style>
