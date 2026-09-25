import { createRouter, createWebHistory, type RouteRecordRaw, type RouterHistory } from 'vue-router'
import { generateRoomCode, normalizeRoomCode } from './game/roomCode'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/host', redirect: () => ({ name: 'host', params: { room: generateRoomCode() } }) },
  { path: '/host/:room', name: 'host', component: () => import('./views/HostView.vue'), props: roomProps },
  { path: '/board/:room', name: 'board', component: () => import('./views/BoardView.vue'), props: roomProps },
  { path: '/play/:room', name: 'play', component: () => import('./views/PlayerView.vue'), props: roomProps },
  { path: '/editor/:boardId?', name: 'editor', component: () => import('./views/EditorView.vue'), props: true },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({ history, routes })
}

export const router = createAppRouter()

function roomProps(route: { params: Record<string, unknown> }) {
  return { room: normalizeRoomCode(String(route.params.room ?? '')) }
}
