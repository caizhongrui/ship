import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/engine'
  },
  {
    path: '/engine',
    name: 'engine',
    meta: { title: '主机监测', icon: 'engine' },
    component: () => import('@/views/EngineMonitor.vue')
  },
  {
    path: '/power',
    name: 'power',
    meta: { title: '电站控制', icon: 'power' },
    component: () => import('@/views/PowerStation.vue')
  },
  {
    path: '/aux',
    name: 'aux',
    meta: { title: '辅助系统', icon: 'aux', highlight: true },
    component: () => import('@/views/AuxSystems.vue')
  },
  {
    path: '/shaft',
    name: 'shaft',
    meta: { title: '轴系监测', icon: 'shaft' },
    component: () => import('@/views/ShaftMonitor.vue')
  },
  {
    path: '/alarms',
    name: 'alarms',
    meta: { title: '报警记录', icon: 'alarm' },
    component: () => import('@/views/AlarmLog.vue')
  },
  {
    path: '/trend',
    name: 'trend',
    meta: { title: '曲线查询', icon: 'trend' },
    component: () => import('@/views/TrendQuery.vue')
  },
  {
    path: '/report',
    name: 'report',
    meta: { title: '报表查询', icon: 'report' },
    component: () => import('@/views/ReportQuery.vue')
  },
  {
    path: '/diag',
    name: 'diag',
    meta: { title: '故障诊断', icon: 'diag', highlight: true },
    component: () => import('@/views/FaultDiagnosis.vue')
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
