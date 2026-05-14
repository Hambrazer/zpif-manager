'use client'

import { useState } from 'react'
import { CashflowTable } from '@/components/tables/CashflowTable'
import { CashRollTable } from '@/components/tables/CashRollTable'
import { calcIRR } from '@/lib/calculations/dcf'
import { formatRub, formatPct } from '@/lib/utils/format'
import type {
  MonthlyCashflow,
  MonthlyCashRoll,
  NAVResult,
} from '@/lib/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

type Props = {
  cashflows: MonthlyCashflow[]
  cashRoll: MonthlyCashRoll[]
  totalAcquisitionPrice: number
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

// ─── Метрики ──────────────────────────────────────────────────────────────────

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
  cashflows,
  cashRoll,
  totalAcquisitionPrice,
  navData,
}: Props) {
  const [cfTab, setCfTab] = useState<CfTab>('cashflow')

  const metrics = computeMetrics(cashflows, totalAcquisitionPrice, navData)

  const tabs: { id: CfTab; label: string }[] = [
    { id: 'cashflow', label: 'Денежный поток' },
    { id: 'cashroll', label: 'Кэш-ролл' },
  ]

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

      {/* ── Переключатель таблиц ── */}
      <div className="flex items-center gap-1 border-b border-gray-200 pb-0">
        {tabs.map(tab => (
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
        <CashRollTable data={cashRoll} />
      )}
    </div>
  )
}
