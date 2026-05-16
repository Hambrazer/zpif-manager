'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { type FundStatus } from '@prisma/client'
import { FundForm } from '@/components/forms/FundForm'
import { formatRub, formatPct } from '@/lib/utils/format'

// V4.3.3: значения query-параметра `?status=` на /dashboard.
export type FundStatusFilter = 'active' | 'closed' | 'archived' | 'all'

const FILTER_TABS: { value: FundStatusFilter; label: string }[] = [
  { value: 'active',   label: 'Активные' },
  { value: 'closed',   label: 'Закрытые' },
  { value: 'archived', label: 'Архивные' },
  { value: 'all',      label: 'Все' },
]

export type FundSummary = {
  id: string
  name: string
  registrationNumber: string | null
  status: FundStatus
  // V4.4.3: статус reference point на «сегодня». Влияет на отображение карточки.
  referenceStatus: 'not_started' | 'active' | 'closed'
  totalUnits: number
  propertyCount: number
  annualNOI: number | null
  irr: number | null
  nav: number | null
  navPerUnit: number | null
  occupancy: number | null
}

type Props = {
  funds: FundSummary[]
  currentFilter: FundStatusFilter
}

export function FundsDashboard({ funds, currentFilter }: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)

  function handleCreated() {
    setShowCreate(false)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold text-gray-900">ЗПИФ Менеджер</span>
            <nav className="flex items-center gap-4 text-sm">
              <span className="font-medium text-gray-900">Портфель</span>
              <Link href="/pipeline" className="text-gray-500 hover:text-gray-900">
                Pipeline
              </Link>
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
            <h1 className="text-2xl font-bold text-gray-900">Портфель</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {funds.length} {fundWord(funds.length)}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Создать фонд
          </button>
        </div>

        <FilterTabs currentFilter={currentFilter} />

        {funds.length > 0 && <PortfolioSummaryBar funds={funds} />}

        {funds.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-base">Фондов нет</p>
            <p className="text-sm mt-1">Создайте первый фонд, чтобы начать работу</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {funds.map(fund => (
              <FundCard key={fund.id} fund={fund} />
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Создать фонд</h2>
            <FundForm
              onSuccess={handleCreated}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function FilterTabs({ currentFilter }: { currentFilter: FundStatusFilter }) {
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {FILTER_TABS.map(tab => {
        const isActive = tab.value === currentFilter
        return (
          <Link
            key={tab.value}
            href={tab.value === 'active' ? '/dashboard' : `/dashboard?status=${tab.value}`}
            className={[
              'px-3 py-1.5 text-sm rounded-full border transition-colors',
              isActive
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: FundStatus }) {
  if (status === 'ACTIVE') return null
  const isClosed = status === 'CLOSED'
  return (
    <span
      className={[
        'inline-block text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded',
        isClosed
          ? 'bg-amber-100 text-amber-700'
          : 'bg-gray-200 text-gray-600',
      ].join(' ')}
    >
      {isClosed ? 'Закрыт' : 'Архив'}
    </span>
  )
}

function FundCard({ fund }: { fund: FundSummary }) {
  return (
    <Link
      href={`/funds/${fund.id}`}
      className="block bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-semibold text-gray-900 leading-snug truncate">{fund.name}</h2>
          <StatusBadge status={fund.status} />
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap mt-0.5">
          {fund.propertyCount} {propertyWord(fund.propertyCount)}
        </span>
      </div>
      {fund.registrationNumber ? (
        <p className="text-xs text-gray-400 mb-4">№ {fund.registrationNumber}</p>
      ) : (
        <div className="mb-4" />
      )}

      {fund.referenceStatus === 'not_started' ? (
        <div className="border-t border-gray-100 pt-4 text-sm text-amber-700 bg-amber-50 -mx-5 -mb-5 px-5 py-3 rounded-b-lg">
          Фонд не начался — метрики появятся после старта
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-3 border-t border-gray-100 pt-4">
          <Metric
            label="СЧА"
            value={fund.nav !== null ? formatRub(fund.nav) : '—'}
          />
          <Metric
            label="Стоимость пая"
            value={fund.navPerUnit !== null ? formatRub(fund.navPerUnit) : '—'}
          />
          <Metric
            label="IRR"
            value={fund.irr !== null ? formatPct(fund.irr) : '—'}
          />
          <Metric
            label="NOI/год"
            value={fund.annualNOI !== null ? formatRub(fund.annualNOI) : '—'}
          />
          <Metric
            label="Загрузка"
            value={fund.occupancy !== null ? formatPct(fund.occupancy) : '—'}
          />
          <Metric
            label="Паёв"
            value={fund.totalUnits.toLocaleString('ru-RU')}
          />
        </div>
      )}
    </Link>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 leading-tight">{label}</p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">{value}</p>
    </div>
  )
}

function PortfolioSummaryBar({ funds }: { funds: FundSummary[] }) {
  const totalProperties = funds.reduce((s, f) => s + f.propertyCount, 0)

  const fundsWithNOI = funds.filter(f => f.annualNOI !== null)
  const totalNOI = fundsWithNOI.length > 0
    ? fundsWithNOI.reduce((s, f) => s + (f.annualNOI ?? 0), 0)
    : null

  const fundsWithNAV = funds.filter(f => f.nav !== null)
  const totalNAV = fundsWithNAV.length > 0
    ? fundsWithNAV.reduce((s, f) => s + (f.nav ?? 0), 0)
    : null

  // IRR: средневзвешенный по NAV; fallback — простое среднее
  let portfolioIRR: number | null = null
  const fundsWithIRR = funds.filter(f => f.irr !== null)
  if (fundsWithIRR.length > 0) {
    const totalWeight = fundsWithIRR.reduce((s, f) => s + Math.abs(f.nav ?? 0), 0)
    if (totalWeight > 0) {
      portfolioIRR = fundsWithIRR.reduce(
        (s, f) => s + (f.irr ?? 0) * Math.abs(f.nav ?? 0), 0
      ) / totalWeight
    } else {
      portfolioIRR = fundsWithIRR.reduce((s, f) => s + (f.irr ?? 0), 0) / fundsWithIRR.length
    }
  }

  const fundsWithOcc = funds.filter(f => f.occupancy !== null)
  const avgOccupancy = fundsWithOcc.length > 0
    ? fundsWithOcc.reduce((s, f) => s + (f.occupancy ?? 0), 0) / fundsWithOcc.length
    : null

  const items: { label: string; value: string }[] = [
    { label: 'Объектов всего', value: String(totalProperties) },
    { label: 'NAV портфеля', value: totalNAV !== null ? formatRub(totalNAV) : '—' },
    { label: 'NOI портфеля/год', value: totalNOI !== null ? formatRub(totalNOI) : '—' },
    { label: 'IRR портфеля', value: portfolioIRR !== null ? formatPct(portfolioIRR) : '—' },
    { label: 'Средняя загрузка', value: avgOccupancy !== null ? formatPct(avgOccupancy) : '—' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-4 mb-6 flex flex-wrap gap-x-8 gap-y-3">
      {items.map(item => (
        <div key={item.label}>
          <p className="text-xs text-gray-400">{item.label}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

function fundWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'фонд'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'фонда'
  return 'фондов'
}

function propertyWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'объект'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'объекта'
  return 'объектов'
}
