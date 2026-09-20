<script setup lang="ts">
function login() {
  window.location.href = '/api/auth/login';
}
</script>

<template>
  <div class="login-view">
    <div class="logo">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 21V10" />
        <path d="M12 10C12 6 9 4 5 4c0 4 2 7 7 7Z" />
        <path d="M12 13c0-3.5 2.5-5.5 6-5.5 0 3.7-2.2 6.2-6 6.2" />
      </svg>
    </div>
    <h1>HabitTracker</h1>
    <p class="tagline">Kleine Schritte für deine mentale Gesundheit</p>
    <button type="button" class="ms-button" @click="login">
      <svg width="21" height="21" viewBox="0 0 21 21">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>
      Mit Microsoft anmelden
    </button>
    <p class="privacy">Deine Daten bleiben in deinem eigenen OneDrive</p>
  </div>
</template>

<style scoped>
.login-view {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 40px;
  background: #f6f4ef;
  color: #2e2b26;
  text-align: center;
  box-sizing: border-box;
}

.logo {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: #e4ede8;
  color: #2e6b63;
  display: flex;
  align-items: center;
  justify-content: center;
}

h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}

.tagline {
  margin: 0;
  font-size: 14px;
  color: #837d72;
  max-width: 260px;
}

.ms-button {
  width: 100%;
  max-width: 280px;
  height: 41px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 12px;
  border-radius: 4px;
  background: #ffffff;
  border: 1px solid #8c8c8c;
  color: #5e5e5e;
  font-weight: 600;
  font-size: 15px;
  font-family: 'Segoe UI', system-ui, sans-serif;
  cursor: pointer;
}

.privacy {
  margin: 0;
  font-size: 12px;
  color: #a6a093;
}
</style>
