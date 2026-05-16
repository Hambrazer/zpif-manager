'use client'

import { useState } from 'react'
import type { MonthlyCashflow, MonthlyCashRoll, MonthlyPeriod, Trace } from '@/lib/types'
import { periodTitle, TRACE_CELL_CLS, useCellDoubleClick } from '../useCellDoubleClick'

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
  // V4.8.1 — иерархия и раскрытие
  parent?: string        // ключ родителя; если родитель свёрнут — строка скрыта
  collapsible?: boolean  // у строки есть дети — рендерить кнопку +/-
  // V4.9.2 — трассировка по двойному клику.
  getTrace?: (item: T, idx: number, all: readonly T[]) => Trace | undefined
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

function investorCF(r: MonthlyCashRoll): number {
  // V4.5.3: поле уже посчитано в calcFundCashRoll вместе с trace.
  return r.investorCashflow
}

const FUND_ROWS: readonly RowSpec<MonthlyCashRoll>[] = [
  { key: 'sec-op',    kind: 'sectionHeader', label: 'ОПЕРАЦИОННЫЙ ДЕНЕЖНЫЙ ПОТОК', collapsible: true },
  { key: 'noi',       kind: 'data', label: 'NOI от объектов',     indent: true, parent: 'sec-op', getValue: r => r.noiInflow, getTrace: r => r.noiInflowTrace },
  { key: 'upfront',   kind: 'data', label: 'Upfront fee',          indent: true, parent: 'sec-op', isExpense: true, getValue: r => r.upfrontFeeOutflow, getTrace: r => r.upfrontFeeOutflowTrace },
  { key: 'mgmt',      kind: 'data', label: 'Management fee',       indent: true, parent: 'sec-op', isExpense: true, getValue: r => r.managementFeeOutflow, getTrace: r => r.managementFeeOutflowTrace },
  { key: 'fundExp',   kind: 'data', label: 'Fund Level Expenses',  indent: true, parent: 'sec-op', isExpense: true, getValue: r => r.fundExpensesOutflow, getTrace: r => r.fundExpensesOutflowTrace },
  { key: 'sfOper',    kind: 'data', label: 'Success fee операц.',  indent: true, parent: 'sec-op', isExpense: true, getValue: r => r.successFeeOperationalOutflow, getTrace: r => r.successFeeOperationalOutflowTrace },
  { key: 'sfExit',    kind: 'data', label: 'Success fee выход',    indent: true, parent: 'sec-op', isExpense: true, getValue: r => r.successFeeExitOutflow, getTrace: r => r.successFeeExitOutflowTrace },
  { key: 'opTotal',   kind: 'subtotal', label: 'Итого операционный CF', bold: true, separator: true, getValue: r => operationalCF(r) },

  { key: 'sec-inv',   kind: 'sectionHeader', label: 'ИНВЕСТИЦИОННЫЙ ДЕНЕЖНЫЙ ПОТОК', collapsible: true },
  { key: 'acq',       kind: 'data', label: 'Покупка объектов',     indent: true, parent: 'sec-inv', isExpense: true, getValue: r => r.acquisitionOutflow, getTrace: r => r.acquisitionOutflowTrace },
  { key: 'disp',      kind: 'data', label: 'Продажа объектов',     indent: true, parent: 'sec-inv', getValue: r => r.disposalInflow, getTrace: r => r.disposalInflowTrace },
  { key: 'invTotal',  kind: 'subtotal', label: 'Итого инвестиционный CF', bold: true, separator: true, getValue: r => investingCF(r) },

  { key: 'fundFCF',   kind: 'subtotal', label: 'FCF фонда', bold: true, colored: true, separator: true, getValue: r => fundFCF(r) },

  { key: 'dist',       kind: 'data', label: 'Выплаты пайщикам',  isExpense: true, getValue: r => r.distributionOutflow, getTrace: r => r.distributionOutflowTrace },
  { key: 'redemption', kind: 'data', label: 'Погашение паёв',     isExpense: true, separator: true, getValue: r => r.redemptionOutflow, getTrace: r => r.redemptionOutflowTrace },

  { key: 'sec-fin',   kind: 'sectionHeader', label: 'ФИНАНСОВЫЙ ДЕНЕЖНЫЙ ПОТОК', collapsible: true },
  { key: 'emission',  kind: 'data', label: 'Эмиссия', indent: true, parent: 'sec-fin', getValue: r => r.emissionInflow, getTrace: r => r.emissionInflowTrace },
  { key: 'finTotal',  kind: 'subtotal', label: 'Итого финансовый CF', bold: true, separator: true, getValue: r => r.emissionInflow, getTrace: r => r.emissionInflowTrace },

  { key: 'sec-icf',   kind: 'sectionHeader', label: 'ДЕНЕЖНЫЙ ПОТОК ИНВЕСТОРА' },
  { key: 'icfRow',    kind: 'subtotal', label: 'Поток инвестора', bold: true, colored: true, getValue: investorCF, getTrace: r => r.investorCashflowTrace },
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

  // V4.8.2: tenants — дети «Аренда» / «Возмещение OPEX» (раскрываемых subtotal'ов).
  const rentChildren: RowSpec<MonthlyCashflow>[] = tenants.map(([id, name]) => ({
    key: `rent-${id}`,
    kind: 'data',
    label: name,
    indent: true,
    parent: 'rent-parent',
    getValue: cf => cf.tenants.find(t => t.tenantId === id)?.rentIncome ?? 0,
    getTrace: cf => cf.tenants.find(t => t.tenantId === id)?.rentIncomeTrace,
  }))
  const opexReimbChildren: RowSpec<MonthlyCashflow>[] = tenants.map(([id, name]) => ({
    key: `opexreimb-${id}`,
    kind: 'data',
    label: name,
    indent: true,
    parent: 'opexreimb-parent',
    getValue: cf => cf.tenants.find(t => t.tenantId === id)?.opexReimbursement ?? 0,
    getTrace: cf => cf.tenants.find(t => t.tenantId === id)?.opexReimbursementTrace,
  }))

  return [
    { key: 'sec-income',       kind: 'sectionHeader', label: 'ДОХОДЫ', collapsible: true },
    { key: 'rent-parent',      kind: 'subtotal', label: 'Аренда',          bold: true, parent: 'sec-income', collapsible: rentChildren.length > 0, getValue: sumRent },
    ...rentChildren,
    { key: 'opexreimb-parent', kind: 'subtotal', label: 'Возмещение OPEX', bold: true, parent: 'sec-income', collapsible: opexReimbChildren.length > 0, getValue: sumOpexReimb },
    ...opexReimbChildren,
    { key: 'total-income',     kind: 'subtotal', label: 'Итого доходы',    bold: true, separator: true,
      getValue: cf => sumRent(cf) + sumOpexReimb(cf) },

    { key: 'sec-expenses',     kind: 'sectionHeader', label: 'РАСХОДЫ', collapsible: true },
    { key: 'opex',             kind: 'data', label: 'OPEX',               parent: 'sec-expenses', isExpense: true, getValue: cf => cf.opex,         getTrace: cf => cf.opexTrace },
    { key: 'propertyTax',      kind: 'data', label: 'Налог на имущество', parent: 'sec-expenses', isExpense: true, getValue: cf => cf.propertyTax,  getTrace: cf => cf.propertyTaxTrace },
    { key: 'landTax',          kind: 'data', label: 'Налог на ЗУ',        parent: 'sec-expenses', isExpense: true, getValue: cf => cf.landTax,      getTrace: cf => cf.landTaxTrace },
    { key: 'maintenance',      kind: 'data', label: 'Эксплуатация',       parent: 'sec-expenses', isExpense: true, getValue: cf => cf.maintenance,  getTrace: cf => cf.maintenanceTrace },
    { key: 'capex',            kind: 'data', label: 'CAPEX',              parent: 'sec-expenses', isExpense: true, getValue: cf => cf.capex,        getTrace: cf => cf.capexTrace },
    { key: 'total-expenses',   kind: 'subtotal', label: 'Итого расходы',  bold: true, isExpense: true, separator: true,
      getValue: sumExpenses },

    { key: 'noi', kind: 'subtotal', label: 'NOI', bold: true, colored: true, getValue: cf => cf.noi, getTrace: cf => cf.noiTrace },
    { key: 'fcf', kind: 'subtotal', label: 'FCF', bold: true, colored: true, separator: true, getValue: cf => cf.fcf, getTrace: cf => cf.fcfTrace },
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

// V4.8.1: проверка цепочки parents — если ЛЮБОЙ предок в collapsed, строка скрыта.
function isVisible<T>(
  row: RowSpec<T>,
  rowsByKey: Map<string, RowSpec<T>>,
  collapsed: Set<string>,
): boolean {
  let current = row.parent
  while (current) {
    if (collapsed.has(current)) return false
    current = rowsByKey.get(current)?.parent
  }
  return true
}

function TableInner<T extends { period: MonthlyPeriod }>({ items, rows, periodicity = 'monthly' }: TableProps<T>) {
  const yearGroups = groupByYear(items)
  // V4.8.1: дефолт — всё развёрнуто. Состояние не персистится между сессиями (задача).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // V4.9.2: трассировка по двойному клику.
  const { open, modal } = useCellDoubleClick()

  const rowsByKey = new Map(rows.map(r => [r.key, r]))

  function toggle(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function renderCollapseButton(key: string) {
    const isCollapsed = collapsed.has(key)
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle(key) }}
        className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-gray-500 hover:bg-gray-200"
        aria-label={isCollapsed ? 'Развернуть' : 'Свернуть'}
      >
        {isCollapsed ? '+' : '−'}
      </button>
    )
  }

  return (
    <>
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
            // V4.8.1: скрываем строку, если её предок свёрнут.
            if (!isVisible(row, rowsByKey, collapsed)) return null

            if (row.kind === 'sectionHeader') {
              return (
                <tr key={row.key} className="bg-gray-100 border-b border-gray-200">
                  <td className="sticky left-0 z-10 bg-gray-100 px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap border-r border-gray-200">
                    {row.collapsible && renderCollapseButton(row.key)}
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
                  {row.collapsible && renderCollapseButton(row.key)}
                  {row.label}
                </td>
                {items.map((it, cfIdx) => {
                  const raw = row.getValue ? row.getValue(it, cfIdx, items) : 0
                  const { text, className } = formatCell(raw, !!row.isExpense, !!row.colored)
                  const trace = row.getTrace?.(it, cfIdx, items)
                  return (
                    <td
                      key={cfIdx}
                      onDoubleClick={trace ? () => open(trace, periodTitle(row.label, it.period)) : undefined}
                      className={[
                        'px-3 py-2 text-right whitespace-nowrap tabular-nums border-r border-gray-100 last:border-r-0',
                        row.bold ? 'font-medium' : '',
                        className,
                        trace ? TRACE_CELL_CLS : '',
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
    {modal}
    </>
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
