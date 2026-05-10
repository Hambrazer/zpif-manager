'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PropertyForm } from '@/components/forms/PropertyForm'
import { FundCashflowBlock } from './FundCashflowBlock'
import { PropertiesTable } from '@/components/tables/PropertiesTable'
import { NavChart } from '@/components/charts/NavChart'
import { formatRub, formatPct, formatDate } from '@/lib/utils/format'
import type { NAVResult, ScenarioType, ApiResponse } from '@/lib/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

type PropertySummary = {
  id: string
  name: string
  type: 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'MIXED' | 'RESIDENTIAL'
  address: string
  totalArea: number
  rentableArea: number
  acquisitionPrice: number | null
}

type FundData = {
  id: string
  name: string
  registrationNumber: string | null
  startDate: string
  endDate: string
  totalEmission: number
  nominalUnitPrice: number
  totalUnits: number
  managementFeeRate: number
  fundExpensesRate: number
  distributionPeriodicity: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
  properties: PropertySummary[]
}

type Props = {
  fund: FundData
}

const PERIODICITY_LABELS: Record<FundData['distributionPeriodicity'], string> = {
  MONTHLY: 'Ежемесячно',
  QUARTERLY: 'Ежеквартально',
  ANNUAL: 'Ежегодно',
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export function FundPage({ fund }: Props) {
  const router = useRouter()
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('BASE')
  const [showAddProperty, setShowAddProperty] = useState(false)
  const [navData, setNavData] = useState<NAVResult[] | null>(null)

  useEffect(() => {
    fetch(`/api/nav/fund/${fund.id}`)
      .then(r => r.json() as Promise<ApiResponse<NAVResult[]>>)
      .then(json => { if (!json.error) setNavData(json.data) })
      .catch(() => { /* навигационные ошибки не блокируют страницу */ })
  }, [fund.id])

  function handlePropertyAdded() {
    setShowAddProperty(false)
    router.refresh()
  }

  const totalAcquisitionPrice = fund.properties.reduce(
    (s, p) => s + (p.acquisitionPrice ?? 0),
    0,
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/dashboard"
              className="text-sm text-gray-500 hover:text-gray-700 shrink-0"
            >
              ← Портфель
            </Link>
            <span className="text-gray-300 shrink-0">/</span>
            <span className="text-sm font-medium text-gray-900 truncate">{fund.name}</span>
          </div>
          <span className="text-lg font-semibold text-gray-900 shrink-0 ml-4">ЗПИФ Менеджер</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Заголовок фонда ── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{fund.name}</h1>
          {fund.registrationNumber && (
            <p className="text-sm text-gray-500 mt-1">Рег. № {fund.registrationNumber}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
            <span>
              Объём эмиссии:{' '}
              <span className="font-medium text-gray-900">{formatRub(fund.totalEmission)}</span>
            </span>
            <span>
              Паёв:{' '}
              <span className="font-medium text-gray-900">
                {fund.totalUnits.toLocaleString('ru-RU')}
              </span>
            </span>
            <span>
              Срок:{' '}
              <span className="font-medium text-gray-900">
                {formatDate(fund.startDate)} — {formatDate(fund.endDate)}
              </span>
            </span>
            <span>
              УК:{' '}
              <span className="font-medium text-gray-900">{formatPct(fund.managementFeeRate)}/год</span>
            </span>
            <span>
              Расходы фонда:{' '}
              <span className="font-medium text-gray-900">{formatPct(fund.fundExpensesRate)}/год</span>
            </span>
            <span>
              Выплаты:{' '}
              <span className="font-medium text-gray-900">
                {PERIODICITY_LABELS[fund.distributionPeriodicity]}
              </span>
            </span>
          </div>
        </div>

        {/* ── СЧА / РСП — график ── */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Динамика СЧА и РСП</h2>
          <NavChart data={navData ?? []} />
        </section>

        {/* ── Денежный поток фонда ── */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-6">Денежный поток фонда</h2>
          <FundCashflowBlock
            fundId={fund.id}
            totalAcquisitionPrice={totalAcquisitionPrice}
            totalEmission={fund.totalEmission}
            totalUnits={fund.totalUnits}
            navData={navData}
            activeScenario={activeScenario}
            onScenarioChange={setActiveScenario}
          />
        </section>

        {/* ── Объекты фонда ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Объекты фонда
              <span className="ml-2 text-sm font-normal text-gray-500">
                {fund.properties.length} {objectWord(fund.properties.length)}
              </span>
            </h2>
            <button
              onClick={() => setShowAddProperty(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Добавить объект
            </button>
          </div>

          {fund.properties.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 py-16 text-center text-gray-400">
              <p className="text-base">Объектов нет</p>
              <p className="text-sm mt-1">Добавьте первый объект в фонд</p>
            </div>
          ) : (
            <PropertiesTable
              fundId={fund.id}
              properties={fund.properties}
              scenario={activeScenario}
            />
          )}
        </section>
      </main>

      {/* ── Модальное окно добавления объекта ── */}
      {showAddProperty && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) setShowAddProperty(false)
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Добавить объект</h2>
            <PropertyForm
              fundId={fund.id}
              onSuccess={handlePropertyAdded}
              onCancel={() => setShowAddProperty(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function objectWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'объект'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'объекта'
  return 'объектов'
}
