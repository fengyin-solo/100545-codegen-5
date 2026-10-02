import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 航拍归档台账的环节顺序：只能依次往后走，越级在 runAction 里统一挡下。
const AERIAL_KEY = 'aerial'
const AERIAL_STATUSES = ['执行中', '已上传', '已校核', '已归档'] as const
// 受威胁对象台账里由归档影像挂过来的记录，用这个字段回链影像编号，也是去重键。
const LINK_FIELD = '关联影像编号'
// 汛前排查允许执行航拍任务的航线名称：表单填了白名单之外的值按越界整单退回。
const VALID_ROUTE_NAMES = ['青石沟1号航线', '石板坡2号航线', '老鸦岩3号航线']

export type AerialGroup = {
  route: string
  pending: boolean
  rows: EntryRow[]
}

export type AerialImportInput = {
  影像编号: string
  航线名称: string
  航拍架次: string
  受威胁对象?: string
  飞手?: string
  航拍日期?: string
}

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

function statusIndex(meta: ModuleMeta, status: string): number {
  return Math.max(0, meta.statuses.indexOf(status))
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function appendTrail(row: EntryRow, field: string | undefined, line: string): string[] {
  if (!field) {
    return []
  }
  const prev = Array.isArray(row[field]) ? (row[field] as string[]) : []
  return [...prev, line]
}

// 受威胁对象入口读到的归档状态一律以航拍台账为准：归档挂过来的影像行，
// 状态实时从航拍记录派生，避免两个台账各说各话。
function aerialStatusByImage(): Map<string, EntryRow> {
  const map = new Map<string, EntryRow>()
  for (const row of listRows(AERIAL_KEY)) {
    map.set(String(row['影像编号'] ?? ''), row)
  }
  return map
}

// 统一的行读取入口：所有列表、筛选、导出、看板都走这里，保证读到同一份归档状态。
export function effectiveRows(key: string): EntryRow[] {
  const rows = listRows(key)
  if (key !== 'threat') {
    return rows
  }
  const aerial = aerialStatusByImage()
  return rows.map((row) => {
    const imageCode = String(row[LINK_FIELD] ?? '')
    if (!imageCode) {
      return row
    }
    const source = aerial.get(imageCode)
    if (!source) {
      return row
    }
    return {
      ...row,
      status: source.status,
      pending: source.pending,
      abnormal: source.abnormal,
      对象状态: source.status,
    }
  })
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(effectiveRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

// 影像归档后向受威胁对象台账挂一条「已归档影像」；同一影像编号重复归档不重复挂。
function upsertThreatArchive(aerialRow: EntryRow): void {
  const threatRows = listRows('threat')
  const imageCode = String(aerialRow['影像编号'])
  if (threatRows.some((row) => String(row[LINK_FIELD] ?? '') === imageCode)) {
    return
  }
  // 归档时若能指到既有受威胁对象，就把所属隐患点继承过来，保证两边对得上。
  const targetCode = String(aerialRow['受威胁对象'] ?? '').trim()
  const referenced = threatRows.find((row) => String(row['对象编号']) === targetCode)
  const nextId = threatRows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const linked: EntryRow = {
    id: nextId,
    status: '已归档',
    pending: false,
    abnormal: false,
    对象编号: `THRE-AIR-${String(nextId).padStart(4, '0')}`,
    所属隐患点: referenced ? String(referenced['所属隐患点'] ?? '') : '',
    对象类型: '已归档影像',
    对象名称: `航拍影像 ${imageCode}`,
    涉及人数: '',
    最近距离: '',
    联系人: '',
    对象状态: '已归档',
    [LINK_FIELD]: imageCode,
  }
  saveRows('threat', [...threatRows, linked])
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
  // 顺序流转模块：只允许走到当前环节的下一个，跳环节一律挡下。
  if (meta.orderedFlow) {
    const currentIndex = meta.statuses.indexOf(current)
    const targetIndex = meta.statuses.indexOf(target)
    if (currentIndex < 0) {
      return { ok: false, message: `当前状态「${current}」不在归档环节里，不能${action}` }
    }
    if (targetIndex !== currentIndex + 1) {
      const expected = meta.statuses[currentIndex + 1]
      return {
        ok: false,
        message: `归档环节不能越级：当前「${current}」应先流转到「${expected}」，不能直接「${target}」`,
      }
    }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const stamp = nowStamp()
  const trailLine = `${stamp} ${action}：${current} → ${target}`
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  if (meta.trailField) {
    updated[meta.trailField] = appendTrail(rows[index], meta.trailField, trailLine)
  }
  // 归档台账在「确认归档」时补齐归档日期。
  if (key === AERIAL_KEY && target === '已归档') {
    updated['归档日期'] = String(rows[index]['归档日期'] ?? '').trim() || stamp.slice(0, 10)
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  // 归档结果落到受威胁对象台账，由其台账添一条已归档影像。
  if (key === AERIAL_KEY && target === '已归档') {
    upsertThreatArchive(updated)
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

// 航拍架次只收正整数；负数、零、小数、非数字一律按无效值退回。
function parseSorties(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) {
    return null
  }
  const value = Number(text)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

// 导入航拍影像任务：校验通过才建记录；同一影像编号再导一遍不另起记录、状态不回炉。
export function importAerialTask(input: AerialImportInput): ActionResult {
  const meta = moduleMeta(AERIAL_KEY)
  const imageCode = input.影像编号.trim()
  const route = input.航线名称.trim()
  if (!imageCode) {
    return { ok: false, message: '影像编号不能为空，本批导入已退回' }
  }
  if (!VALID_ROUTE_NAMES.includes(route)) {
    return { ok: false, message: `航线名称「${route || '空'}」不在汛前排查航线范围内，按越界值退回` }
  }
  const sorties = parseSorties(input.航拍架次)
  if (sorties === null) {
    return { ok: false, message: `航拍架次「${input.航拍架次.trim() || '空'}」必须是正整数，负数等无效值按整单退回` }
  }
  const rows = listRows(AERIAL_KEY)
  const existed = rows.find((row) => String(row['影像编号']) === imageCode)
  if (existed) {
    return {
      ok: true,
      message: `影像编号 ${imageCode} 已登记在「${existed['航线名称']}」，沿用既有归档状态「${existed.status}」，不另起记录、不回炉`,
    }
  }
  const stamp = nowStamp()
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const initial = AERIAL_STATUSES[0]
  const row: EntryRow = {
    id: nextId,
    status: initial,
    pending: true,
    abnormal: false,
    影像编号: imageCode,
    航线名称: route,
    航拍架次: sorties,
    受威胁对象: input.受威胁对象?.trim() ?? '',
    飞手: input.飞手?.trim() ?? '',
    航拍日期: input.航拍日期?.trim() || stamp.slice(0, 10),
    校核人: '',
    归档日期: '',
    归档状态: initial,
    状态痕迹: [`${stamp} 导入建档，归档状态：${initial}`],
  }
  saveRows(AERIAL_KEY, [...rows, row])
  return { ok: true, message: `影像 ${imageCode} 已导入「${route}」，航拍架次 ${sorties}，初始状态「${initial}」` }
}

// 未入库（非已归档）的排在最前；同组内也按环节先后、编号先后展示。
function comparePendingThenStage(meta: ModuleMeta) {
  return (a: EntryRow, b: EntryRow) => {
    if (a.pending !== b.pending) {
      return a.pending ? -1 : 1
    }
    const stageGap = statusIndex(meta, String(a.status)) - statusIndex(meta, String(b.status))
    if (stageGap !== 0) {
      return stageGap
    }
    return Number(a.id) - Number(b.id)
  }
}

// 按航线名称分组展示，压在执行中还没入库的组排在最前。
export function listAerialGroups(filters: Record<string, string> = {}): AerialGroup[] {
  const meta = moduleMeta(AERIAL_KEY)
  const ordered = filterRows(effectiveRows(AERIAL_KEY), filters).sort(
    comparePendingThenStage(meta),
  )
  const groups: AerialGroup[] = []
  const indexByRoute = new Map<string, number>()
  for (const row of ordered) {
    const route = String(row['航线名称'] ?? '未命名航线')
    let at = indexByRoute.get(route)
    if (at === undefined) {
      at = groups.length
      indexByRoute.set(route, at)
      groups.push({ route, pending: false, rows: [] })
    }
    groups[at].rows.push(row)
    if (row.pending) {
      groups[at].pending = true
    }
  }
  // 组间同样让有未入库任务的航线整体靠前（组内行序保持上面的环节顺序）。
  return groups.sort((a, b) => {
    if (a.pending !== b.pending) {
      return a.pending ? -1 : 1
    }
    return 0
  })
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of effectiveRows(key)) {
    lines.push(
      [row.id, ...meta.fields.map((field) => String(row[field] ?? '')), row.status].join(','),
    )
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
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
    const entries = effectiveRows(meta.key)
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
