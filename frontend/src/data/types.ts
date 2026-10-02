/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type AerialStatusTrace = {
  at: string
  from: string
  to: string
  action: string
  note?: string
}

export type AerialImportInput = {
  imageId: string
  routeName: string
  sortie: number | string
  threatObjectId: string
  pilot?: string
  shotDate?: string
}

export type AerialLedgerGroup = {
  routeName: string
  pending: boolean
  items: EntryRow[]
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
