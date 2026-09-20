<script setup lang="ts">
import BottomNav from '../components/BottomNav.vue';
</script>

<template>
  <div class="day-view">
    <p class="hint">Tages-Ansicht folgt in M4.</p>
  </div>
  <BottomNav active="day" />
</template>

<style scoped>
.day-view {
  max-width: 420px;
  margin: 0 auto;
  padding: 28px 24px 100px;
}
.hint {
  color: #837d72;
  font-size: 14px;
}
</style>
