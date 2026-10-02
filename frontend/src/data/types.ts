/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  // 状态痕迹等字段允许按字符串数组落库，例如归档台账每一次环节流转。
  [field: string]: string | number | boolean | string[]
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
  // 开启后动作只能从当前状态走向 statuses 里的下一个状态，越级流转在服务层挡下。
  orderedFlow?: boolean
  // 配置后每次状态变更都会往该字段追加一条留痕，导入时写第一条。
  trailField?: string
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

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
