'use client'

import type { NAVResult, MonthlyPeriod } from '@/lib/types'

// V4.6.4: иерархическая раскладка СЧА по периодам.
// Раскрытие/сворачивание блока «Стоимость объектов» — в V4.8.

type Props = {
  data: NAVResult[]
  totalUnits: number
}

type PropertyRow = {
  key: string         // propertyId или propertyName
  name: string
}

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
] as const

function monthLabel(month: number): string {
  return MONTHS_SHORT[month - 1] ?? String(month)
}

function formatNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs === 0) return '—'
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} млрд`
  if (abs >= 1_000_000)     return `${(value / 1_000_000).toFixed(1)} млн`
  if (abs >= 1_000)         return `${Math.round(value / 1_000)} тыс`
  return Math.round(value).toLocaleString('ru-RU')
}

function groupByYear(items: { period: MonthlyPeriod }[]): { year: number; count: number }[] {
  const map = new Map<number, number>()
  for (const it of items) map.set(it.period.year, (map.get(it.period.year) ?? 0) + 1)
  return Array.from(map.entries()).sort(([a], [b]) => a - b).map(([year, count]) => ({ year, count }))
}

// Уникальные объекты, появлявшиеся в любом периоде. Ключом служит propertyId,
// если он есть, иначе propertyName — этого достаточно для отрисовки строки.
function collectProperties(data: NAVResult[]): PropertyRow[] {
  const map = new Map<string, PropertyRow>()
  for (const r of data) {
    for (const pv of r.propertyValues ?? []) {
      const key = pv.propertyId ?? pv.propertyName
      if (!map.has(key)) map.set(key, { key, name: pv.propertyName })
    }
  }
  return Array.from(map.values())
}

function findPropertyValue(row: NAVResult, propKey: string): number {
  if (!row.propertyValues) return 0
  const pv = row.propertyValues.find(p => (p.propertyId ?? p.propertyName) === propKey)
  return pv?.value ?? 0
}

export function NAVBreakdownTable({ data, totalUnits }: Props) {
  if (data.length === 0) {
    return <div className="text-sm text-gray-400 py-8 text-center">Нет данных для отображения</div>
  }

  const properties = collectProperties(data)
  const yearGroups = groupByYear(data)

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="text-sm border-collapse min-w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th
              className="sticky left-0 z-20 bg-gray-50 px-4 py-2 text-left text-xs font-medium text-gray-400 min-w-[260px] border-r border-gray-200"
              rowSpan={2}
            >
              Показатель
            </th>
            {yearGroups.map(g => (
              <th
                key={g.year}
                colSpan={g.count}
                className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-r border-gray-100 last:border-r-0"
              >
                {g.year}
              </th>
            ))}
          </tr>
          <tr className="bg-gray-50 border-b border-gray-200">
            {data.map((r, idx) => (
              <th
                key={idx}
                className="px-3 py-1.5 text-center text-xs font-medium text-gray-400 whitespace-nowrap min-w-[68px] border-r border-gray-100 last:border-r-0"
              >
                {monthLabel(r.period.month)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* ── Стоимость объектов (родитель) ── */}
          <Row
            label="Стоимость объектов"
            data={data}
            getValue={r => r.propertyValue}
            bold
          />

          {/* ── Объекты (под-строки) — в V4.8 будут раскрываемы ── */}
          {properties.map(prop => (
            <Row
              key={prop.key}
              label={prop.name}
              data={data}
              getValue={r => findPropertyValue(r, prop.key)}
              indent
            />
          ))}

          {/* ── Кэш фонда / Остаток долга ── */}
          <Row label="+ Кэш фонда"      data={data} getValue={r => r.cash} />
          <Row label="− Остаток долга"  data={data} getValue={r => r.debtBalance} separator />

          {/* ── СЧА (жирный итог) ── */}
          <Row label="СЧА" data={data} getValue={r => r.nav} bold colored />

          {/* ── Количество паёв (статика) и РСП ── */}
          <Row label="Количество паёв" data={data} getValue={() => totalUnits} indent />
          <Row label="РСП" data={data} getValue={r => r.rsp} bold colored />
        </tbody>
      </table>
    </div>
  )
}

// ─── Helper-компонент строки ───────────────────────────────────────────────────

function Row({
  label,
  data,
  getValue,
  bold,
  indent,
  separator,
  colored,
}: {
  label: string
  data: NAVResult[]
  getValue: (r: NAVResult) => number
  bold?: boolean
  indent?: boolean
  separator?: boolean
  colored?: boolean
}) {
  return (
    <tr
      className={[
        'bg-white',
        separator ? 'border-b-2 border-gray-200' : 'border-b border-gray-100',
      ].join(' ')}
    >
      <td
        className={[
          'sticky left-0 z-10 bg-white px-4 py-2 text-left text-xs whitespace-nowrap border-r border-gray-200',
          bold ? 'font-semibold text-gray-900' : 'text-gray-600',
          indent ? 'pl-8' : '',
        ].join(' ')}
      >
        {label}
      </td>
      {data.map((r, idx) => {
        const value = getValue(r)
        const className = colored
          ? (value < 0 ? 'text-red-600' : 'text-emerald-600')
          : (value < 0 ? 'text-red-500' : 'text-gray-800')
        return (
          <td
            key={idx}
            className={[
              'px-3 py-2 text-right whitespace-nowrap tabular-nums border-r border-gray-100 last:border-r-0',
              bold ? 'font-medium' : '',
              className,
              value === 0 ? 'text-gray-300' : '',
            ].join(' ')}
          >
            {formatNumber(value)}
          </td>
        )
      })}
    </tr>
  )
}
