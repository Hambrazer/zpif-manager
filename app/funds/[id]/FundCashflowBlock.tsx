'use client'

import { useState, useEffect } from 'react'
import { CashflowChart } from '@/components/charts/CashflowChart'
import { CashflowTable } from '@/components/tables/CashflowTable'
import { CashRollTable } from '@/components/tables/CashRollTable'
import { ReturnChart } from '@/components/charts/ReturnChart'
import type { ReturnPoint } from '@/components/charts/ReturnChart'
import { calcIRR } from '@/lib/calculations/dcf'
import { formatRub, formatPct } from '@/lib/utils/format'
import type {
  MonthlyCashflow,
  MonthlyCashRoll,
  NAVResult,
  ApiResponse,
} from '@/lib/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

type Props = {
  fundId: string
  totalAcquisitionPrice: number
  totalEmission: number
  totalUnits: number
  navData: NAVResult[] | null
}

type Metrics = {
  annualNOI: number | null
  annualFCF: number | null
  capRate: number | null
  irr: number | null
  nav: number | null
  rsp: number | null
}

type CfTab = 'cashflow' | 'cashroll'

// ─── Вычисления ───────────────────────────────────────────────────────────────

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
      agg.gri += cf.gri
      agg.vacancy += cf.vacancy
      agg.nri += cf.nri
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

function computeMetrics(
  cashflows: MonthlyCashflow[],
  acquisitionPrice: number,
  navData: NAVResult[] | null,
): Metrics {
  const base: Metrics = {
    annualNOI: null, annualFCF: null, capRate: null, irr: null, nav: null, rsp: null,
  }
  if (cashflows.length === 0) return base

  const firstYear = cashflows.slice(0, 12)
  const annualNOI = firstYear.reduce((s, cf) => s + cf.noi, 0)
  const annualFCF = firstYear.reduce((s, cf) => s + cf.fcf, 0)
  const capRate = acquisitionPrice > 0 ? annualNOI / acquisitionPrice : null

  let irr: number | null = null
  if (acquisitionPrice > 0) {
    const monthlyIRR = calcIRR([-acquisitionPrice, ...cashflows.map(cf => cf.fcf)])
    if (!isNaN(monthlyIRR)) irr = Math.pow(1 + monthlyIRR, 12) - 1
  }

  const lastNav = navData && navData.length > 0 ? navData[navData.length - 1] : null
  const nav = lastNav?.nav ?? null
  const rsp = lastNav?.rsp ?? null

  return { annualNOI, annualFCF, capRate, irr, nav, rsp }
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

// ─── Метрики-карточки ─────────────────────────────────────────────────────────

type MetricBox = { label: string; value: number | null; format: (v: number) => string }

function metricBoxes(m: Metrics): MetricBox[] {
  return [
    { label: 'NOI/год',  value: m.annualNOI, format: formatRub },
    { label: 'FCF/год',  value: m.annualFCF, format: formatRub },
    { label: 'Cap Rate', value: m.capRate,   format: formatPct },
    { label: 'IRR',      value: m.irr,       format: formatPct },
    { label: 'СЧА',      value: m.nav,       format: formatRub },
    { label: 'РСП',      value: m.rsp,       format: formatRub },
  ]
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export function FundCashflowBlock({
  fundId,
  totalAcquisitionPrice,
  totalEmission,
  navData,
}: Props) {
  const [cashflows, setCashflows] = useState<MonthlyCashflow[]>([])
  const [cashRoll, setCashRoll] = useState<MonthlyCashRoll[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cfTab, setCfTab] = useState<CfTab>('cashflow')

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`/api/cashflow/fund/${fundId}`)
      .then(r => r.json() as Promise<ApiResponse<{ cashRoll: MonthlyCashRoll[]; propertyCashflows: Record<string, MonthlyCashflow[]> }>>)
      .then(json => {
        if (json.error) throw new Error(json.error)
        setCashRoll(json.data.cashRoll)
        setCashflows(aggregatePropertyCashflows(json.data.propertyCashflows))
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки данных')
      })
      .finally(() => setLoading(false))
  }, [fundId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        <span className="animate-pulse">Расчёт денежного потока…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
        {error}
      </div>
    )
  }

  const metrics = computeMetrics(cashflows, totalAcquisitionPrice, navData)
  const returnPoints = navData && cashRoll
    ? buildReturnPoints(navData, cashRoll, totalEmission)
    : []

  return (
    <div className="space-y-6">

      {/* ── Метрики ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {metricBoxes(metrics).map(({ label, value, format }) => (
          <div key={label} className="bg-gray-50 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-base font-semibold text-gray-900 mt-0.5 truncate">
              {value !== null ? format(value) : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* ── График NOI / FCF ── */}
      <CashflowChart cashflows={cashflows} />

      {/* ── Переключатель таблиц ── */}
      <div className="flex items-center gap-1 border-b border-gray-200 pb-0">
        {([
          { id: 'cashflow', label: 'Денежный поток' },
          { id: 'cashroll', label: 'Кэш-ролл' },
        ] as { id: CfTab; label: string }[]).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCfTab(tab.id)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              cfTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Таблица CF / Кэш-ролл ── */}
      {cfTab === 'cashflow' ? (
        <CashflowTable cashflows={cashflows} variant="fund" />
      ) : (
        <CashRollTable data={cashRoll ?? []} />
      )}

      {/* ── Доходность по годам ── */}
      {returnPoints.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Доходность по годам</p>
          <ReturnChart data={returnPoints} />
        </div>
      )}
    </div>
  )
}
