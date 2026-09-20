<script setup lang="ts">
defineProps<{ active: 'day' | 'week' | 'habits' }>();
</script>

<template>
  <nav class="bottom-nav">
    <router-link to="/" class="nav-item" :class="{ active: active === 'day' }">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="8" y1="3" x2="8" y2="7" />
        <line x1="16" y1="3" x2="16" y2="7" />
      </svg>
      <span>Heute</span>
    </router-link>
    <router-link to="/week" class="nav-item" :class="{ active: active === 'week' }">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="19" x2="5" y2="11" />
        <line x1="12" y1="19" x2="12" y2="5" />
        <line x1="19" y1="19" x2="19" y2="14" />
      </svg>
      <span>Woche</span>
    </router-link>
    <router-link to="/habits" class="nav-item" :class="{ active: active === 'habits' }">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="5" width="4" height="4" rx="1" />
        <line x1="11" y1="7" x2="20" y2="7" />
        <rect x="4" y="11" width="4" height="4" rx="1" />
        <line x1="11" y1="13" x2="20" y2="13" />
        <rect x="4" y="17" width="4" height="4" rx="1" />
        <line x1="11" y1="19" x2="20" y2="19" />
      </svg>
      <span>Verwalten</span>
    </router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 14px 12px calc(14px + env(safe-area-inset-bottom));
  background: #f6f4ef;
  border-top: 1px solid #e6e1d6;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #a6a093;
  text-decoration: none;
  font-size: 11px;
  font-weight: 600;
}

.nav-item.active {
  color: #2e6b63;
}
</style>
