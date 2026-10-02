<template>
  <section class="page" data-module="aerial">
    <header class="page-head">
      <div>
        <h2>航拍影像任务归档台账</h2>
        <p class="page-desc">汛前排查无人机航拍按航线名称归组，航拍架次、影像编号、归档状态一账可查；执行、上传、校核、归档依次流转，归档后落到受威胁对象台账。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出台账清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
      <span class="legend-item legend-tip">环节只能依次流转，越级操作会被挡下</span>
    </p>

    <form class="import-panel" @submit.prevent="submitImport">
      <h3 class="import-title">导入航拍影像</h3>
      <div class="import-grid">
        <label class="filter-item">
          <span>影像编号 *</span>
          <input v-model="form.影像编号" placeholder="如 IMG-A01-003" />
        </label>
        <label class="filter-item">
          <span>航线名称 *</span>
          <input v-model="form.航线名称" list="aerial-route-options" placeholder="青石沟1号航线" />
          <datalist id="aerial-route-options">
            <option v-for="route in validRoutes" :key="route" :value="route" />
          </datalist>
        </label>
        <label class="filter-item">
          <span>航拍架次 *（正整数）</span>
          <input v-model="form.航拍架次" type="number" min="1" step="1" placeholder="如 1" />
        </label>
        <label class="filter-item">
          <span>受威胁对象</span>
          <input v-model="form.受威胁对象" placeholder="对象编号，如 THRE-0001" />
        </label>
        <label class="filter-item">
          <span>飞手</span>
          <input v-model="form.飞手" placeholder="飞手姓名" />
        </label>
        <label class="filter-item">
          <span>航拍日期</span>
          <input v-model="form.航拍日期" type="date" />
        </label>
      </div>
      <div class="import-foot">
        <button class="btn primary" type="submit">导入本批影像</button>
        <span class="import-hint">同一影像编号重复导入不另起记录，沿用既有归档状态</span>
      </div>
    </form>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div v-for="group in groups" :key="group.route" class="route-group" :class="{ 'route-pending': group.pending }">
      <h3 class="route-head">
        <span class="route-name">{{ group.route }}</span>
        <span class="route-meta">共 {{ group.rows.length}} 架次</span>
        <span v-if="group.pending" class="route-flag">含未入库任务，置顶</span>
        <span v-else class="route-flag route-done">已全部归档</span>
      </h3>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ column }}</th>
            <th>当前归档状态</th>
            <th>状态痕迹</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in group.rows" :key="String(row.id)">
            <td v-for="column in columns" :key="column">{{ display(row, column) }}</td>
            <td>
              <span class="status-pill" :class="statusClass(row.status)">{{ row.status }}</span>
            </td>
            <td class="trail-cell">
              <details>
                <summary>{{ trail(row).length }} 次变更</summary>
                <ol class="trail-list">
                  <li v-for="(line, i) in trail(row)" :key="i">{{ line }}</li>
                </ol>
              </details>
            </td>
            <td class="row-actions">
              <template v-if="nextAction(row) as string">
                <button class="link" type="button" @click="runAction(String(nextAction(row)), row)">
                  {{ nextAction(row) }}
                </button>
              </template>
              <span v-else class="muted-text">流程已闭合</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!groups.length" class="data-table empty-state" style="padding: 16px">暂无符合条件的航拍影像任务，可先在上方导入</p>

    <footer class="page-foot">
      <span>共 {{ total }} 条航拍影像任务 · 归档状态以本台账为准，受威胁对象台账同步读取</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-else-if="noticeMessage" class="ok-text">{{ noticeMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  downloadEntries,
  importAerialTask,
  listAerialGroups,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { AerialGroup, AerialImportInput } from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('aerial')
const columns = ['影像编号', '航拍架次', '受威胁对象', '飞手', '航拍日期', '校核人', '归档日期']
const filterFields = ['航线名称', '影像编号', '受威胁对象']
const actions = meta.actions
const statuses = meta.statuses
const validRoutes = ['青石沟1号航线', '石板坡2号航线', '老鸦岩3号航线']

const groups = ref<AerialGroup[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const today = new Date().toISOString().slice(0, 10)
const form = reactive<AerialImportInput>({
  影像编号: '',
  航线名称: '',
  航拍架次: '',
  受威胁对象: '',
  飞手: '',
  航拍日期: today,
})

const allRows = computed(() => groups.value.flatMap((group) => group.rows))
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: allRows.value.filter((row) => String(row.status) === status).length,
  })),
)
const stats = computed(() => {
  const rows = allRows.value
  return [
    { label: '执行中任务', value: rows.filter((row) => row.pending).length },
    { label: '已归档影像', value: rows.filter((row) => row.status === '已归档').length },
    { label: '航拍架次合计', value: rows.reduce((sum, row) => sum + Number(row['航拍架次'] || 0), 0) },
  ]
})

function trail(row: EntryRow): string[] {
  const value = row['状态痕迹']
  return Array.isArray(value) ? value : []
}

function display(row: EntryRow, column: string): string {
  const value = row[column]
  if (column === '校核人' && !value) {
    return '—'
  }
  if (column === '归档日期' && !value) {
    return '未入库'
  }
  return value === '' || value === undefined || value === null ? '—' : String(value)
}

function statusClass(status: string | number | boolean | string[] | undefined): string {
  return `status-${String(status)}`
}

// 页面只提示下一个环节的动作；即便被绕过发起，服务层也会再挡一次越级流转。
function nextAction(row: EntryRow): string | null {
  const index = statuses.indexOf(String(row.status))
  if (index < 0 || index >= actions.length) {
    return null
  }
  return actions[index]
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function submitImport() {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = importAerialTask({ ...form })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  form.影像编号 = ''
  form.受威胁对象 = ''
  reload()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listAerialGroups(filters.value)
    groups.value = payload
    total.value = payload.reduce((sum, group) => sum + group.rows.length, 0)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '航拍台账读取失败'
  }
}

onMounted(reload)
</script>
