'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AddPropertyToFundModal } from '@/components/modals/AddPropertyToFundModal'
import { AddPropertyChoiceModal } from '@/components/modals/AddPropertyChoiceModal'
import { CreatePropertyInFundModal } from '@/components/modals/CreatePropertyInFundModal'
import { FundCashflowBlock } from './FundCashflowBlock'
import { FundGraphsBlock } from './FundGraphsBlock'
import { PropertiesTable } from '@/components/tables/PropertiesTable'
import { FundReportsTab } from './FundReportsTab'
import { FundBasicTab } from './FundBasicTab'
import type { ReturnPoint } from '@/components/charts/ReturnChart'
import { formatRub, formatPct, formatDate } from '@/lib/utils/format'
import type {
  NAVResult,
  ApiResponse,
  MonthlyCashflow,
  MonthlyCashRoll,
  FundStatus,
} from '@/lib/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

type PropertySummary = {
  id: string
  name: string
  type: 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'MIXED' | 'RESIDENTIAL'
  address: string
  totalArea: number
  rentableArea: number
  acquisitionPrice: number | null
  // V3.8.5 + V3.9.2: many-to-many + данные для отчётов
  ownershipPct: number
  exitCapRate: number | null
  purchaseDate: string | null
  saleDate: string | null
  wault: number
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
  // V4.6.2: поля для inline-редактирования
  upfrontFeeRate: number
  successFeeOperational: number
  successFeeExit: number
  status: FundStatus
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

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function aggregatePropertyCashflows(
  propertyCashflows: Record<string, MonthlyCashflow[]>,
): MonthlyCashflow[] {
  const values = Object.values(propertyCashflows)
  if (values.length === 0) return []
  const first = values[0]!
  return first.map((baseCf, i) => {
    const agg = { ...baseCf, tenants: [...baseCf.tenants] }
    for (let j = 1; j < values.length; j++) {
      const cf = values[j]![i]!
      agg.totalIncome += cf.totalIncome
      agg.opexReimbursementTotal += cf.opexReimbursementTotal
      agg.opex += cf.opex
      agg.propertyTax += cf.propertyTax
      agg.landTax += cf.landTax
      agg.maintenance += cf.maintenance
      agg.capex += cf.capex
      agg.noi += cf.noi
      agg.fcf += cf.fcf
      agg.tenants = [...agg.tenants, ...cf.tenants]
    }
    return agg
  })
}

function buildReturnPoints(
  navData: NAVResult[],
  cashRoll: MonthlyCashRoll[],
  totalEmission: number,
): ReturnPoint[] {
  if (totalEmission <= 0 || navData.length === 0) return []

  const distByYear = new Map<number, number>()
  for (const row of cashRoll) {
    const y = row.period.year
    distByYear.set(y, (distByYear.get(y) ?? 0) + row.distributionOutflow)
  }

  const navByYear = new Map<number, number>()
  for (const n of navData) {
    navByYear.set(n.period.year, n.nav)
  }

  const years = Array.from(new Set(navData.map(n => n.period.year))).sort((a, b) => a - b)
  if (years.length < 2) return []

  const points: ReturnPoint[] = []
  for (let i = 1; i < years.length; i++) {
    const year = years[i]!
    const navEnd = navByYear.get(year) ?? 0
    const navBegin = navByYear.get(years[i - 1]!) ?? 0
    const cashOnCash = (distByYear.get(year) ?? 0) / totalEmission
    const capitalGain = (navEnd - navBegin) / totalEmission
    points.push({ year, cashOnCash, capitalGain })
  }
  return points
}

// ─── Компонент ────────────────────────────────────────────────────────────────

// V4.6.1: три вкладки верхнего уровня. «Основное» — inline-редактирование (V4.6.2).
type FundTab = 'overview' | 'basic' | 'reports'

const FUND_TABS: { id: FundTab; label: string }[] = [
  { id: 'overview', label: 'Обзор'    },
  { id: 'basic',    label: 'Основное' },
  { id: 'reports',  label: 'Отчёты'   },
]

export function FundPage({ fund }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<FundTab>('overview')
  // V4.10.1–V4.10.2: режимы добавления объекта.
  //   'none'     — ничего не открыто
  //   'choice'   — модалка выбора способа
  //   'pipeline' — привязка из pipeline (AddPropertyToFundModal)
  //   'new'      — создание нового объекта сразу в фонде (CreatePropertyInFundModal)
  const [addMode, setAddMode] = useState<'none' | 'choice' | 'pipeline' | 'new'>('none')
  const [navData, setNavData] = useState<NAVResult[] | null>(null)
  const [cashflows, setCashflows] = useState<MonthlyCashflow[]>([])
  const [cashRoll, setCashRoll] = useState<MonthlyCashRoll[]>([])
  const [cfLoading, setCfLoading] = useState(true)
  const [cfError, setCfError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/nav/fund/${fund.id}`)
      .then(r => r.json() as Promise<ApiResponse<NAVResult[]>>)
      .then(json => { if (!json.error) setNavData(json.data) })
      .catch(() => { /* навигационные ошибки не блокируют страницу */ })
  }, [fund.id])

  useEffect(() => {
    setCfLoading(true)
    setCfError(null)

    fetch(`/api/cashflow/fund/${fund.id}`)
      .then(r => r.json() as Promise<ApiResponse<{
        cashRoll: MonthlyCashRoll[]
        propertyCashflows: Record<string, MonthlyCashflow[]>
      }>>)
      .then(json => {
        if (json.error) throw new Error(json.error)
        setCashRoll(json.data.cashRoll)
        setCashflows(aggregatePropertyCashflows(json.data.propertyCashflows))
      })
      .catch((err: unknown) => {
        setCfError(err instanceof Error ? err.message : 'Ошибка загрузки данных')
      })
      .finally(() => setCfLoading(false))
  }, [fund.id])

  const totalAcquisitionPrice = fund.properties.reduce(
    (s, p) => s + (p.acquisitionPrice ?? 0),
    0,
  )

  const returnPoints = navData && cashRoll.length > 0
    ? buildReturnPoints(navData, cashRoll, fund.totalEmission)
    : []

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

        {/* ── Вкладки ── */}
        <div className="flex items-center gap-1 border-b border-gray-200">
          {FUND_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ' +
                (activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700')
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && <>
        {/* ── Блок 1: Графики (4 режима — V4.6.3) ── */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Графики</h2>
          {cfLoading ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              <span className="animate-pulse">Расчёт денежного потока…</span>
            </div>
          ) : cfError ? (
            <div className="rounded-md bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {cfError}
            </div>
          ) : (
            <FundGraphsBlock
              navData={navData ?? []}
              cashflows={cashflows}
              returnPoints={returnPoints}
            />
          )}
        </section>

        {/* ── Блок 2: Таблицы денежных потоков (3 вкладки — V4.6.3) ── */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Таблица денежных потоков</h2>
          {cfLoading ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              <span className="animate-pulse">Расчёт денежного потока…</span>
            </div>
          ) : cfError ? (
            <div className="rounded-md bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {cfError}
            </div>
          ) : (
            <FundCashflowBlock
              cashflows={cashflows}
              cashRoll={cashRoll}
              totalAcquisitionPrice={totalAcquisitionPrice}
              navData={navData}
              fundStartDate={new Date(fund.startDate)}
              fundEndDate={new Date(fund.endDate)}
              totalUnits={fund.totalUnits}
            />
          )}
        </section>

        {/* ── Блок 3: Объекты фонда ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Объекты фонда
              <span className="ml-2 text-sm font-normal text-gray-500">
                {fund.properties.length} {objectWord(fund.properties.length)}
              </span>
            </h2>
            <button
              onClick={() => setAddMode('choice')}
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
            />
          )}
        </section>
        </>}

        {activeTab === 'basic' && (
          <FundBasicTab
            fund={{
              id: fund.id,
              name: fund.name,
              registrationNumber: fund.registrationNumber,
              startDate: fund.startDate,
              endDate: fund.endDate,
              totalEmission: fund.totalEmission,
              nominalUnitPrice: fund.nominalUnitPrice,
              totalUnits: fund.totalUnits,
              managementFeeRate: fund.managementFeeRate,
              fundExpensesRate: fund.fundExpensesRate,
              upfrontFeeRate: fund.upfrontFeeRate,
              successFeeOperational: fund.successFeeOperational,
              successFeeExit: fund.successFeeExit,
              distributionPeriodicity: fund.distributionPeriodicity,
              status: fund.status,
            }}
          />
        )}

        {activeTab === 'reports' && (
          <FundReportsTab
            fundId={fund.id}
            fundName={fund.name}
            totalEmission={fund.totalEmission}
            totalUnits={fund.totalUnits}
            cashRoll={cashRoll}
            navData={navData}
            cfLoading={cfLoading}
            cfError={cfError}
            properties={fund.properties.map(p => ({
              id: p.id,
              name: p.name,
              rentableArea: p.rentableArea,
              ownershipPct: p.ownershipPct,
              exitCapRate: p.exitCapRate,
              purchaseDate: p.purchaseDate,
              saleDate: p.saleDate,
              wault: p.wault,
            }))}
          />
        )}
      </main>

      {/* ── Модалка выбора способа добавления (V4.10.1) ── */}
      {addMode === 'choice' && (
        <AddPropertyChoiceModal
          onClose={() => setAddMode('none')}
          onSelectPipeline={() => setAddMode('pipeline')}
          onSelectNew={() => setAddMode('new')}
        />
      )}

      {/* ── Модальное окно «Добавить объект из pipeline» (V3.8.4) ── */}
      {addMode === 'pipeline' && (
        <AddPropertyToFundModal
          fundId={fund.id}
          onClose={() => setAddMode('none')}
          onSuccess={() => {
            setAddMode('none')
            router.refresh()
          }}
        />
      )}

      {/* ── Модалка создания нового объекта сразу в фонде (V4.10.2) ── */}
      {addMode === 'new' && (
        <CreatePropertyInFundModal
          fundId={fund.id}
          onClose={() => setAddMode('none')}
        />
      )}
    </div>
  )
}

function objectWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'объект'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'объекта'
  return 'объектов'
}
