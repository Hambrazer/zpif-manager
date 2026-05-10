'use client'

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { MonthlyCashflow } from '@/lib/types'

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
] as const

type ChartPoint = {
  label: string
  noi: number
  fcf: number
}

type Props = {
  cashflows: MonthlyCashflow[]
  height?: number
}

function formatAxisTick(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} млрд`
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)} тыс`
  return value.toFixed(0)
}

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

function periodLabel(year: number, month: number): string {
  const name = MONTHS_SHORT[month - 1] ?? String(month)
  const yearShort = String(year).slice(-2)
  return `${name}'${yearShort}`
}

function xAxisInterval(count: number): number {
  if (count <= 24) return 0
  if (count <= 60) return 11
  return 23
}

export function CashflowChart({ cashflows, height = 320 }: Props) {
  if (cashflows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-sm"
        style={{ height }}
      >
        Нет данных для отображения
      </div>
    )
  }

  const data: ChartPoint[] = cashflows.map(cf => ({
    label: periodLabel(cf.period.year, cf.period.month),
    noi: Math.round(cf.noi),
    fcf: Math.round(cf.fcf),
  }))

  const interval = xAxisInterval(data.length)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          interval={interval}
        />
        <YAxis
          tickFormatter={formatAxisTick}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          width={68}
        />
        <Tooltip
          formatter={(value, name) => [
            typeof value === 'number' ? rubFormatter.format(value) : String(value),
            name === 'noi' ? 'NOI' : 'FCF',
          ]}
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        />
        <Legend
          formatter={(name: string) => (name === 'noi' ? 'NOI' : 'FCF')}
          iconType="square"
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar
          dataKey="noi"
          name="noi"
          fill="#3b82f6"
          opacity={0.8}
          radius={[2, 2, 0, 0]}
          maxBarSize={24}
        />
        <Line
          dataKey="fcf"
          name="fcf"
          type="monotone"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
