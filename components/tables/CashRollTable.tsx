'use client'

import type { MonthlyCashRoll, Trace } from '@/lib/types'
import { periodTitle, TRACE_CELL_CLS, useCellDoubleClick } from '../useCellDoubleClick'

// ─── Типы строк ───────────────────────────────────────────────────────────────

// V4.5.3: только числовые поля (исключаем period и опциональные *Trace).
// `-?` снимает optional, чтобы условный тип не схлопывался в never.
type NumericKey = {
  [K in keyof MonthlyCashRoll]-?: MonthlyCashRoll[K] extends number ? K : never
}[keyof MonthlyCashRoll]

// V4.9.2: ключи trace-полей в MonthlyCashRoll.
type TraceKey = {
  [K in keyof MonthlyCashRoll]-?: MonthlyCashRoll[K] extends Trace | undefined ? K : never
}[keyof MonthlyCashRoll]

type DataRow = {
  type: 'data'
  key: NumericKey
  label: string
  isExpense: boolean   // true → raw ≥ 0, отображать со знаком минус
  separator?: boolean
  bold?: boolean
  highlight?: boolean  // true → красный фон при отрицательном cashBegin/cashEnd
  traceKey?: TraceKey  // V4.9.2: имя поля с Trace, если есть
}

type SectionRow = {
  type: 'section'
  label: string
}

type RowDef = DataRow | SectionRow

// ─── Конфигурация строк ───────────────────────────────────────────────────────

const ROWS: readonly RowDef[] = [
  { type: 'data',    key: 'cashBegin',                    label: 'Кэш начало',             isExpense: false, separator: true, bold: true, highlight: true },
  { type: 'section', label: 'Притоки' },
  { type: 'data',    key: 'noiInflow',                    label: 'NOI от объектов',        isExpense: false, traceKey: 'noiInflowTrace' },
  { type: 'data',    key: 'disposalInflow',               label: 'Продажи объектов',       isExpense: false, traceKey: 'disposalInflowTrace' },
  { type: 'data',    key: 'emissionInflow',               label: 'Привлечение капитала',   isExpense: false, separator: true, traceKey: 'emissionInflowTrace' },
  { type: 'section', label: 'Оттоки' },
  { type: 'data',    key: 'acquisitionOutflow',           label: 'Покупки объектов',       isExpense: true, traceKey: 'acquisitionOutflowTrace' },
  { type: 'data',    key: 'upfrontFeeOutflow',            label: 'Upfront fee',            isExpense: true, traceKey: 'upfrontFeeOutflowTrace' },
  { type: 'data',    key: 'managementFeeOutflow',         label: 'Вознаграждение УК',      isExpense: true, traceKey: 'managementFeeOutflowTrace' },
  { type: 'data',    key: 'fundExpensesOutflow',          label: 'Расходы фонда',          isExpense: true, traceKey: 'fundExpensesOutflowTrace' },
  { type: 'data',    key: 'successFeeOperationalOutflow', label: 'Success fee (операц.)',  isExpense: true, traceKey: 'successFeeOperationalOutflowTrace' },
  { type: 'data',    key: 'successFeeExitOutflow',        label: 'Success fee (выход)',    isExpense: true, traceKey: 'successFeeExitOutflowTrace' },
  { type: 'data',    key: 'debtServiceOutflow',           label: 'Обслуживание долга',     isExpense: true },
  { type: 'data',    key: 'distributionOutflow',          label: 'Выплаты пайщикам',      isExpense: true, separator: true, traceKey: 'distributionOutflowTrace' },
  { type: 'data',    key: 'cashEnd',                      label: 'Кэш конец',             isExpense: false, bold: true, highlight: true },
]

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

  if (abs === 0) return { text: '—', className: 'text-gray-300' }

  let text: string
  if (abs >= 1_000_000_000) text = `${(value / 1_000_000_000).toFixed(1)} млрд`
  else if (abs >= 1_000_000) text = `${(value / 1_000_000).toFixed(1)} млн`
  else if (abs >= 1_000) text = `${Math.round(value / 1_000)} тыс`
  else text = Math.round(value).toLocaleString('ru-RU')

  return { text, className: value < 0 ? 'text-red-500' : 'text-gray-800' }
}

function formatHighlight(raw: number): string {
  const abs = Math.abs(raw)
  if (abs === 0) return '0'
  if (abs >= 1_000_000_000) return `${(raw / 1_000_000_000).toFixed(1)} млрд`
  if (abs >= 1_000_000) return `${(raw / 1_000_000).toFixed(1)} млн`
  if (abs >= 1_000) return `${Math.round(raw / 1_000)} тыс`
  return Math.round(raw).toLocaleString('ru-RU')
}

