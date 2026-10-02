import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  AerialImportInput,
  AerialLedgerGroup,
  AerialStatusTrace,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

const AERIAL_KEY = 'aerial'
const THREAT_KEY = 'threat'
const AERIAL_TRACE_FIELD = '归档轨迹'

// 航线有固定空域边界，导入时只能选择这些已批复航线。
const ALLOWED_ROUTE_NAMES = ['青石沟左岸-A线', '大坪后缘-B线', '南坡村前-C线', '北坡公路-D线']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

function nowText(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  ].join(' ')
}

function aerialStatusIndex(meta: ModuleMeta, status: string): number {
  return meta.statuses.indexOf(status)
}

function parseAerialTraces(row: EntryRow): AerialStatusTrace[] {
  const raw = row[AERIAL_TRACE_FIELD]
  if (typeof raw !== 'string' || raw.trim() === '') {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (item): item is AerialStatusTrace =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as AerialStatusTrace).at === 'string' &&
        typeof (item as AerialStatusTrace).to === 'string',
    )
  } catch {
    return []
  }
}

function serializeAerialTraces(traces: AerialStatusTrace[]): string {
  return JSON.stringify(traces)
}

// 老记录里已经有什么归档状态就沿用什么状态，只补一条继承说明，不把业务打回第一环。
function normalizeAerialRows(): EntryRow[] {
  const meta = moduleMeta(AERIAL_KEY)
  let changed = false
  const rows = listRows(AERIAL_KEY).map((row) => {
    const traces = parseAerialTraces(row)
    if (traces.length > 0) {
      return row
    }
    changed = true
    const inherited: AerialStatusTrace = {
      at: nowText(),
      from: '',
      to: String(row.status),
      action: '沿用既有归档状态',
      note: '历史记录导入，不回炉',
    }
    return { ...row, [AERIAL_TRACE_FIELD]: serializeAerialTraces([inherited]) }
  })
  if (changed) {
    saveRows(AERIAL_KEY, rows)
  }
  return rows
}

export function getAerialTraces(row: EntryRow): AerialStatusTrace[] {
  return parseAerialTraces(row)
}

export function aerialRouteOptions(): string[] {
  return [...ALLOWED_ROUTE_NAMES]
}

export function threatObjectOptions(): Pick<EntryRow, 'id' | '对象编号' | '对象名称'>[] {
  return listRows(THREAT_KEY).map((row) => ({
    id: row.id,
    对象编号: row.对象编号,
    对象名称: row.对象名称,
  }))
}

export function getAerialStatus(imageId: string): string {
  const matched = listRows(AERIAL_KEY).find(
    (row) => String(row.影像编号 ?? '') === imageId,
  )
  return matched ? String(matched.status) : ''
}

export function listAerialLedger(filters: Record<string, string> = {}): AerialLedgerGroup[] {
  const meta = moduleMeta(AERIAL_KEY)
  const rows = filterRows(normalizeAerialRows(), filters)
  const groups = new Map<string, AerialLedgerGroup>()

  for (const row of rows) {
    const routeName = String(row.航线名称 ?? '未命名航线')
    if (!groups.has(routeName)) {
      groups.set(routeName, { routeName, pending: false, items: [] })
    }
    groups.get(routeName)!.items.push(row)
  }

  const rankOf = (group: AerialLedgerGroup) => {
    const indexes = group.items.map((row) => aerialStatusIndex(meta, String(row.status)))
    const valid = indexes.filter((index) => index >= 0)
    return valid.length ? Math.min(...valid) : meta.statuses.length
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      pending: group.items.some((row) => row.pending),
      items: [...group.items].sort((a, b) => {
        const aIndex = aerialStatusIndex(meta, String(a.status))
        const bIndex = aerialStatusIndex(meta, String(b.status))
        const aRank = aIndex < 0 ? meta.statuses.length : aIndex
        const bRank = bIndex < 0 ? meta.statuses.length : bIndex
        return aRank - bRank || Number(a.id) - Number(b.id)
      }),
    }))
    .sort((a, b) => rankOf(a) - rankOf(b) || a.routeName.localeCompare(b.routeName, 'zh-Hans-CN'))
}

function splitArchivedImages(value: string): string[] {
  return value
    .split(/[、,，]\s*/)
    .map((item) => item.trim())
    .filter((item) => item !== '' && item !== '—')
}

