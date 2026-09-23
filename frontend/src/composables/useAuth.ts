import { ref } from 'vue';
import { ApiError, useApi } from './useApi';

interface Me {
  uid: string;
  name: string;
}

const me = ref<Me | null>(null);
const checked = ref(false);
const api = useApi();

// Fetches the current session's user via /api/me. Returns false (without throwing) on a
// 401 — any other error propagates.
async function checkAuth(): Promise<boolean> {
  try {
    me.value = await api.get<Me>('/api/me');
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      me.value = null;
      return false;
    }
    throw e;
  } finally {
    checked.value = true;
  }
}

// Ends the session on the backend and sends the browser to the login page.
async function logout() {
  await api.post('/api/auth/logout');
  me.value = null;
  window.location.href = '/login';
}

// Shared (module-level) login-session state: who's logged in, whether that's been
// checked yet, plus actions to check and to log out.
export function useAuth() {
  return { me, checked, checkAuth, logout };
}
