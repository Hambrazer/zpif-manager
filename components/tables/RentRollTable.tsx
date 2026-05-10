'use client'

import { formatRub, formatPct, formatDate } from '@/lib/utils/format'

type IndexationType = 'CPI' | 'FIXED' | 'NONE'
type LeaseStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATING'

export type RentRollLease = {
  id: string
  tenantName: string
  area: number
  baseRent: number
  startDate: string
  endDate: string
  indexationType: IndexationType
  indexationRate: number | null
  status: LeaseStatus
  vatIncluded: boolean
}

type Props = {
  leases: RentRollLease[]
  rentableArea: number
}

const STATUS_STYLES: Record<LeaseStatus, { label: string; cls: string }> = {
  ACTIVE:      { label: 'Активный',     cls: 'bg-green-100 text-green-700'   },
  EXPIRED:     { label: 'Истёк',        cls: 'bg-gray-100 text-gray-500'     },
  TERMINATING: { label: 'Расторгается', cls: 'bg-yellow-100 text-yellow-700' },
}

const INDEXATION_LABELS: Record<IndexationType, string> = {
  CPI:   'ИПЦ',
  FIXED: 'Фикс.',
  NONE:  'Нет',
}

const STATUS_ORDER: Record<LeaseStatus, number> = {
  ACTIVE:      0,
  TERMINATING: 1,
  EXPIRED:     2,
}

export function RentRollTable({ leases, rentableArea }: Props) {
  if (leases.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 py-16 text-center text-gray-400">
        <p className="text-base">Договоров нет</p>
      </div>
    )
  }

  const sorted = [...leases].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  const totalArea         = sorted.reduce((s, l) => s + l.area, 0)
  const totalAnnualIncome = sorted.reduce((s, l) => s + l.area * l.baseRent, 0)
  const weightedAvgRent   = totalArea > 0 ? totalAnnualIncome / totalArea : 0

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium uppercase tracking-wide">
              <th className="text-left px-4 py-3">Арендатор</th>
              <th className="text-right px-4 py-3">Площадь, м²</th>
              <th className="text-right px-4 py-3">% GLA</th>
              <th className="text-right px-4 py-3">Ставка, ₽/м²/год</th>
              <th className="text-right px-4 py-3">Годовой доход, ₽</th>
              <th className="text-left px-4 py-3">Начало</th>
              <th className="text-left px-4 py-3">Окончание</th>
              <th className="text-left px-4 py-3">Статус</th>
              <th className="text-left px-4 py-3">Индексация</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(lease => {
              const st          = STATUS_STYLES[lease.status]
              const glaShare    = rentableArea > 0 ? lease.area / rentableArea : 0
              const annualIncome = lease.area * lease.baseRent
              const isInactive  = lease.status !== 'ACTIVE'
              return (
                <tr
                  key={lease.id}
                  className={`border-b border-gray-50 last:border-0 ${isInactive ? 'opacity-55' : ''}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{lease.tenantName}</p>
                    {lease.vatIncluded && (
                      <p className="text-xs text-gray-400 mt-0.5">с НДС</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {lease.area.toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {formatPct(glaShare)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {lease.baseRent.toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">
                    {formatRub(annualIncome)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(lease.startDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(lease.endDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {INDEXATION_LABELS[lease.indexationType]}
                    {lease.indexationType === 'FIXED' && lease.indexationRate !== null && (
                      <span className="text-gray-400 ml-1">{formatPct(lease.indexationRate)}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium text-gray-700">
              <td className="px-4 py-3">Итого</td>
              <td className="px-4 py-3 text-right">
                {totalArea.toLocaleString('ru-RU')}
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {rentableArea > 0 ? formatPct(totalArea / rentableArea) : '—'}
              </td>
              <td className="px-4 py-3 text-right font-normal text-gray-500 text-xs">
                {weightedAvgRent > 0
                  ? `${weightedAvgRent.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ср.`
                  : '—'}
              </td>
              <td className="px-4 py-3 text-right">{formatRub(totalAnnualIncome)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
