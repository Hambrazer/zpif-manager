'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
// ─── Тип данных ───────────────────────────────────────────────────────────────

export type ReturnPoint = {
  year: number
  cashOnCash: number   // доля (0.085 = 8.5%) — доход от выплат пайщикам
  capitalGain: number  // доля (0.032 = 3.2%) — прирост стоимости пая
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatAxisTick(value: number): string {
  return `${(Number(value) * 100).toFixed(0)}%`
}

// ─── Кастомный тултип ─────────────────────────────────────────────────────────

type TooltipPayload = { dataKey?: string; value?: number }
type CustomTooltipProps = { active?: boolean; payload?: TooltipPayload[]; label?: string | number }

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const coc = payload.find(p => p.dataKey === 'cashOnCash')?.value ?? 0
  const cg  = payload.find(p => p.dataKey === 'capitalGain')?.value ?? 0
  const total = coc + cg

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-1.5">{label} год</p>
      <div className="space-y-0.5">
        <p style={{ color: '#3b82f6' }}>
          Cash on Cash:&nbsp;<span className="font-medium">{fmtPct(coc)}</span>
        </p>
        <p style={{ color: '#10b981' }}>
          Capital gain:&nbsp;<span className="font-medium">{fmtPct(cg)}</span>
        </p>
      </div>
      <p className="font-semibold text-gray-800 mt-1.5 pt-1.5 border-t border-gray-100">
        Итого:&nbsp;{fmtPct(total)}
      </p>
    </div>
  )
}

// ─── Компонент ────────────────────────────────────────────────────────────────

type Props = {
  data: ReturnPoint[]
  height?: number
}

export function ReturnChart({ data, height = 280 }: Props) {
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <YAxis
          tickFormatter={formatAxisTick}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
        <Legend
          formatter={(name: string) =>
            name === 'cashOnCash' ? 'Cash on Cash' : 'Capital gain'
          }
          iconType="square"
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar
          dataKey="cashOnCash"
          name="cashOnCash"
          stackId="return"
          fill="#3b82f6"
          opacity={0.85}
          radius={[0, 0, 0, 0]}
          maxBarSize={48}
        />
        <Bar
          dataKey="capitalGain"
          name="capitalGain"
          stackId="return"
          fill="#10b981"
          opacity={0.85}
          radius={[3, 3, 0, 0]}
          maxBarSize={48}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
