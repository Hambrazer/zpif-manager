'use client'

import type { MonthlyCashflow, MonthlyCashRoll, MonthlyPeriod } from '@/lib/types'

// ─── Типы ────────────────────────────────────────────────────────────────────

type RowKind = 'sectionHeader' | 'data' | 'subtotal'

type RowSpec<T> = {
  key: string
  kind: RowKind
  label: string
  bold?: boolean
  colored?: boolean      // зелёный +/красный − для итоговых строк
  indent?: boolean
  isExpense?: boolean    // визуально инвертировать знак
  separator?: boolean
  getValue?: (item: T, idx: number, all: readonly T[]) => number
}

export type CashflowTableVariant = 'property' | 'fund'

// V3.9.1: периодичность колонок таблицы. По умолчанию 'monthly' — поведение
// прежнее (метка = название месяца). 'quarterly' даёт Q1/Q2/Q3/Q4 как метку
// колонки внутри года; 'annual' прячет помесячные метки.
export type CashflowTablePeriodicity = 'monthly' | 'quarterly' | 'annual'

type Props =
  | { variant?: 'property'; cashflows: MonthlyCashflow[]; periodicity?: CashflowTablePeriodicity }
  | { variant: 'fund'; cashRoll: MonthlyCashRoll[]; periodicity?: CashflowTablePeriodicity }

// ─── Конфигурация строк фонда (ОДДС) ─────────────────────────────────────────

function operationalCF(r: MonthlyCashRoll): number {
  return r.noiInflow
       - r.upfrontFeeOutflow
       - r.managementFeeOutflow
       - r.fundExpensesOutflow
       - r.successFeeOperationalOutflow
       - r.successFeeExitOutflow
}

function investingCF(r: MonthlyCashRoll): number {
  return r.disposalInflow - r.acquisitionOutflow
}

function fundFCF(r: MonthlyCashRoll): number {
  return operationalCF(r) + investingCF(r)
}

function investorCF(r: MonthlyCashRoll, idx: number, all: readonly MonthlyCashRoll[]): number {
  if (idx === 0)               return -(r.emissionInflow + r.upfrontFeeOutflow)
  if (idx === all.length - 1)  return r.distributionOutflow + r.redemptionOutflow
  return r.distributionOutflow
}

const FUND_ROWS: readonly RowSpec<MonthlyCashRoll>[] = [
  { key: 'sec-op',    kind: 'sectionHeader', label: 'ОПЕРАЦИОННЫЙ ДЕНЕЖНЫЙ ПОТОК' },
  { key: 'noi',       kind: 'data', label: 'NOI от объектов',     indent: true, getValue: r => r.noiInflow },
  { key: 'upfront',   kind: 'data', label: 'Upfront fee',          indent: true, isExpense: true, getValue: r => r.upfrontFeeOutflow },
  { key: 'mgmt',      kind: 'data', label: 'Management fee',       indent: true, isExpense: true, getValue: r => r.managementFeeOutflow },
  { key: 'fundExp',   kind: 'data', label: 'Fund Level Expenses',  indent: true, isExpense: true, getValue: r => r.fundExpensesOutflow },
  { key: 'sfOper',    kind: 'data', label: 'Success fee операц.',  indent: true, isExpense: true, getValue: r => r.successFeeOperationalOutflow },
  { key: 'sfExit',    kind: 'data', label: 'Success fee выход',    indent: true, isExpense: true, getValue: r => r.successFeeExitOutflow },
  { key: 'opTotal',   kind: 'subtotal', label: 'Итого операционный CF', bold: true, separator: true, getValue: r => operationalCF(r) },

  { key: 'sec-inv',   kind: 'sectionHeader', label: 'ИНВЕСТИЦИОННЫЙ ДЕНЕЖНЫЙ ПОТОК' },
  { key: 'acq',       kind: 'data', label: 'Покупка объектов',     indent: true, isExpense: true, getValue: r => r.acquisitionOutflow },
  { key: 'disp',      kind: 'data', label: 'Продажа объектов',     indent: true, getValue: r => r.disposalInflow },
  { key: 'invTotal',  kind: 'subtotal', label: 'Итого инвестиционный CF', bold: true, separator: true, getValue: r => investingCF(r) },

  { key: 'fundFCF',   kind: 'subtotal', label: 'FCF фонда', bold: true, colored: true, separator: true, getValue: r => fundFCF(r) },

  { key: 'dist',       kind: 'data', label: 'Выплаты пайщикам',  isExpense: true, getValue: r => r.distributionOutflow },
  { key: 'redemption', kind: 'data', label: 'Погашение паёв',     isExpense: true, separator: true, getValue: r => r.redemptionOutflow },

  { key: 'sec-fin',   kind: 'sectionHeader', label: 'ФИНАНСОВЫЙ ДЕНЕЖНЫЙ ПОТОК' },
  { key: 'emission',  kind: 'data', label: 'Эмиссия', indent: true, getValue: r => r.emissionInflow },
  { key: 'finTotal',  kind: 'subtotal', label: 'Итого финансовый CF', bold: true, separator: true, getValue: r => r.emissionInflow },

  { key: 'sec-icf',   kind: 'sectionHeader', label: 'ДЕНЕЖНЫЙ ПОТОК ИНВЕСТОРА' },
  { key: 'icfRow',    kind: 'subtotal', label: 'Поток инвестора', bold: true, colored: true, getValue: investorCF },
]

