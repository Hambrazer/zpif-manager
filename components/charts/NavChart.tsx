'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { NAVResult } from '@/lib/types'

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
] as const

function periodLabel(year: number, month: number): string {
  const name = MONTHS_SHORT[month - 1] ?? String(month)
  return `${name}'${String(year).slice(-2)}`
}

function formatAxisTick(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} млрд`
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)} тыс`
  return value.toFixed(0)
}

function xAxisInterval(count: number): number {
  if (count <= 24) return 0
  if (count <= 60) return 11
  return 23
}

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

type Mode = 'nav' | 'rsp'

type Props = {
  data: Pick<NAVResult, 'period' | 'nav' | 'rsp'>[]
  mode?: Mode
  height?: number
}

type ChartPoint = {
  label: string
  value: number
}

export function NavChart({ data, mode: initialMode = 'nav', height = 280 }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-sm"
        style={{ height }}
      >
        Нет данных для отображения
      </div>
    )
  }

  const points: ChartPoint[] = data.map(d => ({
    label: periodLabel(d.period.year, d.period.month),
    value: mode === 'nav' ? Math.round(d.nav) : Math.round(d.rsp),
  }))

  const tooltipLabel = mode === 'nav' ? 'СЧА' : 'РСП'
  const interval = xAxisInterval(points.length)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {(['nav', 'rsp'] as Mode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={[
              'px-3 py-1 rounded-md text-xs font-medium transition-colors',
              mode === m
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            ].join(' ')}
          >
            {m === 'nav' ? 'СЧА' : 'РСП'}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
            width={72}
          />
          <Tooltip
            formatter={(value) => [
              typeof value === 'number' ? rubFormatter.format(value) : String(value),
              tooltipLabel,
            ]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
          />
          <Line
            dataKey="value"
            name={tooltipLabel}
            type="monotone"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
