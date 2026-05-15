import * as XLSX from 'xlsx'
import type { MonthlyCashflow } from '@/lib/types'
import type { AggregationPeriod } from '@/lib/utils/aggregate'

// V3.9.1: экспорт отчётов объекта в Excel через xlsx.

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
] as const

function safeFileName(name: string): string {
  return name.replace(/[^\wа-яёА-ЯЁ\s-]/gi, '').trim().replace(/\s+/g, '_')
}

function fmtDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

function periodColumnLabel(p: { year: number; month: number }, mode: AggregationPeriod): string {
  switch (mode) {
    case 'monthly':   return `${MONTHS_SHORT[p.month - 1] ?? p.month} ${p.year}`
    case 'quarterly': return `Q${Math.ceil(p.month / 3)} ${p.year}`
    case 'annual':    return String(p.year)
  }
}

// ─── Cash Flow Detail ─────────────────────────────────────────────────────────

export function exportCashflowReportToExcel(
  items: MonthlyCashflow[],
  mode: AggregationPeriod,
  propertyName: string,
): void {
  if (items.length === 0) return

  // Собираем уникальных арендаторов по всему окну
  const tenantMap = new Map<string, string>()
  for (const cf of items) {
    for (const t of cf.tenants) {
      if (!tenantMap.has(t.tenantId)) tenantMap.set(t.tenantId, t.tenantName)
    }
  }
  const tenants = Array.from(tenantMap.entries())

  type Row = {
    label: string
    values: number[]
    isExpense?: boolean
    indent?: boolean
  }

  const sumRent     = (cf: MonthlyCashflow): number => cf.tenants.reduce((s, t) => s + t.rentIncome, 0)
  const sumOpex     = (cf: MonthlyCashflow): number => cf.tenants.reduce((s, t) => s + t.opexReimbursement, 0)
  const sumExpenses = (cf: MonthlyCashflow): number =>
    cf.opex + cf.propertyTax + cf.landTax + cf.maintenance + cf.capex

  const rows: Row[] = [
    { label: 'ДОХОДЫ', values: [] },
    { label: 'Аренда',          values: items.map(sumRent) },
    ...tenants.map(([id, name]): Row => ({
      label: name,
      indent: true,
      values: items.map(cf => cf.tenants.find(t => t.tenantId === id)?.rentIncome ?? 0),
    })),
    { label: 'Возмещение OPEX', values: items.map(sumOpex) },
    ...tenants.map(([id, name]): Row => ({
      label: name,
      indent: true,
      values: items.map(cf => cf.tenants.find(t => t.tenantId === id)?.opexReimbursement ?? 0),
    })),
    { label: 'Итого доходы', values: items.map(cf => sumRent(cf) + sumOpex(cf)) },

    { label: 'РАСХОДЫ', values: [] },
    { label: 'OPEX',                isExpense: true, values: items.map(cf => cf.opex) },
    { label: 'Налог на имущество',  isExpense: true, values: items.map(cf => cf.propertyTax) },
    { label: 'Налог на ЗУ',         isExpense: true, values: items.map(cf => cf.landTax) },
    { label: 'Эксплуатация',        isExpense: true, values: items.map(cf => cf.maintenance) },
    { label: 'CAPEX',               isExpense: true, values: items.map(cf => cf.capex) },
    { label: 'Итого расходы',       isExpense: true, values: items.map(sumExpenses) },

    { label: 'NOI', values: items.map(cf => cf.noi) },
    { label: 'FCF', values: items.map(cf => cf.fcf) },
  ]

  const header = ['Показатель', ...items.map(it => periodColumnLabel(it.period, mode))]
  const aoa: unknown[][] = [
    [`Cash Flow Detail — ${propertyName}`],
    [`Периодичность: ${labelForMode(mode)}`],
    [],
    header,
    ...rows.map(r => {
      const label = r.indent ? `  ${r.label}` : r.label
      if (r.values.length === 0) return [label, ...items.map(() => '')]
      return [label, ...r.values.map(v => r.isExpense ? -v : v)]
    }),
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 28 }, ...items.map(() => ({ wch: 14 }))]
  XLSX.utils.book_append_sheet(wb, ws, 'Cash Flow')
  XLSX.writeFile(wb, `cashflow_${safeFileName(propertyName)}.xlsx`)
}

