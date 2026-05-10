'use client'

import type { MonthlyCashflow } from '@/lib/types'

// ─── Типы ────────────────────────────────────────────────────────────────────

type RowSpec = {
  key: string
  label: string
  isExpense: boolean
  bold?: boolean
  separator?: boolean
  indent?: boolean
  getValue: (cf: MonthlyCashflow) => number
}

export type CashflowTableVariant = 'property' | 'fund'

// ─── Конфигурация строк для фонда ────────────────────────────────────────────

const FUND_ROWS: readonly RowSpec[] = [
  { key: 'gri',         label: 'GRI',                  isExpense: false, getValue: cf => cf.gri },
  { key: 'vacancy',     label: 'Вакансия',             isExpense: true,  getValue: cf => cf.vacancy },
  { key: 'nri',         label: 'NRI',                  isExpense: false, separator: true, getValue: cf => cf.nri },
  { key: 'opexReimb',   label: 'Возмещение OPEX',      isExpense: false, getValue: cf => cf.opexReimbursementTotal },
  { key: 'opex',        label: 'OPEX',                 isExpense: true,  getValue: cf => cf.opex },
  { key: 'propertyTax', label: 'Налог на имущество',   isExpense: true,  getValue: cf => cf.propertyTax },
  { key: 'landTax',     label: 'Налог на ЗУ',          isExpense: true,  getValue: cf => cf.landTax },
  { key: 'maintenance', label: 'Эксплуатация',         isExpense: true,  getValue: cf => cf.maintenance },
  { key: 'capex',       label: 'CAPEX',                isExpense: true,  separator: true, getValue: cf => cf.capex },
  { key: 'noi',         label: 'NOI',                  isExpense: false, bold: true, getValue: cf => cf.noi },
  { key: 'fcf',         label: 'FCF',                  isExpense: false, bold: true, separator: true, getValue: cf => cf.fcf },
]

// ─── Динамические строки для объекта ─────────────────────────────────────────

function buildPropertyRows(cashflows: MonthlyCashflow[]): RowSpec[] {
  // Собираем уникальных арендаторов в порядке первого появления
  const tenantMap = new Map<string, string>()
  for (const cf of cashflows) {
    for (const t of cf.tenants) {
      if (!tenantMap.has(t.tenantId)) tenantMap.set(t.tenantId, t.tenantName)
    }
  }

  const tenantRows: RowSpec[] = []
  for (const [id, name] of tenantMap) {
    tenantRows.push({
      key: `t-rent-${id}`,
      label: `${name} — Аренда`,
      isExpense: false,
      indent: true,
      getValue: cf => cf.tenants.find(t => t.tenantId === id)?.rentIncome ?? 0,
    })
    tenantRows.push({
      key: `t-opex-${id}`,
      label: `${name} — Возм. OPEX`,
      isExpense: false,
      indent: true,
      getValue: cf => cf.tenants.find(t => t.tenantId === id)?.opexReimbursement ?? 0,
    })
  }

  return [
    ...tenantRows,
    { key: 'gri',         label: 'GRI',                  isExpense: false, getValue: cf => cf.gri },
    { key: 'vacancy',     label: 'Вакансия',             isExpense: true,  getValue: cf => cf.vacancy },
    { key: 'nri',         label: 'NRI',                  isExpense: false, getValue: cf => cf.nri },
    { key: 'opexReimb',   label: 'Возмещение OPEX',      isExpense: false, separator: true, getValue: cf => cf.opexReimbursementTotal },
    { key: 'opex',        label: 'OPEX',                 isExpense: true,  getValue: cf => cf.opex },
    { key: 'propertyTax', label: 'Налог на имущество',   isExpense: true,  getValue: cf => cf.propertyTax },
    { key: 'landTax',     label: 'Налог на ЗУ',          isExpense: true,  getValue: cf => cf.landTax },
    { key: 'maintenance', label: 'Эксплуатация',         isExpense: true,  getValue: cf => cf.maintenance },
    { key: 'capex',       label: 'CAPEX',                isExpense: true,  separator: true, getValue: cf => cf.capex },
    { key: 'noi',         label: 'NOI',                  isExpense: false, bold: true, getValue: cf => cf.noi },
    { key: 'fcf',         label: 'FCF',                  isExpense: false, bold: true, separator: true, getValue: cf => cf.fcf },
  ]
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
] as const

