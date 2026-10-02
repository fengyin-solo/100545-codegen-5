<template>
  <div class="app-shell">
    <aside class="app-side">
      <h1 class="app-title">山地地质灾害隐患巡查与治理工作台</h1>
      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="app-main">
      <header class="app-head">
        <span class="head-desc">面向隐患点建档、坡体形变与裂缝观测、雨量预警发布、避险搬迁与治理工程验收的山区地质灾害防治工作台。</span>
        <span class="head-user">当前值班：{{ store.operator }} · {{ store.shiftLabel }}</span>
      </header>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()

const navItems = [{ label: "运营概览", path: "/" }, { label: "隐患点建档", path: "/hazard" }, { label: "边坡形变", path: "/slope" }, { label: "裂缝观测", path: "/crack" }, { label: "雨量站网", path: "/rain" }, { label: "预警发布", path: "/warning" }, { label: "群测群防巡查", path: "/patrol" }, { label: "避险搬迁", path: "/relocate" }, { label: "避险场所", path: "/refuge" }, { label: "应急演练", path: "/drill" }, { label: "治理工程", path: "/project" }, { label: "削坡减载", path: "/cutting" }, { label: "支挡结构", path: "/wall" }, { label: "排水系统", path: "/drainage" }, { label: "警示标识", path: "/signboard" }, { label: "险情上报", path: "/report" }, { label: "专家会商", path: "/consult" }, { label: "隐患核销", path: "/clearance" }, { label: "航拍影像任务归档", path: "/aerial" }, { label: "受威胁对象", path: "/threat" }]
</script>
