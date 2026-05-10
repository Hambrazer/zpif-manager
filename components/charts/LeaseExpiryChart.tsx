'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  LabelList,
} from 'recharts'

type LeaseStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATING'

export type LeaseExpiryLease = {
  id: string
  area: number
  endDate: string
  status: LeaseStatus
}

type YearBucket = {
  year: number
  label: string
  area: number
  count: number
}

type Props = {
  leases: LeaseExpiryLease[]
  height?: number
}

function buildChartData(leases: LeaseExpiryLease[]): YearBucket[] {
  const buckets = new Map<number, { area: number; count: number }>()

  for (const lease of leases) {
    if (lease.status === 'EXPIRED') continue
    const year = new Date(lease.endDate).getFullYear()
    const prev = buckets.get(year) ?? { area: 0, count: 0 }
    buckets.set(year, { area: prev.area + lease.area, count: prev.count + 1 })
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, { area, count }]) => ({
      year,
      label: String(year),
      area: Math.round(area),
      count,
    }))
}

// Красный → истекает ≤1 года, оранжевый → 2–3 года, синий → 4+ лет
function barColor(year: number, currentYear: number): string {
  const diff = year - currentYear
  if (diff <= 1) return '#ef4444'
  if (diff <= 3) return '#f97316'
  return '#3b82f6'
}

export function LeaseExpiryChart({ leases, height = 260 }: Props) {
  const currentYear = new Date().getFullYear()
  const data = buildChartData(leases)

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-sm"
        style={{ height }}
      >
        Нет активных договоров для отображения
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <YAxis
          tickFormatter={v => `${Number(v).toLocaleString('ru-RU')} м²`}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          width={80}
        />
        <Tooltip
          formatter={(value) => [
            `${Number(value).toLocaleString('ru-RU')} м²`,
            'Площадь',
          ]}
          labelFormatter={(label) => `${String(label)} год`}
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
          cursor={{ fill: '#f9fafb' }}
        />
        <Bar dataKey="area" radius={[3, 3, 0, 0]} maxBarSize={56}>
          {data.map(entry => (
            <Cell key={entry.year} fill={barColor(entry.year, currentYear)} />
          ))}
          <LabelList
            dataKey="count"
            position="top"
            formatter={(v: unknown) => `${String(v)} дог.`}
            style={{ fontSize: 11, fill: '#6b7280' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
