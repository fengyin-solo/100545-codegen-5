import { createRouter, createWebHistory } from 'vue-router'

import Dashboard from '@/views/Dashboard.vue'
const Hazard = () => import('@/views/hazard/index.vue')
const Slope = () => import('@/views/slope/index.vue')
const Crack = () => import('@/views/crack/index.vue')
const Rain = () => import('@/views/rain/index.vue')
const Warning = () => import('@/views/warning/index.vue')
const Patrol = () => import('@/views/patrol/index.vue')
const Relocate = () => import('@/views/relocate/index.vue')
const Refuge = () => import('@/views/refuge/index.vue')
const Drill = () => import('@/views/drill/index.vue')
const Project = () => import('@/views/project/index.vue')
const Cutting = () => import('@/views/cutting/index.vue')
const Wall = () => import('@/views/wall/index.vue')
const Drainage = () => import('@/views/drainage/index.vue')
const Signboard = () => import('@/views/signboard/index.vue')
const Report = () => import('@/views/report/index.vue')
const Consult = () => import('@/views/consult/index.vue')
const Clearance = () => import('@/views/clearance/index.vue')
const Threat = () => import('@/views/threat/index.vue')
const Aerial = () => import('@/views/aerial/index.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: Dashboard },
    { path: '/hazard', name: 'hazard', component: Hazard },
    { path: '/slope', name: 'slope', component: Slope },
    { path: '/crack', name: 'crack', component: Crack },
    { path: '/rain', name: 'rain', component: Rain },
    { path: '/warning', name: 'warning', component: Warning },
    { path: '/patrol', name: 'patrol', component: Patrol },
    { path: '/relocate', name: 'relocate', component: Relocate },
    { path: '/refuge', name: 'refuge', component: Refuge },
    { path: '/drill', name: 'drill', component: Drill },
    { path: '/project', name: 'project', component: Project },
    { path: '/cutting', name: 'cutting', component: Cutting },
    { path: '/wall', name: 'wall', component: Wall },
    { path: '/drainage', name: 'drainage', component: Drainage },
    { path: '/signboard', name: 'signboard', component: Signboard },
    { path: '/report', name: 'report', component: Report },
    { path: '/consult', name: 'consult', component: Consult },
    { path: '/clearance', name: 'clearance', component: Clearance },
    { path: '/threat', name: 'threat', component: Threat },
    { path: '/aerial', name: 'aerial', component: Aerial },
  ],
})

export default router
