'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipContentProps, BarShapeProps } from 'recharts'
import { formatDate } from '@/lib/utils/format'

// ─── Типы ────────────────────────────────────────────────────────────────────

type LeaseStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATING'

export type GanttLease = {
  id: string
  tenantName: string
  area: number
  baseRent: number
  startDate: string
  endDate: string
  status: LeaseStatus
}

type GanttRow = {
  name: string
  spacer: number
  duration: number
  status: LeaseStatus
  area: number
  baseRent: number
  startDate: string
  endDate: string
}

type Props = {
  leases: GanttLease[]
  fundStartDate?: string  // ISO — левая граница X-оси
  fundEndDate?: string    // ISO — правая граница X-оси
}

// ─── Константы ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<LeaseStatus, string> = {
  ACTIVE:      '#3b82f6',
  TERMINATING: '#f59e0b',
  EXPIRED:     '#9ca3af',
}

const STATUS_LABELS: Record<LeaseStatus, string> = {
  ACTIVE:      'Активный',
  TERMINATING: 'Расторгается',
  EXPIRED:     'Истёк',
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function dateToMonths(dateStr: string): number {
  const d = new Date(dateStr)
  return d.getFullYear() * 12 + d.getMonth()
}

// ─── Кастомный тултип ─────────────────────────────────────────────────────────

function GanttTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.[0]) return null
  // payload[0].payload — any в Recharts, кастуем к GanttRow
  const row = payload[0].payload as GanttRow
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-md p-3 text-sm min-w-[220px] space-y-1">
      <p className="font-semibold text-gray-900">{row.name}</p>
      <p className="text-xs flex items-center gap-1.5">
        <span
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: STATUS_COLORS[row.status] }}
        />
        <span className="text-gray-500">{STATUS_LABELS[row.status]}</span>
      </p>
      <p className="text-gray-600 text-xs">
        {formatDate(row.startDate)}
        {' '}—{' '}
        {formatDate(row.endDate)}
      </p>
      <p className="text-gray-600 text-xs">
        Площадь:{' '}
        <span className="font-medium text-gray-800">
          {row.area.toLocaleString('ru-RU')} м²
        </span>
      </p>
      <p className="text-gray-600 text-xs">
        Ставка:{' '}
        <span className="font-medium text-gray-800">
          {row.baseRent.toLocaleString('ru-RU')} ₽/м²/год
        </span>
      </p>
    </div>
  )
}

// ─── Кастомная форма бара (заменяет Cell для раскраски по статусу) ─────────────

function DurationBar(props: BarShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0 } = props
  if (width <= 0 || height <= 0) return null
  const row = props.payload as GanttRow | undefined
  const fill = row ? STATUS_COLORS[row.status] : '#3b82f6'
  const r = 2
  return (
    <rect x={x} y={y + 1} width={width} height={Math.max(0, height - 2)} rx={r} ry={r} fill={fill} />
  )
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export function GanttChart({ leases, fundStartDate, fundEndDate }: Props) {
  const { rows, minMonth, totalMonths, xTicks } = useMemo(() => {
    if (leases.length === 0) {
      return { rows: [], minMonth: 0, totalMonths: 12, xTicks: [0] }
    }

    const allMonths = leases.flatMap(l => [
      dateToMonths(l.startDate),
      dateToMonths(l.endDate),
    ])
    const minMonth = fundStartDate
      ? dateToMonths(fundStartDate)
      : Math.min(...allMonths)
    const maxMonth = fundEndDate
      ? dateToMonths(fundEndDate)
      : Math.max(...allMonths)
    const totalMonths = maxMonth - minMonth + 1

    const rows: GanttRow[] = leases.map(lease => {
      const start = dateToMonths(lease.startDate)
      const end   = dateToMonths(lease.endDate)
      const spacer   = Math.max(0, start - minMonth)
      const duration = Math.max(1, Math.min(end, maxMonth) - start)
      return {
        name:      lease.tenantName,
        spacer,
        duration,
        status:    lease.status,
        area:      lease.area,
        baseRent:  lease.baseRent,
        startDate: lease.startDate,
        endDate:   lease.endDate,
      }
    })

    // Тики: начало каждого года в диапазоне
    const xTicks: number[] = []
    const startYear = Math.ceil(minMonth / 12)
    const endYear   = Math.ceil(maxMonth / 12)
    for (let y = startYear; y <= endYear; y++) {
      const tick = y * 12 - minMonth
      if (tick >= 0 && tick <= totalMonths) xTicks.push(tick)
    }

    return { rows, minMonth, totalMonths, xTicks }
  }, [leases, fundStartDate, fundEndDate])

  if (leases.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        Нет договоров для отображения
      </div>
    )
  }

  const chartHeight = Math.max(160, rows.length * 36 + 52)

  return (
    <div>
      {/* Легенда статусов */}
      <div className="flex gap-4 text-xs text-gray-500 mb-3">
        {(Object.entries(STATUS_LABELS) as [LeaseStatus, string][]).map(
          ([status, label]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
              {label}
            </span>
          )
        )}
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 20, left: 0 }}
          barCategoryGap="30%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="#f3f4f6"
          />

          {/* X-ось: месяцы от начала фонда, подписи — годы */}
          <XAxis
            type="number"
            domain={[0, totalMonths]}
            ticks={xTicks}
            tickFormatter={(v: number) =>
              String(Math.floor((minMonth + v) / 12))
            }
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
          />

          {/* Y-ось: имена арендаторов */}
          <YAxis
            type="category"
            dataKey="name"
            width={160}
            tick={{ fontSize: 12, fill: '#4b5563' }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip
            content={GanttTooltip}
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          />

          {/* Прозрачный spacer — сдвигает bar к нужной X-позиции */}
          <Bar
            dataKey="spacer"
            stackId="g"
            fillOpacity={0}
            stroke="none"
            isAnimationActive={false}
          />

          {/* Основной bar — цвет по статусу через shape prop */}
          <Bar
            dataKey="duration"
            stackId="g"
            shape={DurationBar}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
