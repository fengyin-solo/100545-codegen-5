<template>
  <section class="page" data-module="aerial">
    <header class="page-head">
      <div>
        <h2>航拍影像任务归档台账</h2>
        <p class="page-desc">按航线名称归集航拍架次、影像编号和归档状态；执行、上传、校核、归档逐环流转并保留每次状态痕迹。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="formOpen = !formOpen">
          {{ formOpen ? '收起导入表单' : '导入航拍影像' }}
        </button>
        <button class="btn" type="button" @click="exportRows">导出航拍台账</button>
      </div>
    </header>

    <form v-if="formOpen" class="import-panel" @submit.prevent="submitImport">
      <label>
        <span>影像编号 *</span>
        <input v-model="form.imageId" placeholder="例如 AERI-2026-0101" />
      </label>
      <label>
        <span>航线名称 *</span>
        <select v-model="form.routeName">
          <option value="">请选择已批复航线</option>
          <option v-for="route in routeOptions" :key="route" :value="route">{{ route }}</option>
        </select>
      </label>
      <label>
        <span>航拍架次 *</span>
        <input v-model.number="form.sortie" type="number" min="1" max="999" step="1" />
      </label>
      <label>
        <span>受威胁对象编号 *</span>
        <select v-model="form.threatObjectId">
          <option value="">请选择受威胁对象</option>
          <option v-for="item in threatOptions" :key="String(item.id)" :value="String(item.对象编号)">
            {{ item.对象编号 }}｜{{ item.对象名称 }}
          </option>
        </select>
      </label>
      <label>
        <span>飞手</span>
        <input v-model="form.pilot" placeholder="飞手姓名" />
      </label>
      <label>
        <span>拍摄日期</span>
        <input v-model="form.shotDate" type="date" />
      </label>
      <div class="import-actions">
        <button class="btn primary" type="submit">确认导入</button>
        <button class="btn ghost" type="button" @click="resetForm">清空</button>
      </div>
    </form>

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
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>航线名称</span>
        <input v-model="filters.航线名称" placeholder="按航线名称检索" />
      </label>
      <label class="filter-item">
        <span>影像编号</span>
        <input v-model="filters.影像编号" placeholder="按影像编号检索" />
      </label>
      <label class="filter-item">
        <span>归档状态</span>
        <select v-model="filters.status">
          <option value="">全部</option>
          <option v-for="status in meta.statuses" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <article v-for="group in groups" :key="group.routeName" class="group-card">
      <header class="group-head">
        <h3>{{ group.routeName }}</h3>
        <span :class="['group-badge', group.pending ? 'pending' : 'archived']">
          {{ group.pending ? '含执行中/未入库' : '已入库' }}
        </span>
        <span>{{ group.items.length }} 个影像任务</span>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ column }}</th>
            <th>归档状态</th>
            <th>状态变更痕迹</th>
            <th>流转动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in group.items" :key="String(row.id)">
            <td v-for="column in columns" :key="column">{{ row[column] || '—' }}</td>
            <td><strong>{{ row.status }}</strong></td>
            <td>
              <details class="trace-details">
                <summary>{{ getAerialTraces(row).length }} 条痕迹</summary>
                <ol class="trace-list">
                  <li v-for="(trace, traceIndex) in getAerialTraces(row)" :key="traceIndex">
                    <span>{{ trace.at }}</span>
                    <em>{{ trace.from ? trace.from + ' → ' + trace.to : trace.to }}</em>
                    <strong>{{ trace.action }}</strong>
                    <small v-if="trace.note">{{ trace.note }}</small>
                  </li>
                </ol>
              </details>
            </td>
            <td class="row-actions">
              <button
                v-if="nextAction(row)"
                class="link"
                type="button"
                @click="runRowAction(nextAction(row)!, row)"
              >
                {{ nextAction(row) }}
              </button>
              <span v-else class="muted-text">流程已完成</span>
            </td>
          </tr>
        </tbody>
      </table>
    </article>

    <div v-if="!groups.length" class="data-table empty-block">暂无符合条件的航拍影像任务</div>

    <footer class="page-foot">
      <span>共 {{ total }} 条航拍影像任务，未入库航线排在最前</span>
      <span v-if="message" :class="message.ok ? 'success-text' : 'error-text'">{{ message.text }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  aerialRouteOptions,
  downloadEntries,
  getAerialTraces,
  importAerialImage,
  listAerialLedger,
  moduleMeta,
  runAerialAction,
  threatObjectOptions,
} from '@/api/local-service'
import type { AerialImportInput, AerialLedgerGroup, EntryRow } from '@/data/types'

const meta = moduleMeta('aerial')
const columns = meta.fields.filter((field) => field !== '归档轨迹')
const routeOptions = aerialRouteOptions()
const threatOptions = threatObjectOptions()

const groups = ref<AerialLedgerGroup[]>([])
const filters = ref<Record<string, string>>({ 航线名称: '', 影像编号: '', status: '' })
const formOpen = ref(true)
const message = ref<{ ok: boolean; text: string } | null>(null)

function emptyForm(): AerialImportInput {
  return {
    imageId: '',
    routeName: '',
    sortie: '',
    threatObjectId: '',
    pilot: '',
    shotDate: '',
  }
}

const form = reactive<AerialImportInput>(emptyForm())

const allRows = computed(() => groups.value.flatMap((group) => group.items))
const total = computed(() => allRows.value.length)
const stats = computed(() => [
  { label: '执行中任务', value: allRows.value.filter((row) => row.status === '执行中').length },
  { label: '待入库任务', value: allRows.value.filter((row) => row.pending).length },
  { label: '已归档影像', value: allRows.value.filter((row) => row.status === '已归档').length },
  {
    label: '航拍架次合计',
    value: allRows.value.reduce((sum, row) => sum + Number(row.航拍架次 || 0), 0),
  },
])
const statusSummary = computed(() =>
  meta.statuses.map((status) => ({
    status,
    count: allRows.value.filter((row) => String(row.status) === status).length,
  })),
)

function nextAction(row: EntryRow): string | null {
  const index = meta.statuses.indexOf(String(row.status))
  return index >= 0 && index < meta.actions.length ? meta.actions[index] : null
}

function resetFilters() {
  filters.value = { 航线名称: '', 影像编号: '', status: '' }
  reload()
}

function resetForm() {
  Object.assign(form, emptyForm())
}

function exportRows() {
  downloadEntries(meta.key)
}

function submitImport() {
  message.value = null
  const result = importAerialImage({ ...form })
  message.value = { ok: result.ok, text: result.message }
  if (!result.ok) {
    return
  }
  resetForm()
  reload()
}

function runRowAction(action: string, row: EntryRow) {
  message.value = null
  const result = runAerialAction(Number(row.id), action)
  message.value = { ok: result.ok, text: result.message }
  if (result.ok) {
    reload()
  }
}

function reload() {
  const activeFilters = Object.fromEntries(
    Object.entries(filters.value).filter(([, value]) => value.trim() !== ''),
  )
  groups.value = listAerialLedger(activeFilters)
}

onMounted(reload)
</script>
