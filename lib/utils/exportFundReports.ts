import * as XLSX from 'xlsx'
import type { MonthlyCashRoll } from '@/lib/types'
import type { AggregationPeriod } from '@/lib/utils/aggregate'

// V3.9.2: экспорт отчётов фонда в Excel.

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
] as const

function safeFileName(name: string): string {
  return name.replace(/[^\wа-яёА-ЯЁ\s-]/gi, '').trim().replace(/\s+/g, '_')
}

function fmtDate(iso: string | Date | null): string {
  if (!iso) return ''
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

function labelForMode(mode: AggregationPeriod): string {
  switch (mode) {
    case 'monthly':   return 'Помесячно'
    case 'quarterly': return 'Поквартально'
    case 'annual':    return 'Погодно'
  }
}

// ─── Fund Cash Flow (ОДДС) ────────────────────────────────────────────────────

function opCF(r: MonthlyCashRoll): number {
  return r.noiInflow - r.upfrontFeeOutflow - r.managementFeeOutflow
       - r.fundExpensesOutflow - r.successFeeOperationalOutflow - r.successFeeExitOutflow
}
function invCF(r: MonthlyCashRoll): number {
  return r.disposalInflow - r.acquisitionOutflow
}

export function exportFundCashflowReportToExcel(
  items: MonthlyCashRoll[],
  mode: AggregationPeriod,
  fundName: string,
): void {
  if (items.length === 0) return

  type Row = { label: string; values: (number | string)[]; isExpense?: boolean }
  const inv = (b: boolean) => (v: number): number => b ? -v : v

  const rows: Row[] = [
    { label: 'ОПЕРАЦИОННЫЙ ДЕНЕЖНЫЙ ПОТОК', values: items.map(() => '') },
    { label: '  NOI от объектов',         values: items.map(r => r.noiInflow) },
    { label: '  Upfront fee',              isExpense: true, values: items.map(r => inv(true)(r.upfrontFeeOutflow)) },
    { label: '  Management fee',           isExpense: true, values: items.map(r => inv(true)(r.managementFeeOutflow)) },
    { label: '  Fund Level Expenses',      isExpense: true, values: items.map(r => inv(true)(r.fundExpensesOutflow)) },
    { label: '  Success fee операц.',      isExpense: true, values: items.map(r => inv(true)(r.successFeeOperationalOutflow)) },
    { label: '  Success fee выход',        isExpense: true, values: items.map(r => inv(true)(r.successFeeExitOutflow)) },
    { label: 'Итого операционный CF',      values: items.map(r => opCF(r)) },

    { label: 'ИНВЕСТИЦИОННЫЙ ДЕНЕЖНЫЙ ПОТОК', values: items.map(() => '') },
    { label: '  Покупка объектов',         isExpense: true, values: items.map(r => -r.acquisitionOutflow) },
    { label: '  Продажа объектов',         values: items.map(r => r.disposalInflow) },
    { label: 'Итого инвестиционный CF',    values: items.map(r => invCF(r)) },

    { label: 'FCF фонда',                  values: items.map(r => opCF(r) + invCF(r)) },

    { label: 'Выплаты пайщикам',           isExpense: true, values: items.map(r => -r.distributionOutflow) },
    { label: 'Погашение паёв',             isExpense: true, values: items.map(r => -r.redemptionOutflow) },

    { label: 'ФИНАНСОВЫЙ ДЕНЕЖНЫЙ ПОТОК',  values: items.map(() => '') },
    { label: '  Эмиссия',                  values: items.map(r => r.emissionInflow) },
    { label: 'Итого финансовый CF',        values: items.map(r => r.emissionInflow) },
  ]

  const header = ['Показатель', ...items.map(it => periodColumnLabel(it.period, mode))]
  const aoa: unknown[][] = [
    [`Fund Cash Flow — ${fundName}`],
    [`Периодичность: ${labelForMode(mode)}`],
    [],
    header,
    ...rows.map(r => [r.label, ...r.values]),
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 32 }, ...items.map(() => ({ wch: 14 }))]
  XLSX.utils.book_append_sheet(wb, ws, 'Fund Cash Flow')
  XLSX.writeFile(wb, `fund-cashflow_${safeFileName(fundName)}.xlsx`)
}

// ─── Investor Summary ─────────────────────────────────────────────────────────

export type InvestorSummaryRow = {
  year: number
  distributions: number
  cashOnCash: number     // в долях (0.05 = 5%)
  nav: number
  rsp: number
  cumulativeIRR: number  // в долях, 0 если не считается
}

export function exportInvestorSummaryToExcel(
  rows: InvestorSummaryRow[],
  totalDistributions: number,
  finalIRR: number,
  fundName: string,
): void {
  const aoa: unknown[][] = [
    [`Investor Summary — ${fundName}`],
    [],
    ['Год', 'Выплаты пайщикам, ₽', 'Cash on Cash, %', 'NAV, ₽', 'РСП, ₽', 'IRR накопленный, %'],
    ...rows.map(r => [
      r.year,
      Math.round(r.distributions),
      Number((r.cashOnCash * 100).toFixed(2)),
      Math.round(r.nav),
      Math.round(r.rsp),
      r.cumulativeIRR === 0 ? '' : Number((r.cumulativeIRR * 100).toFixed(2)),
    ]),
    [],
    ['Итого', Math.round(totalDistributions), '', '', '', finalIRR === 0 ? '' : Number((finalIRR * 100).toFixed(2))],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 8 }, { wch: 22 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 22 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Investor Summary')
  XLSX.writeFile(wb, `investor_${safeFileName(fundName)}.xlsx`)
}

// ─── Portfolio Overview ───────────────────────────────────────────────────────

export type PortfolioOverviewRow = {
  name: string
  ownershipPct: number
  rentableArea: number
  annualNOI: number
  capRate: number | null   // в долях
  wault: number             // в годах
  marketValue: number       // ₽
  purchaseDate: string | null
  saleDate: string | null
}

export function exportPortfolioOverviewToExcel(
  rows: PortfolioOverviewRow[],
  totals: {
    annualNOI: number
    weightedCapRate: number | null   // в долях
    weightedWault: number             // в годах
    marketValue: number               // ₽
  },
  fundName: string,
): void {
  const aoa: unknown[][] = [
    [`Portfolio Overview — ${fundName}`],
    [],
    [
      'Объект', '% владения', 'Площадь, м²', 'NOI/год, ₽',
      'Cap Rate, %', 'WAULT, лет', 'Стоимость, ₽',
      'Дата покупки', 'Дата продажи',
    ],
    ...rows.map(r => [
      r.name,
      r.ownershipPct,
      r.rentableArea,
      Math.round(r.annualNOI),
      r.capRate === null ? '' : Number((r.capRate * 100).toFixed(2)),
      Number(r.wault.toFixed(2)),
      Math.round(r.marketValue),
      fmtDate(r.purchaseDate),
      fmtDate(r.saleDate),
    ]),
    [],
    [
      'Итого',
      '',
      rows.reduce((s, r) => s + r.rentableArea, 0),
      Math.round(totals.annualNOI),
      totals.weightedCapRate === null ? '' : Number((totals.weightedCapRate * 100).toFixed(2)),
      Number(totals.weightedWault.toFixed(2)),
      Math.round(totals.marketValue),
      '',
      '',
    ],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Portfolio')
  XLSX.writeFile(wb, `portfolio_${safeFileName(fundName)}.xlsx`)
}