function monthLabel(month: number): string {
  return MONTHS_SHORT[month - 1] ?? String(month)
}

type CellDisplay = {
  text: string
  className: string
}

function formatCell(raw: number, isExpense: boolean): CellDisplay {
  const value = isExpense ? -raw : raw
  const abs = Math.abs(raw)

  let text: string
  if (abs === 0) {
    return { text: '—', className: 'text-gray-300' }
  } else if (abs >= 1_000_000_000) {
    text = `${(value / 1_000_000_000).toFixed(1)} млрд`
  } else if (abs >= 1_000_000) {
    text = `${(value / 1_000_000).toFixed(1)} млн`
  } else if (abs >= 1_000) {
    text = `${Math.round(value / 1_000)} тыс`
  } else {
    text = Math.round(value).toLocaleString('ru-RU')
  }

  const className = value < 0 ? 'text-red-500' : 'text-gray-800'
  return { text, className }
}

// ─── Группировка периодов по годам ───────────────────────────────────────────

type YearGroup = {
  year: number
  indices: number[]
}

function groupByYear(cashflows: MonthlyCashflow[]): YearGroup[] {
  const map = new Map<number, number[]>()
  cashflows.forEach((cf, idx) => {
    const list = map.get(cf.period.year)
    if (list !== undefined) {
      list.push(idx)
    } else {
      map.set(cf.period.year, [idx])
    }
  })
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, indices]) => ({ year, indices }))
}

// ─── Компонент ────────────────────────────────────────────────────────────────

type Props = {
  cashflows: MonthlyCashflow[]
  variant?: CashflowTableVariant
}

export function CashflowTable({ cashflows, variant = 'property' }: Props) {
  if (cashflows.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-8 text-center">
        Нет данных для отображения
      </div>
    )
  }

  const rows = variant === 'fund' ? FUND_ROWS : buildPropertyRows(cashflows)
  const yearGroups = groupByYear(cashflows)

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="text-sm border-collapse min-w-full">
        {/* ── Шапка ── */}
        <thead>
          {/* Строка годов */}
          <tr className="bg-gray-50 border-b border-gray-200">
            <th
              className="sticky left-0 z-20 bg-gray-50 px-4 py-2 text-left text-xs font-medium text-gray-400 min-w-[200px] border-r border-gray-200"
              rowSpan={2}
            >
              Показатель
            </th>
            {yearGroups.map(({ year, indices }) => (
              <th
                key={year}
                colSpan={indices.length}
                className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-r border-gray-100 last:border-r-0"
              >
                {year}
              </th>
            ))}
          </tr>

          {/* Строка месяцев */}
          <tr className="bg-gray-50 border-b border-gray-200">
            {cashflows.map((cf, idx) => (
              <th
                key={idx}
                className="px-3 py-1.5 text-center text-xs font-medium text-gray-400 whitespace-nowrap min-w-[68px] border-r border-gray-100 last:border-r-0"
              >
                {monthLabel(cf.period.month)}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Тело ── */}
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={row.key}
              className={[
                rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                row.separator ? 'border-b-2 border-gray-200' : 'border-b border-gray-100',
              ].join(' ')}
            >
              {/* Метка строки — sticky */}
              <td
                className={[
                  'sticky left-0 z-10 px-4 py-2 text-left text-xs whitespace-nowrap border-r border-gray-200',
                  rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                  row.bold ? 'font-semibold text-gray-900' : 'text-gray-600',
                  row.indent ? 'pl-7' : '',
                ].join(' ')}
              >
                {row.label}
              </td>

              {/* Данные по месяцам */}
              {cashflows.map((cf, cfIdx) => {
                const raw = row.getValue(cf)
                const { text, className } = formatCell(raw, row.isExpense)
                return (
                  <td
                    key={cfIdx}
                    className={[
                      'px-3 py-2 text-right whitespace-nowrap tabular-nums border-r border-gray-100 last:border-r-0',
                      row.bold ? 'font-medium' : '',
                      className,
                    ].join(' ')}
                  >
                    {text}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
