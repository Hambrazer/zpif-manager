import * as XLSX from 'xlsx'

type LeaseStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATING'
type IndexationType = 'CPI' | 'FIXED' | 'NONE'

export type ExportLease = {
  tenantName: string
  area: number
  baseRent: number
  startDate: string
  endDate: string
  status: LeaseStatus
  indexationType: IndexationType
  indexationRate: number | null
  vatIncluded: boolean
}

const STATUS_LABELS: Record<LeaseStatus, string> = {
  ACTIVE:      'Активный',
  EXPIRED:     'Истёк',
  TERMINATING: 'Расторгается',
}

const INDEXATION_LABELS: Record<IndexationType, string> = {
  CPI:   'ИПЦ',
  FIXED: 'Фикс.',
  NONE:  'Нет',
}

const STATUS_ORDER: Record<LeaseStatus, number> = {
  ACTIVE: 0, TERMINATING: 1, EXPIRED: 2,
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

export function exportRentRollToExcel(
  leases: ExportLease[],
  rentableArea: number,
  wault: number,
  propertyName: string
): void {
  const sorted = [...leases].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  const totalArea   = sorted.reduce((s, l) => s + l.area, 0)
  const totalIncome = sorted.reduce((s, l) => s + l.area * l.baseRent, 0)
  const avgRent     = totalArea > 0 ? Math.round(totalIncome / totalArea) : 0
  const totalGlaPct = rentableArea > 0 ? Math.round(totalArea / rentableArea * 1000) / 10 : 0
  const waultLabel  = wault > 0 ? `${wault.toFixed(1)} лет` : '—'

  const headers = [
    'Арендатор',
    'Площадь, м²',
    '% GLA',
    'Ставка, ₽/м²/год',
    'Годовой доход, ₽',
    'Начало',
    'Окончание',
    'Статус',
    'Индексация',
  ]

  const rows = sorted.map(l => {
    const glaPct = rentableArea > 0
      ? Math.round(l.area / rentableArea * 1000) / 10
      : 0
    const indexLabel = l.indexationType === 'FIXED' && l.indexationRate !== null
      ? `Фикс. ${(l.indexationRate * 100).toFixed(1)}%`
      : INDEXATION_LABELS[l.indexationType]
    return [
      l.vatIncluded ? `${l.tenantName} (с НДС)` : l.tenantName,
      l.area,
      glaPct,
      l.baseRent,
      Math.round(l.area * l.baseRent),
      fmtDate(l.startDate),
      fmtDate(l.endDate),
      STATUS_LABELS[l.status],
      indexLabel,
    ]
  })

  const aoa: unknown[][] = [
    [`Rent-Roll — ${propertyName}`],
    [`WAULT: ${waultLabel}`],
    [],
    headers,
    ...rows,
    ['Итого', totalArea, totalGlaPct, avgRent, totalIncome, '', '', '', ''],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  ws['!cols'] = [
    { wch: 32 }, // Арендатор
    { wch: 14 }, // Площадь
    { wch: 10 }, // % GLA
    { wch: 18 }, // Ставка
    { wch: 22 }, // Годовой доход
    { wch: 12 }, // Начало
    { wch: 12 }, // Окончание
    { wch: 16 }, // Статус
    { wch: 16 }, // Индексация
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Rent-Roll')

  const safeName = propertyName.replace(/[^\wа-яёА-ЯЁ\s-]/gi, '').trim().replace(/\s+/g, '_')
  XLSX.writeFile(wb, `rent-roll_${safeName}.xlsx`)
}
