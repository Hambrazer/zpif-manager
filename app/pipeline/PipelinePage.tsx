'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { PropertyCreateForm } from '@/components/forms/PropertyCreateForm'
import { formatRub, formatDate } from '@/lib/utils/format'

type PipelineStatus =
  | 'SCREENING'
  | 'DUE_DILIGENCE'
  | 'APPROVED'
  | 'IN_FUND'
  | 'REJECTED'
  | 'SOLD'

type PropertyType = 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'MIXED' | 'RESIDENTIAL'

export type PipelineProperty = {
  id: string
  name: string
  address: string
  type: PropertyType
  rentableArea: number
  pipelineStatus: PipelineStatus
  acquisitionPrice: number | null
  purchaseDate: string | null
  funds: { id: string; name: string }[]
}

type Props = {
  properties: PipelineProperty[]
}

type FilterValue = 'ALL' | PipelineStatus

const STATUS_LABELS: Record<PipelineStatus, string> = {
  SCREENING: 'Скрининг',
  DUE_DILIGENCE: 'Due Diligence',
  APPROVED: 'Одобрен',
  IN_FUND: 'В фонде',
  REJECTED: 'Отклонён',
  SOLD: 'Продан',
}

// Цвета badge для статусов (фон + текст)
const STATUS_BADGE_CLS: Record<PipelineStatus, string> = {
  SCREENING:     'bg-gray-100 text-gray-700',
  DUE_DILIGENCE: 'bg-yellow-100 text-yellow-800',
  APPROVED:      'bg-blue-100 text-blue-800',
  IN_FUND:       'bg-green-100 text-green-800',
  REJECTED:      'bg-red-100 text-red-700',
  SOLD:          'bg-gray-300 text-gray-800',
}

const FILTER_ORDER: FilterValue[] = [
  'ALL',
  'SCREENING',
  'DUE_DILIGENCE',
  'APPROVED',
  'IN_FUND',
  'REJECTED',
  'SOLD',
]

const FILTER_LABELS: Record<FilterValue, string> = {
  ALL: 'Все',
  ...STATUS_LABELS,
}

export function PipelinePage({ properties }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterValue>('ALL')
  const [showCreate, setShowCreate] = useState(false)

  // Подсчёт количества объектов по статусу (для бейджа в пилюлях фильтра)
  const counts = useMemo(() => {
    const map = new Map<FilterValue, number>()
    // «Все» по умолчанию исключает SOLD (архив)
    map.set('ALL', properties.filter(p => p.pipelineStatus !== 'SOLD').length)
    for (const status of Object.keys(STATUS_LABELS) as PipelineStatus[]) {
      map.set(status, properties.filter(p => p.pipelineStatus === status).length)
    }
    return map
  }, [properties])

  const filtered = useMemo(() => {
    if (filter === 'ALL') {
      return properties.filter(p => p.pipelineStatus !== 'SOLD')
    }
    return properties.filter(p => p.pipelineStatus === filter)
  }, [properties, filter])

  function handleCreated(propertyId: string) {
    setShowCreate(false)
    router.push(`/properties/${propertyId}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-semibold text-gray-900">
              ЗПИФ Менеджер
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/dashboard" className="text-gray-500 hover:text-gray-900">
                Портфель
              </Link>
              <span className="font-medium text-gray-900">Pipeline</span>
            </nav>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pipeline объектов</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {properties.length} {propertyWord(properties.length)} в базе
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Добавить объект
          </button>
        </div>

        {/* Фильтр по статусу */}
        <div className="flex flex-wrap gap-2 mb-5">
          {FILTER_ORDER.map(value => {
            const active = filter === value
            const count = counts.get(value) ?? 0
            return (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors ' +
                  (active
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50')
                }
              >
                <span>{FILTER_LABELS[value]}</span>
                <span
                  className={
                    'text-xs ' +
                    (active ? 'text-gray-300' : 'text-gray-400')
                  }
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Таблица объектов */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 py-16 text-center text-gray-400">
            <p className="text-base">Объектов нет</p>
            <p className="text-sm mt-1">
              {filter === 'ALL'
                ? 'Добавьте первый объект в pipeline'
                : 'В этом статусе пока ничего нет'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Название</th>
                  <th className="text-left px-4 py-3">Адрес</th>
                  <th className="text-right px-4 py-3">Площадь, м²</th>
                  <th className="text-left px-4 py-3">Статус</th>
                  <th className="text-left px-4 py-3">Фонды</th>
                  <th className="text-right px-4 py-3">Стоимость покупки</th>
                  <th className="text-left px-4 py-3">Дата покупки</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(prop => (
                  <tr
                    key={prop.id}
                    onClick={() => router.push(`/properties/${prop.id}`)}
                    className="border-b border-gray-50 last:border-0 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{prop.name}</td>
                    <td className="px-4 py-3 text-gray-600 truncate max-w-xs">{prop.address}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {prop.rentableArea.toLocaleString('ru-RU')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                          STATUS_BADGE_CLS[prop.pipelineStatus]
                        }
                      >
                        {STATUS_LABELS[prop.pipelineStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {prop.funds.length === 0 ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className="truncate inline-block max-w-[14rem]">
                          {prop.funds.map(f => f.name).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {prop.acquisitionPrice !== null
                        ? formatRub(prop.acquisitionPrice)
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {prop.purchaseDate
                        ? formatDate(prop.purchaseDate)
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">→</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── Модальное окно создания объекта (двухшаговый wizard) ── */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Добавить объект</h2>
            <PropertyCreateForm
              onSuccess={handleCreated}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function propertyWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'объект'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'объекта'
  return 'объектов'
}