export function importAerialImage(input: AerialImportInput): ActionResult {
  const meta = moduleMeta(AERIAL_KEY)
  const imageId = input.imageId.trim()
  const routeName = input.routeName.trim()
  const threatObjectId = input.threatObjectId.trim()
  const sortie = Number(input.sortie)
  const pilot = input.pilot?.trim() ?? ''
  const shotDate = input.shotDate?.trim() ?? nowText().slice(0, 10)

  if (imageId === '') {
    return { ok: false, message: '影像编号不能为空' }
  }
  if (imageId.length > 40) {
    return { ok: false, message: '影像编号不能超过 40 个字符' }
  }
  if (!ALLOWED_ROUTE_NAMES.includes(routeName)) {
    return { ok: false, message: '航线名称超出已批复空域边界，已按无效值退回' }
  }
  if (!Number.isInteger(sortie) || sortie <= 0 || sortie > 999) {
    return { ok: false, message: '航拍架次必须是 1 到 999 之间的正整数，不能填负数' }
  }
  if (threatObjectId === '') {
    return { ok: false, message: '请选择受威胁对象编号' }
  }
  const threatRows = listRows(THREAT_KEY)
  const threat = threatRows.find((row) => String(row.对象编号 ?? '') === threatObjectId)
  if (!threat) {
    return { ok: false, message: '受威胁对象台账中没有这个对象编号' }
  }

  const rows = normalizeAerialRows()
  const duplicated = rows.some((row) => String(row.影像编号 ?? '') === imageId)
  if (duplicated) {
    return { ok: false, message: `影像编号 ${imageId} 已导入，不另起记录` }
  }

  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const trace: AerialStatusTrace = {
    at: nowText(),
    from: '',
    to: meta.statuses[0],
    action: '导入航拍任务',
    note: imageId,
  }
  const row: EntryRow = {
    id,
    status: meta.statuses[0],
    pending: true,
    abnormal: false,
    影像编号: imageId,
    航线名称: routeName,
    航拍架次: sortie,
    受威胁对象编号: threatObjectId,
    飞手: pilot,
    拍摄日期: shotDate,
    [AERIAL_TRACE_FIELD]: serializeAerialTraces([trace]),
  }
  saveRows(AERIAL_KEY, [...rows, row])
  return { ok: true, message: `航拍影像任务已导入，当前状态「${meta.statuses[0]}」` }
}

export function runAerialAction(id: number, action: string): ActionResult {
  const meta = moduleMeta(AERIAL_KEY)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }

  const rows = normalizeAerialRows()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }

  const current = String(rows[index].status)
  const currentIndex = aerialStatusIndex(meta, current)
  const targetIndex = aerialStatusIndex(meta, target)
  if (currentIndex < 0) {
    return { ok: false, message: `当前状态「${current}」不在归档环节中，不能流转` }
  }
  // 执行、上传、校核、归档只能逐环前进，越级或回退都在这里挡下。
  if (targetIndex !== currentIndex + 1) {
    return {
      ok: false,
      message: `归档流程只能从「${current}」进入下一环节，不能直接${action}到「${target}」`,
    }
  }

  const traces = parseAerialTraces(rows[index])
  traces.push({
    at: nowText(),
    from: current,
    to: target,
    action,
  })

  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== meta.statuses[meta.statuses.length - 1],
    abnormal: false,
    [AERIAL_TRACE_FIELD]: serializeAerialTraces(traces),
  }

  const nextRows = [...rows]
  nextRows[index] = updated

  if (target === meta.statuses[meta.statuses.length - 1]) {
    const imageId = String(updated.影像编号 ?? '')
    const threatObjectId = String(updated.受威胁对象编号 ?? '')
    const threatRows = listRows(THREAT_KEY)
    const threatIndex = threatRows.findIndex(
      (row) => String(row.对象编号 ?? '') === threatObjectId,
    )
    if (threatIndex < 0) {
      return { ok: false, message: '受威胁对象台账中没有对应对象，暂不能归档' }
    }
    const images = splitArchivedImages(String(threatRows[threatIndex].已归档影像 ?? ''))
    if (!images.includes(imageId)) {
      images.push(imageId)
    }
    const threatRowsNext = [...threatRows]
    threatRowsNext[threatIndex] = {
      ...threatRowsNext[threatIndex],
      已归档影像: images.join('、'),
    }
    saveRows(THREAT_KEY, threatRowsNext)
  }

  saveRows(AERIAL_KEY, nextRows)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
