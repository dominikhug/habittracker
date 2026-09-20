import { ref } from 'vue';
import { ApiError, useApi } from './useApi';

interface Me {
  uid: string;
  name: string;
}

const me = ref<Me | null>(null);
const checked = ref(false);
const api = useApi();

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

async function logout() {
  await api.post('/api/auth/logout');
  me.value = null;
  window.location.href = '/login';
}

export function useAuth() {
  return { me, checked, checkAuth, logout };
}