type YearGroup = { year: number; count: number }

function groupByYear(rows: MonthlyCashRoll[]): YearGroup[] {
  const map = new Map<number, number>()
  for (const r of rows) {
    map.set(r.period.year, (map.get(r.period.year) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, count]) => ({ year, count }))
}

// ─── Компонент ────────────────────────────────────────────────────────────────

type Props = {
  data: MonthlyCashRoll[]
}

export function CashRollTable({ data }: Props) {
  // V4.9.2: трассировка по двойному клику.
  const { open, modal } = useCellDoubleClick()

  if (data.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-8 text-center">
        Нет данных для отображения
      </div>
    )
  }

  const yearGroups = groupByYear(data)

  return (
    <>
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="text-sm border-collapse min-w-full">

        {/* ── Шапка ── */}
        <thead>
          {/* Строка годов */}
          <tr className="bg-gray-50 border-b border-gray-200">
            <th
              className="sticky left-0 z-20 bg-gray-50 px-4 py-2 text-left text-xs font-medium text-gray-400 min-w-[190px] border-r border-gray-200"
              rowSpan={2}
            >
              Показатель
            </th>
            {yearGroups.map(({ year, count }) => (
              <th
                key={year}
                colSpan={count}
                className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-r border-gray-100 last:border-r-0"
              >
                {year}
              </th>
            ))}
          </tr>

          {/* Строка месяцев */}
          <tr className="bg-gray-50 border-b border-gray-200">
            {data.map((row, idx) => (
              <th
                key={idx}
                className="px-3 py-1.5 text-center text-xs font-medium text-gray-400 whitespace-nowrap min-w-[68px] border-r border-gray-100 last:border-r-0"
              >
                {monthLabel(row.period.month)}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Тело ── */}
        <tbody>
          {ROWS.map((rowDef, rowIdx) => {

            /* Строка-секция (ПРИТОКИ / ОТТОКИ) */
            if (rowDef.type === 'section') {
              return (
                <tr key={`section-${rowIdx}`}>
                  <td className="sticky left-0 z-10 bg-gray-100 px-4 py-1 text-left text-xs font-semibold text-gray-500 tracking-wide border-r border-gray-200">
                    {rowDef.label.toUpperCase()}
                  </td>
                  <td colSpan={data.length} className="bg-gray-100" />
                </tr>
              )
            }

            /* Строка с данными */
            const { key, label, isExpense, separator, bold, highlight, traceKey } = rowDef

            return (
              <tr
                key={key}
                className={[
                  'bg-white',
                  separator ? 'border-b-2 border-gray-200' : 'border-b border-gray-100',
                ].join(' ')}
              >
                {/* Метка — sticky */}
                <td
                  className={[
                    'sticky left-0 z-10 bg-white px-4 py-2 text-left text-xs whitespace-nowrap border-r border-gray-200',
                    bold ? 'font-semibold text-gray-900' : 'text-gray-600',
                  ].join(' ')}
                >
                  {label}
                </td>

                {/* Ячейки по месяцам */}
                {data.map((roll, cfIdx) => {
                  const raw = roll[key]
                  const trace = traceKey ? roll[traceKey] : undefined
                  const traceProps = trace
                    ? { onDoubleClick: () => open(trace, periodTitle(label, roll.period)), className: TRACE_CELL_CLS }
                    : { onDoubleClick: undefined, className: '' }

                  /* Кассовый разрыв: cashBegin / cashEnd < 0 — красный фон */
                  if (highlight && raw < 0) {
                    return (
                      <td
                        key={cfIdx}
                        onDoubleClick={traceProps.onDoubleClick}
                        className={[
                          'px-3 py-2 text-right whitespace-nowrap tabular-nums border-r border-gray-100 last:border-r-0',
                          'bg-red-50 text-red-600',
                          bold ? 'font-semibold' : 'font-medium',
                          traceProps.className,
                        ].join(' ')}
                      >
                        {formatHighlight(raw)}
                      </td>
                    )
                  }

                  const { text, className } = formatCell(raw, isExpense)
                  return (
                    <td
                      key={cfIdx}
                      onDoubleClick={traceProps.onDoubleClick}
                      className={[
                        'px-3 py-2 text-right whitespace-nowrap tabular-nums border-r border-gray-100 last:border-r-0',
                        bold ? 'font-semibold' : '',
                        className,
                        traceProps.className,
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
