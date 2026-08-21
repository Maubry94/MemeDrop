import { createRouter, createWebHistory } from 'vue-router'
import GuideView from './pages/GuideView.vue'
import HealthView from './pages/HealthView.vue'
import HomeView from './pages/HomeView.vue'
import OAuthResultView from './pages/OAuthResultView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: 'MemeDrop — Des memes de Discord à ton écran' },
    },
    {
      path: '/guide',
      name: 'guide',
      component: GuideView,
      meta: { title: "Guide d'utilisation — MemeDrop" },
    },
    {
      path: '/health',
      name: 'health',
      component: HealthView,
      meta: { title: 'État des services — MemeDrop' },
    },
    {
      path: '/oauth-result',
      name: 'oauth-result',
      component: OAuthResultView,
      meta: { title: 'Connexion Discord — MemeDrop', standalone: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  document.title = typeof to.meta.title === 'string' ? to.meta.title : 'MemeDrop'
})

export default router