// ─── Динамические строки объекта ─────────────────────────────────────────────

function buildPropertyRows(cashflows: readonly MonthlyCashflow[]): RowSpec<MonthlyCashflow>[] {
  const tenantMap = new Map<string, string>()
  for (const cf of cashflows) {
    for (const t of cf.tenants) {
      if (!tenantMap.has(t.tenantId)) tenantMap.set(t.tenantId, t.tenantName)
    }
  }
  const tenants = Array.from(tenantMap.entries())

  const sumRent = (cf: MonthlyCashflow): number =>
    cf.tenants.reduce((s, t) => s + t.rentIncome, 0)
  const sumOpexReimb = (cf: MonthlyCashflow): number =>
    cf.tenants.reduce((s, t) => s + t.opexReimbursement, 0)
  const sumExpenses = (cf: MonthlyCashflow): number =>
    cf.opex + cf.propertyTax + cf.landTax + cf.maintenance + cf.capex

  const rentChildren: RowSpec<MonthlyCashflow>[] = tenants.map(([id, name]) => ({
    key: `rent-${id}`,
    kind: 'data',
    label: name,
    indent: true,
    getValue: cf => cf.tenants.find(t => t.tenantId === id)?.rentIncome ?? 0,
  }))
  const opexReimbChildren: RowSpec<MonthlyCashflow>[] = tenants.map(([id, name]) => ({
    key: `opexreimb-${id}`,
    kind: 'data',
    label: name,
    indent: true,
    getValue: cf => cf.tenants.find(t => t.tenantId === id)?.opexReimbursement ?? 0,
  }))

  return [
    { key: 'sec-income',       kind: 'sectionHeader', label: 'ДОХОДЫ' },
    { key: 'rent-parent',      kind: 'subtotal', label: 'Аренда',          bold: true, getValue: sumRent },
    ...rentChildren,
    { key: 'opexreimb-parent', kind: 'subtotal', label: 'Возмещение OPEX', bold: true, getValue: sumOpexReimb },
    ...opexReimbChildren,
    { key: 'total-income',     kind: 'subtotal', label: 'Итого доходы',    bold: true, separator: true,
      getValue: cf => sumRent(cf) + sumOpexReimb(cf) },

    { key: 'sec-expenses',     kind: 'sectionHeader', label: 'РАСХОДЫ' },
    { key: 'opex',             kind: 'data', label: 'OPEX',               isExpense: true, getValue: cf => cf.opex },
    { key: 'propertyTax',      kind: 'data', label: 'Налог на имущество', isExpense: true, getValue: cf => cf.propertyTax },
    { key: 'landTax',          kind: 'data', label: 'Налог на ЗУ',        isExpense: true, getValue: cf => cf.landTax },
    { key: 'maintenance',      kind: 'data', label: 'Эксплуатация',       isExpense: true, getValue: cf => cf.maintenance },
    { key: 'capex',            kind: 'data', label: 'CAPEX',              isExpense: true, getValue: cf => cf.capex },
    { key: 'total-expenses',   kind: 'subtotal', label: 'Итого расходы',  bold: true, isExpense: true, separator: true,
      getValue: sumExpenses },

    { key: 'noi', kind: 'subtotal', label: 'NOI', bold: true, colored: true, getValue: cf => cf.noi },
    { key: 'fcf', kind: 'subtotal', label: 'FCF', bold: true, colored: true, separator: true, getValue: cf => cf.fcf },
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

function periodCellLabel(month: number, periodicity: CashflowTablePeriodicity): string {
  switch (periodicity) {
    case 'monthly':   return monthLabel(month)
    case 'quarterly': return `Q${Math.ceil(month / 3)}`
    case 'annual':    return 'год'
  }
}

type CellDisplay = {
  text: string
  className: string
}

function formatCell(raw: number, isExpense: boolean, colored: boolean): CellDisplay {
  const value = isExpense ? -raw : raw
  const abs = Math.abs(raw)

  if (abs === 0) {
    return { text: '—', className: 'text-gray-300' }
  }

  let text: string
  if (abs >= 1_000_000_000) {
    text = `${(value / 1_000_000_000).toFixed(1)} млрд`
  } else if (abs >= 1_000_000) {
    text = `${(value / 1_000_000).toFixed(1)} млн`
  } else if (abs >= 1_000) {
    text = `${Math.round(value / 1_000)} тыс`
  } else {
    text = Math.round(value).toLocaleString('ru-RU')
  }

  const className = colored
    ? (value < 0 ? 'text-red-600' : 'text-emerald-600')
    : (value < 0 ? 'text-red-500' : 'text-gray-800')
  return { text, className }
}

// ─── Группировка периодов по годам ───────────────────────────────────────────

type YearGroup = {
  year: number
  indices: number[]
}

function groupByYear(items: readonly { period: MonthlyPeriod }[]): YearGroup[] {
  const map = new Map<number, number[]>()
  items.forEach((item, idx) => {
    const list = map.get(item.period.year)
    if (list !== undefined) {
      list.push(idx)
    } else {
      map.set(item.period.year, [idx])
    }
  })
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, indices]) => ({ year, indices }))
}

