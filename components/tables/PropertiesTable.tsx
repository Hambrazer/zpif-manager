'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatRub, formatPct } from '@/lib/utils/format'
import type { ApiResponse } from '@/lib/types'
import type { PropertyMetrics } from '@/app/api/cashflow/fund/[id]/properties/route'

type PropertyType = 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'MIXED' | 'RESIDENTIAL'

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  OFFICE: 'Офис',
  WAREHOUSE: 'Склад',
  RETAIL: 'Торговый',
  MIXED: 'Смешанный',
  RESIDENTIAL: 'Жилой',
}

export type PropertySummary = {
  id: string
  name: string
  type: PropertyType
  address: string
  totalArea: number
  rentableArea: number
  acquisitionPrice: number | null
}

type Props = {
  fundId: string
  properties: PropertySummary[]
}

// Skeleton cell shown while metrics are loading
function SkeletonCell({ width }: { width: string }) {
  return (
    <span
      className={`inline-block h-3 rounded bg-gray-100 animate-pulse ${width}`}
    />
  )
}

export function PropertiesTable({ fundId, properties }: Props) {
  const router = useRouter()
  const [metricsMap, setMetricsMap] = useState<Map<string, PropertyMetrics> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`/api/cashflow/fund/${fundId}/properties`)
      .then((r) => r.json() as Promise<ApiResponse<PropertyMetrics[]>>)
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setMetricsMap(new Map(json.data.map((m) => [m.id, m])))
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки метрик')
      })
      .finally(() => setLoading(false))
  }, [fundId])

  const totalGLA = properties.reduce((s, p) => s + p.rentableArea, 0)

  // Footer aggregates (computed only when data is ready)
  let footerOccupancy: number | null = null
  let footerNOI: number | null = null

  if (!loading && metricsMap) {
    const totalActive = properties.reduce((s, p) => {
      const m = metricsMap.get(p.id)
      return s + (m ? m.occupancy * p.rentableArea : 0)
    }, 0)
    footerOccupancy = totalGLA > 0 ? totalActive / totalGLA : 0

    footerNOI = properties.reduce((s, p) => {
      const m = metricsMap.get(p.id)
      return s + (m ? m.annualNOI : 0)
    }, 0)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium uppercase tracking-wide">
            <th className="text-left px-4 py-3">Название</th>
            <th className="text-left px-4 py-3">Тип</th>
            <th className="text-right px-4 py-3">GLA, м²</th>
            <th className="text-right px-4 py-3">Загрузка</th>
            <th className="text-right px-4 py-3">NOI/год</th>
            <th className="text-right px-4 py-3">Cap Rate</th>
            <th className="text-right px-4 py-3">Cap Rate выхода</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((prop) => {
            const m = metricsMap?.get(prop.id)
            return (
              <tr
                key={prop.id}
                onClick={() => router.push(`/properties/${prop.id}`)}
                className="border-b border-gray-50 last:border-0 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                {/* Название */}
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{prop.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{prop.address}</p>
                </td>

                {/* Тип */}
                <td className="px-4 py-3 text-gray-600">{PROPERTY_TYPE_LABELS[prop.type]}</td>

                {/* GLA */}
                <td className="px-4 py-3 text-right text-gray-700">
                  {prop.rentableArea.toLocaleString('ru-RU')}
                </td>

                {/* Загрузка */}
                <td className="px-4 py-3 text-right">
                  {loading ? (
                    <SkeletonCell width="w-12" />
                  ) : m !== undefined ? (
                    <span
                      className={
                        m.occupancy >= 0.9
                          ? 'font-medium text-green-600'
                          : m.occupancy >= 0.7
                          ? 'text-gray-700'
                          : 'text-red-500'
                      }
                    >
                      {formatPct(m.occupancy)}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>

                {/* NOI/год */}
                <td className="px-4 py-3 text-right">
                  {loading ? (
                    <SkeletonCell width="w-24" />
                  ) : m !== undefined ? (
                    <span className="text-gray-700">{formatRub(m.annualNOI)}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>

                {/* Cap Rate */}
                <td className="px-4 py-3 text-right">
                  {loading ? (
                    <SkeletonCell width="w-12" />
                  ) : m !== undefined && m.capRate !== null ? (
                    <span className="text-gray-700">{formatPct(m.capRate)}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>

                {/* Cap Rate выхода */}
                <td className="px-4 py-3 text-right">
                  {loading ? (
                    <SkeletonCell width="w-12" />
                  ) : m !== undefined && m.exitCapRate !== null ? (
                    <span className="text-gray-700">{formatPct(m.exitCapRate)}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50 text-sm font-medium text-gray-700">
            <td className="px-4 py-3" colSpan={2}>
              Итого
            </td>
            <td className="px-4 py-3 text-right">
              {totalGLA.toLocaleString('ru-RU')}
            </td>
            <td className="px-4 py-3 text-right">
              {footerOccupancy !== null ? (
                formatPct(footerOccupancy)
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-right">
              {footerNOI !== null ? (
                formatRub(footerNOI)
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-right text-gray-300">—</td>
            <td className="px-4 py-3 text-right text-gray-300">—</td>
          </tr>
        </tfoot>
      </table>

      {error && (
        <div className="border-t border-gray-100 px-4 py-3 text-sm text-red-500">{error}</div>
      )}
    </div>
  )
}
