import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from './composables/useAuth';
import DayView from './views/DayView.vue';
import HabitsView from './views/HabitsView.vue';
import LoginView from './views/LoginView.vue';
import WeekView from './views/WeekView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DayView },
    { path: '/week', component: WeekView },
    { path: '/habits', component: HabitsView },
    { path: '/login', component: LoginView },
  ],
});

router.beforeEach(async (to) => {
  const { me, checked, checkAuth } = useAuth();
  if (to.path === '/login') {
    return true;
  }
  if (!checked.value) {
    await checkAuth();
  }
  if (!me.value) {
    return '/login';
  }
  return true;
});

export default router;