// ─── Generic-таблица ─────────────────────────────────────────────────────────

type TableProps<T extends { period: MonthlyPeriod }> = {
  items: readonly T[]
  rows: readonly RowSpec<T>[]
  periodicity?: CashflowTablePeriodicity
}

function TableInner<T extends { period: MonthlyPeriod }>({ items, rows, periodicity = 'monthly' }: TableProps<T>) {
  const yearGroups = groupByYear(items)

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="text-sm border-collapse min-w-full">
        {/* ── Шапка ── */}
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th
              className="sticky left-0 z-20 bg-gray-50 px-4 py-2 text-left text-xs font-medium text-gray-400 min-w-[220px] border-r border-gray-200"
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
          <tr className="bg-gray-50 border-b border-gray-200">
            {items.map((it, idx) => (
              <th
                key={idx}
                className="px-3 py-1.5 text-center text-xs font-medium text-gray-400 whitespace-nowrap min-w-[68px] border-r border-gray-100 last:border-r-0"
              >
                {periodCellLabel(it.period.month, periodicity)}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Тело ── */}
        <tbody>
          {rows.map((row, rowIdx) => {
            if (row.kind === 'sectionHeader') {
              return (
                <tr key={row.key} className="bg-gray-100 border-b border-gray-200">
                  <td className="sticky left-0 z-10 bg-gray-100 px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap border-r border-gray-200">
                    {row.label}
                  </td>
                  {items.map((_, idx) => (
                    <td
                      key={idx}
                      className="px-3 py-1.5 bg-gray-100 border-r border-gray-100 last:border-r-0"
                    />
                  ))}
                </tr>
              )
            }

            const stripeBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
            return (
              <tr
                key={row.key}
                className={[
                  stripeBg,
                  row.separator ? 'border-b-2 border-gray-200' : 'border-b border-gray-100',
                ].join(' ')}
              >
                <td
                  className={[
                    'sticky left-0 z-10 px-4 py-2 text-left text-xs whitespace-nowrap border-r border-gray-200',
                    stripeBg,
                    row.bold ? 'font-semibold text-gray-900' : 'text-gray-600',
                    row.indent ? 'pl-8' : '',
                  ].join(' ')}
                >
                  {row.label}
                </td>
                {items.map((it, cfIdx) => {
                  const raw = row.getValue ? row.getValue(it, cfIdx, items) : 0
                  const { text, className } = formatCell(raw, !!row.isExpense, !!row.colored)
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Публичный компонент ─────────────────────────────────────────────────────

export function CashflowTable(props: Props) {
  const periodicity = props.periodicity ?? 'monthly'

  if (props.variant === 'fund') {
    if (props.cashRoll.length === 0) {
      return <div className="text-sm text-gray-400 py-8 text-center">Нет данных для отображения</div>
    }
    return <TableInner items={props.cashRoll} rows={FUND_ROWS} periodicity={periodicity} />
  }

  if (props.cashflows.length === 0) {
    return <div className="text-sm text-gray-400 py-8 text-center">Нет данных для отображения</div>
  }
  return <TableInner items={props.cashflows} rows={buildPropertyRows(props.cashflows)} periodicity={periodicity} />
}