function labelForMode(mode: AggregationPeriod): string {
  switch (mode) {
    case 'monthly':   return 'Помесячно'
    case 'quarterly': return 'Поквартально'
    case 'annual':    return 'Погодно'
  }
}

// ─── Rent Roll ─────────────────────────────────────────────────────────────────

type LeaseStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATING'

export type RentRollRow = {
  tenantName: string
  area: number
  baseRent: number
  opexReimbursementRate: number
  status: LeaseStatus
  startDate: string
  endDate: string
  yearsToExpiry: number
}

const STATUS_LABELS: Record<LeaseStatus, string> = {
  ACTIVE: 'Активный', TERMINATING: 'Расторгается', EXPIRED: 'Истёк',
}

export function exportRentRollReportToExcel(
  rows: RentRollRow[],
  cutoffDate: Date,
  totalArea: number,
  wault: number,
  propertyName: string,
): void {
  const aoa: unknown[][] = [
    [`Rent Roll — ${propertyName}`],
    [`На дату: ${fmtDate(cutoffDate)}`],
    [],
    [
      'Арендатор', 'Площадь, м²', 'Ставка, ₽/м²/год', 'OPEX возм., ₽/м²/год',
      'Статус', 'Начало', 'Окончание', 'Лет до окончания',
    ],
    ...rows.map(r => [
      r.tenantName,
      r.area,
      r.baseRent,
      r.opexReimbursementRate,
      STATUS_LABELS[r.status],
      fmtDate(r.startDate),
      fmtDate(r.endDate),
      r.yearsToExpiry > 0 ? Number(r.yearsToExpiry.toFixed(2)) : 0,
    ]),
    [],
    ['Итого', totalArea, '', '', '', '', '', wault > 0 ? `WAULT: ${wault.toFixed(1)} лет` : ''],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 32 }, { wch: 14 }, { wch: 18 }, { wch: 20 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Rent Roll')
  XLSX.writeFile(wb, `rent-roll_${safeFileName(propertyName)}.xlsx`)
}

// ─── DCF Summary ──────────────────────────────────────────────────────────────

export type DCFSummaryYearRow = {
  year: number
  fcf: number
  discountFactor: number
  discountedFcf: number
}

export type DCFSummaryExport = {
  npv: number
  irr: number
  wacc: number
  projectionYears: number
  terminalValue: number
  yearly: DCFSummaryYearRow[]
}

export function exportDCFSummaryToExcel(data: DCFSummaryExport, propertyName: string): void {
  const aoa: unknown[][] = [
    [`DCF Summary — ${propertyName}`],
    [],
    ['Метрика', 'Значение'],
    ['NPV, ₽',                Math.round(data.npv)],
    ['IRR, %',                Number((data.irr * 100).toFixed(2))],
    ['WACC, %',               Number((data.wacc * 100).toFixed(2))],
    ['Горизонт DCF, лет',     data.projectionYears],
    ['Терминальная стоимость, ₽', Math.round(data.terminalValue)],
    [],
    ['Год', 'FCF, ₽', 'Коэф. дисконт.', 'Дисконт. FCF, ₽'],
    ...data.yearly.map(y => [
      y.year,
      Math.round(y.fcf),
      Number(y.discountFactor.toFixed(4)),
      Math.round(y.discountedFcf),
    ]),
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws, 'DCF Summary')
  XLSX.writeFile(wb, `dcf_${safeFileName(propertyName)}.xlsx`)
}
